import { isDeepStrictEqual } from "node:util"
import type { PrismaClient, Prisma } from "../app/generated/prisma/client"
import { runMultiClubIdentityReadOnly } from "./multiClubIdentityReadRepository"
import { CLUB_IDENTITY_AUDIT_TABLES } from "./clubPlayerIdentityReadRepository"
import { prepareMultiClubIdentitySummary, deferMultiClubCandidates, prepareMultiClubEnvelope,
  multiClubPreparationHash, requireSameMultiClubPreparation, type MultiClubPreparation } from "./multiClubIdentityAuthorization"

export const FIRST_MULTI_CLUB_COHORT = [
  { clubSlug: "atletico-de-madrid", teamId: 530 }, { clubSlug: "arsenal", teamId: 42 },
  { clubSlug: "chelsea", teamId: 49 }, { clubSlug: "liverpool", teamId: 40 }, { clubSlug: "man-utd", teamId: 33 },
] as const
type Audit = { tables: Record<string, { count: string; hash: string }>; associated: number }
export type MultiClubPreflightPins = {
  baseline: Audit
  clubs: { clubSlug: string; teamId: number; cacheRowHash: string }[]
  candidateSets: { clubSlug: string; autoCandidates: { playerId: string; providerId: number }[] }[]
}
export type SelectedIdentityState = {
  id: string; slug: string; clubId: string | null; apiFootballId: number | null; updatedAt: Date
  apiFootballMatchAttempt: { status: string } | null
}
export function validateMultiClubPreflightPins(p: MultiClubPreflightPins) {
  if (!isDeepStrictEqual(p.clubs.map(({ clubSlug, teamId }) => ({ clubSlug, teamId })), FIRST_MULTI_CLUB_COHORT) ||
      p.clubs.some(c => !/^[a-f0-9]{32}$/.test(c.cacheRowHash)) ||
      p.baseline.associated !== 92 || p.baseline.tables.Player?.count !== "16228" ||
      p.baseline.tables.ApiFootballPlayerMatchAttempt?.count !== "91" ||
      !isDeepStrictEqual(Object.keys(p.baseline.tables).sort(), [...CLUB_IDENTITY_AUDIT_TABLES].sort()) ||
      Object.values(p.baseline.tables).some(v => !/^[a-f0-9]{32}$/.test(v.hash) || !/^\d+$/.test(v.count)) ||
      !isDeepStrictEqual(p.candidateSets.map(c => c.clubSlug), FIRST_MULTI_CLUB_COHORT.map(c => c.clubSlug))) {
    throw new Error("INVALID_PREFLIGHT_PINS")
  }
}
// Independent bulk state check. Failed original members are removed, NEVER replenished.
export function revalidateSelectedMultiClubCandidates(p: MultiClubPreparation, rows: SelectedIdentityState[]) {
  requireSameMultiClubPreparation(p, p)
  const failures: { playerId: string; reason: string }[] = []
  for (const c of p.summary.selectionOrder) {
    const local = rows.filter(r => r.id === c.playerId)
    const row = local[0]
    const reason = local.length !== 1 ? "PLAYER_MISSING_OR_DUPLICATE" :
      row.slug !== c.slug ? "SLUG_MISMATCH" :
      row.clubId !== c.clubId ? "CLUB_MISMATCH" :
      row.apiFootballId !== null ? "ALREADY_ASSOCIATED" :
      row.apiFootballMatchAttempt !== null ? "ATTEMPT_EXISTS" :
      row.updatedAt.toISOString() !== c.expectedUpdatedAt ? "UPDATED_AT_CHANGED" :
      rows.some(r => r.apiFootballId === c.providerId) ? "PROVIDER_OWNERSHIP_MISMATCH" : null
    if (reason) failures.push({ playerId: c.playerId, reason })
  }
  return { preparation: failures.length ? deferMultiClubCandidates(p, failures) : p, failures, requiresNewPreflight: failures.length > 0 }
}
async function readOnly<T>(db: Pick<PrismaClient, "$transaction">, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
    const flags = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only")
    if (flags[0]?.transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED")
    return fn(tx)
  }, { isolationLevel: "RepeatableRead", timeout: 60000, maxWait: 5000 })
}
async function audit(tx: Prisma.TransactionClient): Promise<Audit> {
  const tables: Audit["tables"] = {}
  for (const table of CLUB_IDENTITY_AUDIT_TABLES) tables[table] = (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
    `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) hash FROM "${table}" t`))[0]
  return { tables, associated: await tx.player.count({ where: { apiFootballId: { not: null } } }) }
}
export async function runFirstMultiClubPreflight(db: Pick<PrismaClient, "$transaction">, pins: MultiClubPreflightPins,
  expectedHead: string, queryCount: () => number = () => 0) {
  validateMultiClubPreflightPins(pins)
  if (!/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error("INVALID_EXPECTED_HEAD")
  const initial = await readOnly(db, audit)
  if (!isDeepStrictEqual(initial, pins.baseline)) throw new Error("BASELINE_CHANGED")
  const report = await runMultiClubIdentityReadOnly(db, FIRST_MULTI_CLUB_COHORT.map(c => c.clubSlug), queryCount)
  if (!isDeepStrictEqual(report.before, pins.baseline) || !isDeepStrictEqual(report.after, pins.baseline)) throw new Error("AUDIT_MISMATCH")
  const p = prepareMultiClubIdentitySummary(report)
  if (p.summary.clubs.some((c, i) => c.clubSlug !== pins.clubs[i].clubSlug || c.teamId !== pins.clubs[i].teamId ||
      c.cacheRowHash !== pins.clubs[i].cacheRowHash || c.snapshotHash !== null || Date.parse(c.cacheExpiresAt) <= Date.now())) {
    throw new Error("CACHE_OR_CLUB_PIN_MISMATCH")
  }
  const sets = p.summary.clubs.map(c => ({ clubSlug: c.clubSlug,
    autoCandidates: c.orderedLocalAutoCandidates.map(({ playerId, providerId }) => ({ playerId, providerId })).sort((a,b)=>a.providerId-b.providerId) }))
  if (!isDeepStrictEqual(sets, pins.candidateSets)) throw new Error("CANDIDATE_SETS_CHANGED_NEW_REVIEW_REQUIRED")
  const atletico = report.clubs[0].report!
  if (!atletico.rows.some(r => r.providerPlayerId === 753 && r.decision === "ALREADY_MATCHED") ||
      !atletico.rows.some(r => r.providerPlayerId === 548707 && r.decision === "REVIEW")) throw new Error("LLORENTE_REGRESSION")
  const rows = await readOnly(db, tx => tx.player.findMany({
    where: { OR: [{ id: { in: p.summary.selectionOrder.map(p=>p.playerId) } },
      { apiFootballId: { in: p.summary.selectionOrder.map(p=>p.providerId) } }] },
    select: { id: true, slug: true, clubId: true, apiFootballId: true, updatedAt: true, apiFootballMatchAttempt: { select: { status: true } } },
  }))
  const checked = revalidateSelectedMultiClubCandidates(p, rows)
  const after = await readOnly(db, audit)
  if (!isDeepStrictEqual(after, pins.baseline)) throw new Error("FINAL_AUDIT_MISMATCH")
  const prepared = checked.preparation, observedAt = new Date()
  const envelope = prepareMultiClubEnvelope(prepared, expectedHead, observedAt)
  const evidence = prepared.summary.selectionOrder.map(p => {
    const row = report.clubs.find(c => c.clubId === p.clubId)!.report!.rows.find(r => r.providerPlayerId === p.providerId)!
    return { ...p, exists: true, apiFootballId: null, attempt: null, providerOwners: 0, decision: row.decision,
      name: row.localCandidate!.name, nameScore: row.nameScore, birth: row.birth, nationality: row.nationality,
      position: row.position, club: row.rosterEvidence, lineup: row.lineupEvidence }
  })
  const preflight = { expectedHead, observedAt: observedAt.toISOString(), readOnly: true, writeEnabled: false,
    before: initial, after, preparation: prepared, envelope, evidence, failures: checked.failures,
    readyForSeparateAuthorization: !checked.requiresNewPreflight && evidence.length > 0, apiCalls: 0, writes: 0 }
  return { ...preflight, preflightHash: multiClubPreparationHash(preflight), report, totalQueries: queryCount() }
}
