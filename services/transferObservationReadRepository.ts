import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { decodeLineupSnapshot } from "../lib/officialLineupSnapshot"
import { positiveTransferId, transferRecord, TransferObservationError } from "../lib/transferObservations"
import { TRANSFER_PILOT_PLAYERS, requireTransferPilotPlayers, type TransferPilotEvidence } from "./transferObservationPilot"

const TABLES = ["Player", "Club", "League", "PlayerAttributes", "PlayStyle", "PlayerPlayStyle", "PlayerRealLifeStat",
  "PlayerTransfer", "PlayerTrophy", "ApiFootballPlayerMatchAttempt", "ApiFootballTeamRosterCache", "SyncState", "SyncError", "ClubOfficialLineupSnapshot"] as const
export type TransferAuditHashes = Record<string, { count: string; hash: string }>
async function hashTables(tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">) {
  const out: TransferAuditHashes = {}
  for (const table of TABLES) {
    out[table] = (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash FROM "${table}" t`))[0]
  }
  return out
}
export function readTransferAuditHashes(db: Pick<PrismaClient, "$transaction">) { return withPrismaReadOnly(db, hashTables) }

// Read APIs only, all enclosed by verified READ ONLY + forced rollback. No HTTP imports.
export function readTransferPilotEvidence(db: Pick<PrismaClient, "$transaction">, now: Date) {
  return withPrismaReadOnly(db, async tx => {
    if (!Number.isFinite(now.getTime())) throw new TransferObservationError("INVALID_CLOCK")
    const hashes = await hashTables(tx)
    const ids = TRANSFER_PILOT_PLAYERS.map(p => p.providerPlayerId)
    const catalog = await tx.player.findMany({ where: { OR: [{ id: { in: TRANSFER_PILOT_PLAYERS.map(p => p.playerId) } }, { apiFootballId: { in: ids } }] },
      select: { id: true, slug: true, name: true, apiFootballId: true, clubId: true, club: { select: { name: true, apiFootballId: true } },
        apiFootballMatchAttempt: { select: { status: true, lastApiFootballId: true } } } })
    const players = TRANSFER_PILOT_PLAYERS.map(expected => {
      const p = catalog.find(p => p.id === expected.playerId)
      if (!p?.club || p.apiFootballId === null || p.clubId === null || p.club.apiFootballId === null ||
          catalog.filter(owner => owner.apiFootballId === expected.providerPlayerId).length !== 1 ||
          (p.apiFootballMatchAttempt && (p.apiFootballMatchAttempt.status !== "matched" || p.apiFootballMatchAttempt.lastApiFootballId !== p.apiFootballId))) {
        throw new TransferObservationError("TRANSFER_PILOT_IDENTITY_CHANGED")
      }
      return { playerId: p.id, slug: p.slug, name: p.name, providerPlayerId: p.apiFootballId, clubId: p.clubId, clubName: p.club.name, localTeamId: p.club.apiFootballId }
    })
    requireTransferPilotPlayers(players)
    const clubs = await tx.club.findMany({ select: { id: true, name: true, apiFootballId: true } })
    const caches = await tx.apiFootballTeamRosterCache.findMany({ where: { season: now.getUTCFullYear() } })
    const rosters: TransferPilotEvidence["rosters"] = [], warnings: string[] = []
    for (const c of caches) {
      const validTime = c.fetchedAt <= now && c.expiresAt > now && c.expiresAt > c.fetchedAt &&
        c.expiresAt.getTime() - c.fetchedAt.getTime() <= 7 * 86400000 && now.getTime() - c.fetchedAt.getTime() <= 7 * 86400000
      const rows = Array.isArray(c.players) ? c.players : []
      const playerIds: number[] = []
      let valid = validTime && rows.length > 0 && rows.length === c.playerCount
      for (const r of rows) {
        if (!transferRecord(r) || !transferRecord(r.player) || !positiveTransferId(r.player.id) || !Array.isArray(r.statistics) ||
            !r.statistics.length || r.statistics.some(s => !transferRecord(s) || !transferRecord(s.team) || s.team.id !== c.apiTeamId ||
              !transferRecord(s.league) || s.league.season !== c.season)) { valid = false; break }
        playerIds.push(r.player.id)
      }
      if (new Set(playerIds).size !== playerIds.length) valid = false
      if (!valid) { warnings.push(`IGNORED_ROSTER:${c.apiTeamId}:${c.season}`); continue }
      rosters.push({ teamId: c.apiTeamId, season: c.season, fetchedAt: c.fetchedAt.toISOString(), expiresAt: c.expiresAt.toISOString(), playerIds })
    }
    const snapshots = await tx.clubOfficialLineupSnapshot.findMany({ where: { provider: "api-football",
      fixtureDate: { gte: new Date(now.getTime() - 30 * 86400000), lte: now } },
      orderBy: [{ fixtureDate: "desc" }, { revision: "desc" }, { fetchedAt: "desc" }] })
    const seen = new Set<string>(), lineups: TransferPilotEvidence["lineups"] = []
    for (const s of snapshots) {
      const key = `${s.fixtureExternalId}:${s.teamExternalId}`
      if (seen.has(key)) continue
      seen.add(key) // Never resurrect an older revision when the newest is invalid.
      const lineup = decodeLineupSnapshot(s, now)
      if (!lineup) { warnings.push(`IGNORED_LINEUP:${key}`); continue }
      lineups.push({ teamId: s.teamExternalId, fixtureDate: s.fixtureDate.toISOString(), playerIds: [...lineup.startXI, ...(lineup.substitutes ?? [])]
        .flatMap(p => p.apiFootballId === null ? [] : [p.apiFootballId]) })
    }
    return { hashes, evidence: { players, clubs, rosters, lineups, warnings } satisfies TransferPilotEvidence }
  })
}
