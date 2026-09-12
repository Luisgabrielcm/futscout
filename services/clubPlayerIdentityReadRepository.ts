import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { isDeepStrictEqual } from "node:util"
import { requireClubIdentityConfig, requireClubIdentityRoster, runClubPlayerIdentityPipeline,
  type ClubIdentityConfig, type ClubIdentityEvidence } from "./clubPlayerIdentityPipeline"
import { createClubIdentityAuthorizationSummary, planClubIdentityAutoWrite } from "./clubIdentityAuthorization"

export const CLUB_IDENTITY_AUDIT_TABLES = ["Player", "Club", "League", "PlayerAttributes", "ApiFootballTeamRosterCache",
  "ApiFootballPlayerMatchAttempt", "SyncState", "SyncError", "ClubOfficialLineupSnapshot"] as const
async function hashes(tx: Prisma.TransactionClient) {
  const result: Record<string, { count: string; hash: string }> = {}
  for (const table of CLUB_IDENTITY_AUDIT_TABLES) {
    // Closed table constants, never CLI identifiers.
    result[table] = (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash FROM "${table}" t`))[0]
  }
  return result
}

export async function loadClubIdentityEvidence(tx: Prisma.TransactionClient, config: ClubIdentityConfig, now: Date): Promise<ClubIdentityEvidence> {
  requireClubIdentityConfig(config)
  const clubs = await tx.club.findMany({ where: { OR: [{ id: config.clubId }, { apiFootballId: config.apiFootballTeamId }] },
    select: { id: true, slug: true, apiFootballId: true } })
  if (clubs.length !== 1 || clubs[0].id !== config.clubId || clubs[0].slug !== config.clubSlug ||
      clubs[0].apiFootballId !== config.apiFootballTeamId) throw new Error("CLUB_IDENTITY_MISMATCH")
  const cache = await tx.apiFootballTeamRosterCache.findUnique({ where: {
    apiTeamId_season: { apiTeamId: config.apiFootballTeamId, season: config.season },
  } })
  const cacheRowHash = cache ? (await tx.$queryRawUnsafe<{ hash: string }[]>(
    'SELECT md5(to_jsonb(t)::text) AS hash FROM "ApiFootballTeamRosterCache" t WHERE id = $1', cache.id))[0]?.hash ?? null : null
  const roster = requireClubIdentityRoster(config, { cache, cacheRowHash }, now)
  const birthDays = [...new Set(roster.flatMap(p => p.player.birth.date ? [p.player.birth.date] : []))]
  // UTC day ranges match persisted DateTimes with non-midnight times, just like the existing evaluator.
  const birthFilters = birthDays.map(day => ({ dateOfBirth: { gte: new Date(day), lt: new Date(Date.parse(day) + 86400000) } }))
  const catalog = await tx.player.findMany({ where: { OR: [
    { clubId: config.clubId }, { apiFootballId: { in: roster.map(p => p.player.id) } }, ...birthFilters,
  ] }, orderBy: { id: "asc" }, take: config.budget.maxRelevantPlayers + 1, select: {
    id: true, slug: true, name: true, externalId: true, apiFootballId: true, dateOfBirth: true, nationality: true,
    position: true, secondaryPositions: true, clubId: true, updatedAt: true,
    club: { select: { name: true, apiFootballId: true } },
    apiFootballMatchAttempt: { select: { status: true, lastApiFootballId: true, nextRetryAt: true } },
  } })
  if (catalog.length > config.budget.maxRelevantPlayers) throw new Error("RELEVANT_PLAYERS_BUDGET_EXCEEDED")
  // No per-player queries. One latest snapshot; a malformed newest revision is never bypassed.
  const snapshots = await tx.clubOfficialLineupSnapshot.findMany({ where: { clubId: config.clubId, provider: "api-football" },
    orderBy: [{ fixtureDate: "desc" }, { fetchedAt: "desc" }, { revision: "desc" }, { id: "asc" }], take: 1 })
  return { club: clubs[0], cache, cacheRowHash, snapshot: snapshots[0] ?? null,
    players: catalog.map(({ apiFootballMatchAttempt, ...p }) => ({ ...p, attempt: apiFootballMatchAttempt })) }
}

// The DB boundary supplies no write adapter. AUTO_WRITE is rejected BEFORE opening any transaction.
export async function runClubIdentityReadOnly(db: Pick<PrismaClient, "$transaction">, config: ClubIdentityConfig, now = new Date()) {
  requireClubIdentityConfig(config)
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
    const readOnly = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only")
    if (readOnly[0]?.transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED")
    const before = await hashes(tx)
    const evidence = await loadClubIdentityEvidence(tx, config, now)
    const baseline = { players: Number(before.Player.count), associated: await tx.player.count({ where: { apiFootballId: { not: null } } }),
      attempts: Number(before.ApiFootballPlayerMatchAttempt.count) }
    const report = runClubPlayerIdentityPipeline(config, evidence, now)
    const authorization = createClubIdentityAuthorizationSummary(report), futureWritePlan = planClubIdentityAutoWrite(report)
    const after = await hashes(tx)
    if (!isDeepStrictEqual(before, after)) throw new Error("READ_ONLY_AUDIT_MISMATCH")
    const autoMatchState = report.rows.filter(r => r.decision === "AUTO_MATCH").map(r => {
      const p = evidence.players.find(p => p.id === r.localCandidate!.playerId)!
      return { playerId: p.id, slug: p.slug, apiFootballId: p.apiFootballId, attempt: p.attempt,
        expectedUpdatedAt: p.updatedAt.toISOString(), providerId: r.providerPlayerId,
        providerOwners: evidence.players.filter(p => p.apiFootballId === r.providerPlayerId).map(p => p.id) }
    })
    return { baseline, before, after, readOnly: true as const, report, authorization, futureWritePlan, autoMatchState }
  }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 })
}
