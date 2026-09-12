import type { ApiFootballTeamPlayer } from "../../services/getApiFootballTeamPlayers"
import type { ClubIdentityConfig, ClubIdentityEvidence, ClubIdentityPlayer } from "../../services/clubPlayerIdentityPipeline"
import { officialLineupContentHash } from "../../lib/officialLineupSnapshot"
import type { OfficialLineup } from "../../types/officialLineup"

export const identityNow = new Date("2026-09-12T12:00:00Z")
export function clubIdentityFixture(teamId = 529, clubSlug = "fc-barcelona", size = 1) {
  const clubId = `club-${teamId}`
  const config: ClubIdentityConfig = { clubId, clubSlug, apiFootballTeamId: teamId, season: 2026, mode: "DRY_RUN",
    cache: { maxAgeDays: 7, expectedRowHash: "cache-row-pin" }, snapshot: { required: false, requireParticipation: false },
    writePolicy: { maxAutoWrites: 5, stopOnConflict: true, stopOnAuditMismatch: true, stopOnIndeterminateCommit: true, zeroRetry: true },
    budget: { maxProviderPlayers: 200, maxRelevantPlayers: 2000, maxDryRunAgeMs: 900000 } }
  const players: ClubIdentityPlayer[] = Array.from({ length: size }, (_, i) => ({ id: `local-${i}`, slug: `person-${i}`,
    name: `Example Person${i}`, externalId: `ea-${i}`, apiFootballId: null, dateOfBirth: new Date(`2000-01-${String(i + 1).padStart(2, "0")}T04:00:00Z`),
    nationality: "Spain", position: "MC", secondaryPositions: [], clubId, club: { name: clubSlug, apiFootballId: teamId },
    updatedAt: new Date("2026-09-10T00:00:00Z"), attempt: null }))
  const roster: ApiFootballTeamPlayer[] = players.map((p, i) => ({ player: { id: 1000 + i, name: p.name,
    firstname: "Example", lastname: `Person${i}`, age: 26, birth: { date: p.dateOfBirth!.toISOString().slice(0, 10), place: null, country: null },
    nationality: p.nationality, height: null, weight: null, injured: false, photo: null }, statistics: [{
      team: { id: teamId, name: clubSlug, logo: null }, league: { id: 1, name: "Synthetic league", country: "Spain", logo: null, flag: null, season: 2026 },
      games: { position: "Midfielder" },
    }] }))
  const evidence: ClubIdentityEvidence = { club: { id: clubId, slug: clubSlug, apiFootballId: teamId }, players,
    cacheRowHash: "cache-row-pin", cache: { id: `cache-${teamId}`, apiTeamId: teamId, season: 2026, playerCount: size, players: roster,
      fetchedAt: new Date("2026-09-11T12:00:00Z"), expiresAt: new Date("2026-09-18T12:00:00Z") }, snapshot: null }
  return { config, evidence, players, roster }
}
export function addIdentitySnapshot(f: ReturnType<typeof clubIdentityFixture>, includeFirst = true) {
  const lineup: OfficialLineup = { provider: "api-football", apiTeamId: f.config.apiFootballTeamId, formation: "4-3-3",
    fetchedAt: "2026-09-11T12:00:00.000Z", fixture: { id: 444, date: "2026-09-10T12:00:00.000Z", status: "FT",
      home: { id: f.config.apiFootballTeamId, name: f.config.clubSlug }, away: { id: 99999, name: "Opposition" }, competition: { id: 1, name: "Competition" } },
    startXI: Array.from({ length: 11 }, (_, i) => ({ apiFootballId: includeFirst && i === 0 ? f.roster[0].player.id : 5000 + i,
      name: includeFirst && i === 0 ? f.roster[0].player.name : `Source ${i}`, position: "M", grid: null, number: i + 1 })), substitutes: [] }
  f.evidence.snapshot = { id: "snapshot", clubId: f.config.clubId, provider: "api-football", fixtureExternalId: 444,
    teamExternalId: f.config.apiFootballTeamId, fixtureDate: new Date(lineup.fixture.date), formation: "4-3-3", revision: 1, payloadVersion: 1,
    payload: { fixture: lineup.fixture, startXI: lineup.startXI, substitutes: [] }, contentHash: officialLineupContentHash(lineup), fetchedAt: new Date(lineup.fetchedAt) }
  return lineup
}
