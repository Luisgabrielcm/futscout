import { isDeepStrictEqual } from "node:util"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { CLUB_IDENTITY_AUDIT_TABLES, loadClubIdentityEvidence } from "./clubPlayerIdentityReadRepository"
import { runMultiClubIdentityPipeline, type MultiClubLoad } from "./multiClubIdentityPipeline"
import type { ClubIdentityConfig } from "./clubPlayerIdentityPipeline"
import { withPrismaReadOnly as readOnly } from "../lib/prismaReadOnly"

export function parseMultiClubIdentityArgs(args: string[]) {
  if (args.length !== 5 || args[0] !== "--dry-run" || args[1] !== "--clubs" || args[3] !== "--season" || args[4] !== "2026") {
    throw new Error("ONLY_EXPLICIT_MULTI_CLUB_DRY_RUN_SUPPORTED")
  }
  const slugs = args[2].split(",")
  if (!slugs.length || slugs.length > 5 || new Set(slugs).size !== slugs.length ||
      slugs.some(s => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) || ["fc-barcelona", "manchester-city", "real-madrid"].includes(s))) {
    throw new Error("INVALID_NEW_CLUB_BATCH")
  }
  return slugs
}

type Db = Pick<PrismaClient, "$transaction">
async function audit(tx: Prisma.TransactionClient) {
  const tables: Record<string, { count: string; hash: string }> = {}
  for (const table of CLUB_IDENTITY_AUDIT_TABLES) {
    tables[table] = (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
      `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) hash FROM "${table}" t`))[0]
  }
  const associated = await tx.player.count({ where: { apiFootballId: { not: null } } })
  return { tables, associated }
}
type CacheMetadata = { apiTeamId: number; season: number; playerCount: number; fetchedAt: Date; expiresAt: Date; hash: string }
function cacheState(cache: CacheMetadata | undefined, now: Date) {
  if (!cache) return "ABSENT" as const
  if (cache.expiresAt <= now || now.getTime() - cache.fetchedAt.getTime() > 7 * 86400000) return "EXPIRED" as const
  if (cache.fetchedAt > now || cache.expiresAt <= cache.fetchedAt ||
      cache.expiresAt.getTime() - cache.fetchedAt.getTime() > 7 * 86400000 || cache.playerCount < 1) return "INVALID" as const
  return "PRESENT" as const
}

