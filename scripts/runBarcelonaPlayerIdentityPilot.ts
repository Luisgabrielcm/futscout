// Operational runner: executing either mode requires its own explicit authorization.
// No HTTP, resolver, sync or cache refresh. Write mode uses ONLY the approved atomic adapter.
import { execFileSync } from "node:child_process"
import { parseIdentityPilotArgs, planBarcelonaIdentityCoverage } from "../services/playerIdentityCoverage"
import { decodeLineupSnapshot } from "../lib/officialLineupSnapshot"
import { dispatchBarcelonaIdentityRunner } from "../services/barcelonaIdentityWritePolicy"

async function main() {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  await dispatchBarcelonaIdentityRunner(process.argv.slice(2), {
    git,
    blockHttp: () => { globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_IDENTITY_PILOT") } },
    runDryRun: async (args, head) => dryRun(args, head),
    loadWriteFlow: async () => {
      const { executeBarcelonaIdentityWrite } = await import("../services/barcelonaIdentityWriteRunner")
      const { createPrismaIdentityWriteDependencies } = await import("../services/playerIdentityWritePilot")
      return async (args, head) => {
        await import("dotenv/config")
        if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
        const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
          import("../app/generated/prisma/client"), import("@prisma/adapter-pg"),
        ])
        const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
        try {
          const report = await executeBarcelonaIdentityWrite(args.confirmation, createPrismaIdentityWriteDependencies(db, undefined, args.batchId),
            value => console.log(JSON.stringify({ head, batchId: args.batchId, report: value })), args.batchId)
          console.log(JSON.stringify({ head, phase: "FINAL", results: report.results,
            stopped: report.stopped, auditFailure: report.auditFailure,
            committedPlayerIds: report.committedPlayerIds, untouchedPlayerIds: report.untouchedPlayerIds,
            apiCalls: 0, requiresReadOnlyAudit: report.results.some(r => r.status === "INDETERMINATE_COMMIT") }))
          if (report.stopped || report.auditFailure) process.exitCode = 2
        } finally { await db.$disconnect() }
      }
    },
  })
}

async function dryRun(args: ReturnType<typeof parseIdentityPilotArgs>, head: string) {
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
        before, after, ...result, writeGate: "NOT_ENTERED_DRY_RUN_READ_ONLY" }
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 })
    console.log(JSON.stringify(report))
    if (report.failedFast) process.exitCode = 2
  } finally { await db.$disconnect() }
}
main().catch((error: unknown) => {
  // Never echo provider bodies, raw database errors, URLs or credentials.
  const safeCodes = new Set(["AUTHORIZATION_MISMATCH", "EXPLICIT_V2_CONFIRMATION_REQUIRED", "BETA_NEXT_REQUIRED",
    "CLEAN_WORKING_TREE_REQUIRED", "CONFLICT_PROVIDER_ID_TAKEN", "PLAYER_BASELINE_CHANGED",
    "CURRENT_MATCHER_NOT_AUTO_MATCH", "PARTIAL_OR_INCONSISTENT_ASSOCIATION", "IDENTITY_WRITE_AUDIT_FAILED"])
  if (error instanceof Error && safeCodes.has(error.message)) console.error(error.message)
  console.error("BARCELONA_IDENTITY_PILOT_STOPPED: validate arguments, clean beta-next and current evidence; do not retry writes without READ ONLY audit")
  process.exitCode = 1
})
