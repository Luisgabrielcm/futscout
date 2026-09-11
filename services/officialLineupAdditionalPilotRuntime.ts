import { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { ADDITIONAL_LINEUP_PILOTS, ADDITIONAL_PROTECTED_TABLES, runAdditionalOfficialLineupPilot, type AdditionalPilotKey, type AdditionalPilotAudit } from "./officialLineupAdditionalPilot"
import { createOfficialLineupFetchGuard } from "./officialLineupFetchGuard"
import { createOfficialLineupRepository } from "./officialLineupRepository"
import { createOfficialLineupReadStore } from "./officialLineupReadRepository"
import { BARCELONA_LINEUP_PILOT } from "./officialLineupPilot"

export function auditAdditionalPilot(db: PrismaClient, clubId: string): Promise<AdditionalPilotAudit> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const tables: AdditionalPilotAudit["tables"] = {}
    for (const table of ADDITIONAL_PROTECTED_TABLES) {
      // Fixed identifiers only. All row contents participate, including timestamps.
      const rows = await tx.$queryRaw<{ count: string; hash: string }[]>(Prisma.sql`
        SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash
        FROM ${Prisma.raw(`"${table}"`)} t`)
      tables[table] = rows[0]
    }
    const other = await tx.$queryRaw<{ count: string; hash: string }[]>(Prisma.sql`
      SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash
      FROM "ClubOfficialLineupSnapshot" t WHERE "clubId" <> ${clubId}`)
    const targetSnapshots = await tx.clubOfficialLineupSnapshot.count({ where: { clubId } })
    const barcelona = await tx.clubOfficialLineupSnapshot.findMany({ where: { clubId: BARCELONA_LINEUP_PILOT.id }, select: { fixtureExternalId: true, contentHash: true, revision: true, payloadVersion: true, formation: true }, take: 2 })
    const barcelonaIntact = barcelona.length === 1 && barcelona[0].fixtureExternalId === 1635628 && barcelona[0].revision === 1 && barcelona[0].payloadVersion === 1 && barcelona[0].formation === "4-3-3" && barcelona[0].contentHash === "1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11"
    return { barcelonaIntact, tables, otherSnapshots: other[0], targetSnapshots, totalSnapshots: Number(other[0].count) + targetSnapshots }
  }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 })
}

// Imported only AFTER the runner's explicit authorization flag. Never imported by UI.
export async function executeAdditionalPilot(key: AdditionalPilotKey) {
  await import("dotenv/config")
  if (!process.env.DIRECT_URL || !process.env.API_FOOTBALL_KEY) throw new Error("Required pilot configuration unavailable")
  const target = ADDITIONAL_LINEUP_PILOTS[key]
  const now = new Date()
  const transport = createOfficialLineupFetchGuard(process.env.API_FOOTBALL_KEY, fetch, target.apiFootballId, now)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
  const repository = createOfficialLineupRepository(db, { requireEmptyClub: true })
  const reads = createOfficialLineupReadStore(db, now)
  const report = (event: Record<string, unknown>) => console.log(JSON.stringify(event))
  const result = await runAdditionalOfficialLineupPilot(key, {
    readClubs: () => db.club.findMany({ where: { OR: [{ id: target.id }, { slug: target.slug }, { apiFootballId: target.apiFootballId }] }, select: { id: true, slug: true, name: true, apiFootballId: true } }),
    audit: () => auditAdditionalPilot(db, target.id),
    source: transport.source,
    readPlayers: reads.readPlayersByApiIds,
    save: (clubId, lineup) => {
      if (clubId !== target.id || lineup.apiTeamId !== target.apiFootballId) throw new Error("Pilot write target mismatch")
      return repository.saveOfficialLineupSnapshot(clubId, lineup, new Date())
    },
    report,
    close: async () => {
      transport.stop()
      try { report({ event: "request-budget", club: target.slug, ...transport.counters() }) }
      finally { await db.$disconnect() }
    },
  }, now)
  report({ event: "official-lineup-pilot-result", ...result })
}
