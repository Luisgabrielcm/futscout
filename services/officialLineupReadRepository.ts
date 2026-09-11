import type { PrismaClient } from "../app/generated/prisma/client"
import { decodeLineupSnapshot, toSourcePayload } from "../lib/officialLineupSnapshot"
import { LINEUP_WINDOW_DAYS } from "../lib/officialLineup"
import type { LineupReadStore } from "./officialLineupService"

type ReadDatabase = Pick<PrismaClient, "club" | "player" | "clubOfficialLineupSnapshot">
export function createOfficialLineupReadStore(db: ReadDatabase, now: Date): LineupReadStore {
  return {
    async readSnapshots(clubId) {
      const club = await db.club.findUnique({ where: { id: clubId }, select: { apiFootballId: true } })
      if (!club?.apiFootballId) return []
      const rows = await db.clubOfficialLineupSnapshot.findMany({
        where: { clubId, provider: "api-football", teamExternalId: club.apiFootballId,
          fixtureDate: { gte: new Date(now.getTime() - LINEUP_WINDOW_DAYS * 86_400_000), lte: now } },
        orderBy: [{ fixtureDate: "desc" }, { fetchedAt: "desc" }, { revision: "desc" }, { id: "asc" }], take: 20,
      })
      const seen = new Set<number>()
      return rows.flatMap(row => {
        // Do not resurrect an older revision when the latest is corrupt/unsupported.
        if (seen.has(row.fixtureExternalId)) return []
        seen.add(row.fixtureExternalId)
        const lineup = decodeLineupSnapshot(row, now)
        return lineup ? [{ clubId, apiTeamId: row.teamExternalId, payloadVersion: row.payloadVersion,
          ...toSourcePayload(lineup), fetchedAt: row.fetchedAt.toISOString() }] : []
      })
    },
    readPlayersByApiIds(ids) {
      return db.player.findMany({ where: { apiFootballId: { in: [...new Set(ids)] } }, select: {
        id: true, apiFootballId: true, slug: true, name: true, imageUrl: true, position: true,
        secondaryPosition: true, secondaryPositions: true, officialOverall: true, potential: true, marketValue: true,
      } })
    },
  }
}
