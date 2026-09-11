// PREPARATION ONLY: do not execute without separate READ ONLY dry-run authorization.
// No HTTP, resolver, sync, cache refresh, attempt recorder or write implementation.
import { execFileSync } from "node:child_process"
import { parseIdentityPilotArgs, planBarcelonaIdentityCoverage } from "../services/playerIdentityCoverage"
import { decodeLineupSnapshot } from "../lib/officialLineupSnapshot"

async function main() {
  const args = parseIdentityPilotArgs(process.argv.slice(2)) // BEFORE env/DB imports
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  if (git("branch", "--show-current") !== "beta-next" || git("status", "--porcelain")) throw new Error("CLEAN_BETA_NEXT_REQUIRED")
  const head = git("rev-parse", "HEAD")
  globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_IDENTITY_DRY_RUN") }
  await import("dotenv/config")
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
  const [{ PrismaClient, Prisma }, { PrismaPg }] = await Promise.all([
    import("../app/generated/prisma/client"), import("@prisma/adapter-pg"),
  ])
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const audit = async () => {
        const hashes: Record<string, { count: string; hash: string }> = {}
        for (const table of ["Player", "Club", "League", "PlayerAttributes", "ApiFootballTeamRosterCache",
          "ApiFootballPlayerMatchAttempt", "SyncState", "SyncError", "ClubOfficialLineupSnapshot"] as const) {
          const rows = await tx.$queryRaw<{ count: string; hash: string }[]>(Prisma.sql`
            SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash
            FROM ${Prisma.raw(`"${table}"`)} t`)
          hashes[table] = rows[0]
        }
        return hashes
      }
      const before = await audit()
      const clubs = await tx.club.findMany({ where: { OR: [{ slug: "fc-barcelona" }, { apiFootballId: 529 }] },
        select: { id: true, slug: true, apiFootballId: true } })
      if (clubs.length !== 1 || clubs[0].slug !== "fc-barcelona" || clubs[0].apiFootballId !== 529) throw new Error("BARCELONA_IDENTITY_MISMATCH")
      const snapshots = await tx.clubOfficialLineupSnapshot.findMany({
        where: { club: { slug: { in: ["fc-barcelona", "manchester-city", "real-madrid"] } } }, include: { club: { select: { slug: true } } },
      })
      if (snapshots.length !== 3 || new Set(snapshots.map(s => s.club.slug)).size !== 3) throw new Error("THREE_PILOT_SNAPSHOTS_REQUIRED")
      const now = new Date()
      for (const snapshot of snapshots) if (!decodeLineupSnapshot(snapshot, now)) throw new Error("INVALID_PROTECTED_SNAPSHOT")
      const lineup = decodeLineupSnapshot(snapshots.find(s => s.clubId === clubs[0].id)!, now)!
      const cache = await tx.apiFootballTeamRosterCache.findUnique({ where: { apiTeamId_season: { apiTeamId: 529, season: args.season } } })
      const catalog = await tx.player.findMany({ select: {
        id: true, name: true, apiFootballId: true, dateOfBirth: true, nationality: true, position: true, secondaryPositions: true,
        club: { select: { name: true, apiFootballId: true } }, apiFootballMatchAttempt: { select: { status: true, nextRetryAt: true } },
      } })
      const players = catalog.map(({ apiFootballMatchAttempt, ...p }) => ({ ...p, attempt: apiFootballMatchAttempt }))
      const result = planBarcelonaIdentityCoverage({ ...args, now, players, cache, lineup })
      const after = await audit()
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("READ_ONLY_INVARIANT_FAILED")
      return { head, club: clubs[0], season: args.season, snapshotHash: snapshots.find(s => s.clubId === clubs[0].id)!.contentHash,
        roster: { fetchedAt: cache!.fetchedAt, expiresAt: cache!.expiresAt, playerCount: cache!.playerCount },
        before, after, ...result, writeGate: "DISABLED_REQUIRES_SEPARATE_REVIEW_AND_AUTHORIZATION" }
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 })
    console.log(JSON.stringify(report))
    if (report.failedFast) process.exitCode = 2
  } finally { await db.$disconnect() }
}
main().catch(() => {
  // Never echo provider bodies, raw database errors, URLs or credentials.
  console.error("BARCELONA_IDENTITY_DRY_RUN_STOPPED: check arguments, clean beta-next, identity, snapshots and fresh 2026 roster; no writes supported")
  process.exitCode = 1
})
