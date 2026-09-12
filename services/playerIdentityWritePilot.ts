import type { PrismaClient, Prisma } from "../app/generated/prisma/client"
import { isDeepStrictEqual } from "node:util"
import { createHash } from "node:crypto"
import { getBarcelonaIdentityBatch, prepareBarcelonaIdentityMatch,
  requireBarcelonaWriteAllowlist, requireCurrentBarcelonaEvidence,
  type BarcelonaIdentityBatchId, type IdentityWriteEvidence, type PreparedIdentityMatch } from "./barcelonaIdentityWritePolicy"
import { persistPlayerApiFootballMatchAtomically, type AtomicMatchResult, type AtomicIdentityMatch } from "./playerIdentityAtomicPersistence"

export const IDENTITY_AUDIT_TABLES = ["Player", "ApiFootballPlayerMatchAttempt", "Club", "League", "PlayerAttributes",
  "ApiFootballTeamRosterCache", "SyncState", "SyncError", "ClubOfficialLineupSnapshot"] as const
export type IdentityWriteAudit = {
  tables: Record<typeof IDENTITY_AUDIT_TABLES[number], { count: string; hash: string }>
  players: { id: string; apiFootballId: number | null; protectedHash: string; hash: string }[]
  attempts: { id: string; playerId: string; hash: string; data: Record<string, unknown> }[]
}

