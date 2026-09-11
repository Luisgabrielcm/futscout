// PREPARED ONLY. Do not run without separate migration + pilot authorization.
// Explicit execution flag checked BEFORE loading env, DB or HTTP dependencies.
async function main() {
  if (process.argv.slice(2).join(" ") !== "--execute-barcelona-official-lineup") throw new Error("Explicit Barcelona pilot execution flag required")
  await import("dotenv/config")
  if (!process.env.DIRECT_URL || !process.env.API_FOOTBALL_KEY) throw new Error("Required pilot configuration unavailable")
  const [{ PrismaClient }, { PrismaPg }, { createOfficialLineupRepository }, { createOfficialLineupReadStore }, { createOfficialLineupFetchGuard }, { runOfficialLineupPilot, BARCELONA_LINEUP_PILOT }, { auditLineupProtectedTables }] = await Promise.all([
    import("../app/generated/prisma/client"), import("@prisma/adapter-pg"), import("../services/officialLineupRepository"),
    import("../services/officialLineupReadRepository"), import("../services/officialLineupFetchGuard"), import("../services/officialLineupPilot"), import("../services/officialLineupPilotAudit"),
  ])
  const now = new Date()
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
  const transport = createOfficialLineupFetchGuard(process.env.API_FOOTBALL_KEY, fetch, 529, now)
  const repository = createOfficialLineupRepository(db)
  const reads = createOfficialLineupReadStore(db, now)
  let snapshotsBefore: number | undefined
  const result = await runOfficialLineupPilot({
    readClub: async () => {
      // Missing migration must fail BEFORE the first request, even with UI gate off.
      snapshotsBefore = await db.clubOfficialLineupSnapshot.count()
      return db.club.findUnique({ where: { id: BARCELONA_LINEUP_PILOT.id }, select: { id: true, slug: true, apiFootballId: true } })
    },
    audit: async () => { const hashes = await auditLineupProtectedTables(db); console.log(JSON.stringify({ event: "protected-tables-audit", hashes })); return hashes },
    source: transport.source, readPlayers: reads.readPlayersByApiIds,
    save: (clubId, lineup) => repository.saveOfficialLineupSnapshot(clubId, lineup, new Date()),
    close: async () => {
      transport.stop()
      try {
        if (snapshotsBefore !== undefined) console.log(JSON.stringify({ event: "snapshot-count-audit", before: snapshotsBefore, after: await db.clubOfficialLineupSnapshot.count() }))
      } finally { await db.$disconnect() }
    },
  }, now)
  console.log(JSON.stringify({ event: "official-lineup-pilot-result", ...result, budget: transport.counters() }))
}
main().catch(error => {
  // Never output provider response, connection strings, headers or raw DB errors.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "PILOT_STOPPED"
  console.error(JSON.stringify({ event: "official-lineup-pilot-failed", code }))
  process.exitCode = 1
})