// All operations are reads. No imports from the operational write runner or roster refresh service.
export async function runMultiClubIdentityReadOnly(db: Db, slugs: string[], queryCount: () => number = () => 0) {
  // Validate BEFORE any connection. The CLI and library expose the same closed Phase A scope.
  parseMultiClubIdentityArgs(["--dry-run", "--clubs", slugs.join(","), "--season", "2026"])
  const now = new Date(), startQueries = queryCount()
  const before = await readOnly(db, audit)
  const inventory = await readOnly(db, async tx => {
    const clubs = await tx.club.findMany({ where: { slug: { in: [...slugs, "fc-barcelona", "manchester-city", "real-madrid"] } },
      select: { id: true, slug: true, name: true, apiFootballId: true, league: { select: { name: true } } } })
    if (slugs.some(s => !clubs.some(c => c.slug === s && c.apiFootballId !== null))) throw new Error("CLUB_NOT_IDENTIFIED")
    const ids = clubs.map(c => c.id), teams = clubs.flatMap(c => c.apiFootballId === null ? [] : [c.apiFootballId])
    const coverage = await tx.$queryRawUnsafe<{ clubId: string; players: number; associated: number; attributes: number }[]>(
      'SELECT p."clubId",count(*)::int players,count(p."apiFootballId")::int associated,count(a.id)::int attributes FROM "Player" p LEFT JOIN "PlayerAttributes" a ON a."playerId"=p.id WHERE p."clubId" = ANY($1::text[]) GROUP BY p."clubId"', ids)
    // Metadata only for legacy seasons. No old payload ever reaches the matcher.
    const caches = await tx.$queryRawUnsafe<CacheMetadata[]>(
      'SELECT "apiTeamId",season,"playerCount","fetchedAt","expiresAt",md5(to_jsonb(t)::text) hash FROM "ApiFootballTeamRosterCache" t WHERE "apiTeamId" = ANY($1::int[]) ORDER BY "apiTeamId",season', teams)
    const snapshots = await tx.clubOfficialLineupSnapshot.findMany({ where: { clubId: { in: ids }, provider: "api-football" },
      select: { id: true, clubId: true, contentHash: true, fixtureDate: true, fetchedAt: true, revision: true },
      orderBy: [{ fixtureDate: "desc" }, { fetchedAt: "desc" }, { revision: "desc" }, { id: "asc" }] })
    const recent = await tx.player.findMany({ where: { slug: { in: ["mateo-kovacic", "marcus-bettinelli", "josko-gvardiol",
      "rico-lewis", "rayan-ait-nouri", "andriy-lunin", "trent-alexander-arnold", "aurelien-tchouameni", "alvaro-carreras", "endrick"] } },
      select: { slug: true, clubId: true, apiFootballId: true, apiFootballMatchAttempt: { select: { status: true, lastApiFootballId: true } } } })
    return { clubs, coverage, caches, snapshots, recent }
  })
  const selections = slugs.map(slug => {
    const club = inventory.clubs.find(c => c.slug === slug)!, coverage = inventory.coverage.find(c => c.clubId === club.id)
    if (!coverage?.players) throw new Error("EMPTY_LOCAL_CLUB")
    const cache = inventory.caches.find(c => c.apiTeamId === club.apiFootballId && c.season === 2026)
    const snapshot = inventory.snapshots.find(s => s.clubId === club.id)
    const config: ClubIdentityConfig = { clubId: club.id, clubSlug: slug, apiFootballTeamId: club.apiFootballId!, season: 2026, mode: "DRY_RUN",
      cache: { maxAgeDays: 7, ...(cache ? { expectedRowHash: cache.hash } : {}) },
      snapshot: { required: false, requireParticipation: false, ...(snapshot ? { expectedHash: snapshot.contentHash } : {}) },
      writePolicy: { maxAutoWrites: 5, stopOnConflict: true, stopOnAuditMismatch: true, stopOnIndeterminateCommit: true, zeroRetry: true },
      budget: { maxProviderPlayers: 200, maxRelevantPlayers: 2000, maxDryRunAgeMs: 900000 } }
    return { club, config, coverage: { ...coverage, missing: coverage.players - coverage.associated,
      percent: 100 * coverage.associated / coverage.players }, cacheState: cacheState(cache, now), cache: cache ?? null,
      legacyCaches: inventory.caches.filter(c => c.apiTeamId === club.apiFootballId && c.season !== 2026)
        .map(c => ({ ...c, ttlDays: (c.expiresAt.getTime() - c.fetchedAt.getTime()) / 86400000, state: cacheState(c, now) })),
      snapshot: snapshot ?? null }
  })
  const queryCounts: Record<string, number> = {}
  const result = await runMultiClubIdentityPipeline({ clubs: selections.map(s => s.config), mode: "DRY_RUN" }, {
    load: async (config): Promise<MultiClubLoad> => {
      const start = queryCount(), selection = selections.find(s => s.club.id === config.clubId)!
      try {
        if (selection.cacheState !== "PRESENT") return { status: "NEEDS_FRESH_ROSTER", reason: selection.cacheState }
        const evidence = await readOnly(db, tx => loadClubIdentityEvidence(tx, config, new Date()))
        // A snapshot appearing/disappearing since inventory is also drift, even when optional.
        if ((evidence.snapshot?.contentHash ?? null) !== (selection.snapshot?.contentHash ?? null)) throw new Error("INVALID_SNAPSHOT")
        return { status: "READY", evidence }
      } finally { queryCounts[config.clubSlug] = queryCount() - start }
    },
    // Independent fresh transaction after each club: global integrity, not a repeatable-read illusion.
    audit: async config => {
      const start = queryCount(), afterClub = await readOnly(db, audit)
      queryCounts[config.clubSlug] = (queryCounts[config.clubSlug] ?? 0) + queryCount() - start
      return isDeepStrictEqual(before, afterClub)
    },
  }, now)
  const after = await readOnly(db, audit)
  if (!isDeepStrictEqual(before, after)) throw new Error("GLOBAL_AUDIT_MISMATCH")
  const regression = inventory.clubs.filter(c => !slugs.includes(c.slug)).map(c => ({ club: c.slug,
    coverage: inventory.coverage.find(row => row.clubId === c.id), recent: inventory.recent.filter(p => p.clubId === c.id) }))
  return { observedAt: now.toISOString(), readOnly: true, transactionReadOnly: "on", before, after,
    selections, regression, ...result, queryCounts, totalQueries: queryCount() - startQueries,
    refreshPlan: selections.filter(s => s.cacheState !== "PRESENT").map(s => ({ club: s.club.slug,
      teamId: s.club.apiFootballId, season: 2026, action: "REQUEST_SEPARATE_ROSTER_REFRESH_AUTHORIZATION",
      executed: false, reason: s.cacheState })) }
}