export async function readIdentityWriteAudit(tx: Prisma.TransactionClient): Promise<IdentityWriteAudit> {
  const tables = {} as IdentityWriteAudit["tables"]
  for (const table of IDENTITY_AUDIT_TABLES) {
    // Identifiers come ONLY from the closed constant above. Values use bind parameters elsewhere.
    tables[table] = (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash FROM "${table}" t`))[0]
  }
  const players = await tx.$queryRawUnsafe<IdentityWriteAudit["players"]>(
    `SELECT id, "apiFootballId", md5((to_jsonb(t) - 'apiFootballId' - 'updatedAt')::text) AS "protectedHash",
     md5(to_jsonb(t)::text) AS hash FROM "Player" t ORDER BY id`)
  const attempts = await tx.$queryRawUnsafe<IdentityWriteAudit["attempts"]>(
    `SELECT id, "playerId", md5(to_jsonb(t)::text) AS hash, to_jsonb(t) AS data FROM "ApiFootballPlayerMatchAttempt" t ORDER BY id`)
  return { tables, players, attempts }
}

// Constructing the adapter does not open a connection or execute a query.
export function createPrismaIdentityWriteDependencies(db: PrismaClient, clock: () => Date = () => new Date(),
  batchId: BarcelonaIdentityBatchId = "first-five") {
  const pin = getBarcelonaIdentityBatch(batchId).evidence
  return {
    clock,
    loadEvidence: () => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const cache = await tx.apiFootballTeamRosterCache.findUnique({ where: { apiTeamId_season: { apiTeamId: 529, season: 2026 } } })
      const hash = await tx.$queryRawUnsafe<{ hash: string }[]>(
        'SELECT md5(to_jsonb(t)::text) AS hash FROM "ApiFootballTeamRosterCache" t WHERE id = $1', pin.cacheId)
      const snapshot = await tx.clubOfficialLineupSnapshot.findUnique({ where: { id: pin.snapshotId } })
      const catalog = await tx.player.findMany({ select: {
        id: true, slug: true, externalId: true, name: true, apiFootballId: true, dateOfBirth: true, nationality: true,
        position: true, secondaryPositions: true, clubId: true, updatedAt: true,
        club: { select: { name: true, apiFootballId: true } }, apiFootballMatchAttempt: { select: { status: true, nextRetryAt: true } },
      } })
      return { cache, cacheRowHash: hash[0]?.hash ?? null, snapshot,
        players: catalog.map(({ apiFootballMatchAttempt, ...p }) => ({ ...p, attempt: apiFootballMatchAttempt })) }
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 }),
    audit: () => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      return readIdentityWriteAudit(tx)
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 }),
    persist: (match: PreparedIdentityMatch) => persistPlayerApiFootballMatchAtomically(db, match, clock, batchId),
  }
}

// Validate the exact delta, not merely the increase in global counts.
export function assertIdentityWriteAudit(before: IdentityWriteAudit, after: IdentityWriteAudit,
  matches: readonly AtomicIdentityMatch[], results: readonly AtomicMatchResult[]) {
  const fail = (): never => { throw new Error("IDENTITY_WRITE_AUDIT_FAILED") }
  const committed = matches.filter(m => results.some(r => r.playerId === m.identity.id && r.providerId === m.providerId && r.status === "MATCHED"))
  for (const table of IDENTITY_AUDIT_TABLES) {
    if (table !== "Player" && table !== "ApiFootballPlayerMatchAttempt" && !isDeepStrictEqual(before.tables[table], after.tables[table])) fail()
  }
  if (before.tables.Player.count !== after.tables.Player.count || before.players.length !== after.players.length ||
      Number(after.tables.ApiFootballPlayerMatchAttempt.count) !== Number(before.tables.ApiFootballPlayerMatchAttempt.count) + committed.length) fail()
  const afterPlayers = new Map(after.players.map(p => [p.id, p]))
  for (const p of before.players) {
    const current = afterPlayers.get(p.id), match = committed.find(m => m.identity.id === p.id)
    if (!current) fail()
    if (match) {
      if (p.apiFootballId !== null || current!.apiFootballId !== match.providerId || p.protectedHash !== current!.protectedHash) fail()
    } else if (p.hash !== current!.hash) fail()
  }
  const afterAttempts = new Map(after.attempts.map(a => [a.id, a]))
  for (const a of before.attempts) if (afterAttempts.get(a.id)?.hash !== a.hash) fail()
  const oldIds = new Set(before.attempts.map(a => a.id)), added = after.attempts.filter(a => !oldIds.has(a.id))
  if (added.length !== committed.length || new Set(added.map(a => a.playerId)).size !== added.length) fail()
  for (const m of committed) {
    const a = added.find(a => a.playerId === m.identity.id)?.data
    if (!a || a.status !== "matched" || a.attempts !== 1 || a.lastApiFootballId !== m.providerId ||
        a.lastConfidence !== m.confidence || a.lastNameScore !== m.nameScore || a.lastBirthMatches !== m.birthMatches ||
        a.lastNationalityMatches !== m.nationalityMatches || a.lastClubMatches !== m.clubMatches || a.nextRetryAt !== null ||
        a.lastReason !== "API-Football identity pilot: AUTO_MATCH; atomic association." || !a.lastTriedAt) fail()
  }
}

export type IdentityAuthorizationMatch = Pick<PreparedIdentityMatch, "providerId" | "confidence" | "margin" | "cacheRowHash" | "snapshotHash"> & {
  identity: Pick<PreparedIdentityMatch["identity"], "id" | "slug" | "updatedAt">
}

export function identityPreWriteSummary(matches: readonly IdentityAuthorizationMatch[]) {
  // Serialization is deliberately independent of input property insertion order and local timezone.
  // Scope validation belongs to the gate; hashing must also distinguish reordered/changed IDs.
  return { authorizationSummaryVersion: 2, players: matches.map(m => ({
    playerId: m.identity.id, slug: m.identity.slug, providerId: m.providerId,
    confidence: m.confidence, margin: m.margin, cacheRowHash: m.cacheRowHash,
    snapshotHash: m.snapshotHash, expectedUpdatedAt: m.identity.updatedAt.toISOString(),
  })) }
}

// Confirmation of one exact summary, not a secret and NOT a way to enable the CLI.
export function identityWriteAuthorization(matches: readonly IdentityAuthorizationMatch[]) {
  return "AUTHORIZE_BARCELONA_IDENTITY_V2:" + createHash("sha256")
    .update(JSON.stringify(identityPreWriteSummary(matches)), "utf8").digest("hex")
}

class AuthorizationMismatch extends Error {
  constructor() { super("AUTHORIZATION_MISMATCH") }
}

export function requireIdentityWriteAuthorization(matches: readonly IdentityAuthorizationMatch[], authorization: string) {
  if (authorization !== identityWriteAuthorization(matches)) throw new AuthorizationMismatch()
}

export class IdentityWritePreconditionError extends Error {
  constructor(readonly status: AtomicMatchResult["status"]) { super(status) }
}

export type IdentityWriteDependencies = {
  clock: () => Date
  loadEvidence: () => Promise<IdentityWriteEvidence>
  audit: () => Promise<IdentityWriteAudit>
  persist: (match: PreparedIdentityMatch) => Promise<AtomicMatchResult>
  requirePristine?: boolean
  onAudit?: (phase: "BEFORE" | "AFTER", audit: IdentityWriteAudit, result?: AtomicMatchResult) => void
}

// CLI guards and explicit summary confirmation must pass before invoking this orchestration.
export async function runPreparedBarcelonaIdentityWrites(prepared: readonly PreparedIdentityMatch[], deps: IdentityWriteDependencies, authorization: string,
  batchId: BarcelonaIdentityBatchId = "first-five") {
  const matches = structuredClone([...prepared])
  requireIdentityWriteAuthorization(matches, authorization)
  requireBarcelonaWriteAllowlist(matches.map(m => m.identity.id), batchId)
  const { targets } = getBarcelonaIdentityBatch(batchId)
  if (matches.some((m, i) => m.providerId !== targets[i].providerId)) throw new Error("PROVIDER_ALLOWLIST_MISMATCH")
  const before = await deps.audit(), results: AtomicMatchResult[] = []
  deps.onAudit?.("BEFORE", before)
  let stopped = false, auditFailure = false, after: IdentityWriteAudit | null = null
  for (const original of matches) {
    let result: AtomicMatchResult
    let persistenceStarted = false
    try {
      const evidence = await deps.loadEvidence(), now = deps.clock()
      requireCurrentBarcelonaEvidence(evidence, now, batchId)
      const player = evidence.players.find(p => p.id === original.identity.id)
      if (evidence.players.some(p => p.apiFootballId === original.providerId && p.id !== original.identity.id)) {
        throw new IdentityWritePreconditionError("CONFLICT_PROVIDER_ID_TAKEN")
      }
      if (deps.requirePristine && (!player || player.apiFootballId !== null || player.attempt)) {
        throw new IdentityWritePreconditionError("VALIDATION_FAILURE")
      }
      // For an existing association the transaction decides no-op/conflict; never manufacture AUTO_MATCH.
      const current = player?.apiFootballId === null ? prepareBarcelonaIdentityMatch(evidence, original.identity.id, now, batchId) : original
      // Even a no-op/conflict path must not reuse authorization for a stale slug or version.
      const reviewed = { ...current, identity: { ...current.identity,
        slug: player?.slug ?? current.identity.slug, updatedAt: player?.updatedAt ?? current.identity.updatedAt } }
      requireIdentityWriteAuthorization(matches.map(m => m.identity.id === original.identity.id ? reviewed : m), authorization)
      if (player?.apiFootballId === null && !isDeepStrictEqual(current, original)) throw new Error("AUTHORIZED_IDENTITY_CHANGED")
      persistenceStarted = true
      result = await deps.persist(current)
    } catch (error) {
      result = { status: error instanceof AuthorizationMismatch ? "AUTHORIZATION_MISMATCH" : error instanceof IdentityWritePreconditionError ? error.status : persistenceStarted ? "INDETERMINATE_COMMIT" : "VALIDATION_FAILURE",
        playerId: original.identity.id, providerId: original.providerId }
    }
    results.push(result)
    try {
      after = await deps.audit()
      assertIdentityWriteAudit(before, after, matches, results)
      deps.onAudit?.("AFTER", after, result)
    } catch { auditFailure = true }
    if (auditFailure || !["MATCHED", "ALREADY_MATCHED_SAME_ID"].includes(result.status)) { stopped = true; break }
  }
  return { results, stopped, auditFailure, before, after,
    committedPlayerIds: results.filter(r => r.status === "MATCHED").map(r => r.playerId),
    untouchedPlayerIds: matches.slice(results.length).map(m => m.identity.id) }
}
