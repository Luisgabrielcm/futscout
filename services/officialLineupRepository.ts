import type { PrismaClient, Prisma } from "../app/generated/prisma/client"
import { officialLineupContentHash, validateLineupForSnapshot } from "../lib/officialLineupSnapshot"
import type { OfficialLineup } from "../types/officialLineup"

// Operational write module: NEVER imported by public read/UI modules.
export function createOfficialLineupRepository(db: PrismaClient) {
  return {
    async saveOfficialLineupSnapshot(clubId: string, input: OfficialLineup, now = new Date()) {
      const lineup = validateLineupForSnapshot(input, now)
      const contentHash = officialLineupContentHash(lineup)
      return db.$transaction(async tx => {
        const club = await tx.club.findUnique({ where: { id: clubId }, select: { apiFootballId: true } })
        if (!club || club.apiFootballId !== lineup.apiTeamId) throw new Error("Official lineup club identity mismatch")
        const identity = { provider: lineup.provider, fixtureExternalId: lineup.fixture.id, teamExternalId: lineup.apiTeamId }
        const latest = await tx.clubOfficialLineupSnapshot.findFirst({ where: identity, orderBy: { revision: "desc" } })
        if (latest && latest.clubId !== clubId) throw new Error("Official lineup ownership conflict")
        if (latest?.contentHash === contentHash) return { status: "duplicate" as const, snapshotId: latest.id, contentHash }
        if (latest && Date.parse(lineup.fetchedAt) <= latest.fetchedAt.getTime()) throw new Error("Official lineup stale capture")
        const snapshot = await tx.clubOfficialLineupSnapshot.create({ data: {
          ...identity, clubId, fixtureDate: new Date(lineup.fixture.date), formation: lineup.formation,
          revision: (latest?.revision ?? 0) + 1, payloadVersion: 1, contentHash, fetchedAt: new Date(lineup.fetchedAt),
          payload: { fixture: lineup.fixture, startXI: lineup.startXI, substitutes: lineup.substitutes } as Prisma.InputJsonValue,
        } })
        return { status: "created" as const, snapshotId: snapshot.id, contentHash }
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 })
      // P2002/P2034 concurrency conflicts fail-stop; no transaction/network retry.
    },
  }
}
