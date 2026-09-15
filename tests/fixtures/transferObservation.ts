import { TRANSFER_PILOT_PLAYERS, type TransferPilotEvidence } from "../../services/transferObservationPilot"
import type { TransferRosterEvidence } from "../../types/transferObservation"

// SYNTHETIC scenarios, not observed transfer results. Never use these as operational evidence.
export const transferNow = new Date("2026-09-15T12:00:00.000Z")
export const fixtureDestination = 900001
export function transferEvent(date: string | null = "2026-09-10", type: string | null = "Free", from = 40, to = fixtureDestination) {
  return { date, type, teams: { out: { id: from, name: "Fixture origin" }, in: { id: to, name: "Fixture destination" } } }
}
export function transferPayload(id = 306, events: unknown[] = [transferEvent()]) {
  return { get: "transfers", parameters: { player: String(id) }, errors: [], results: 1,
    response: [{ player: { id, name: TRANSFER_PILOT_PLAYERS.find(p => p.providerPlayerId === id)?.name ?? "Fixture player" }, transfers: events }] }
}
export function transferRoster(teamId: number, playerIds: number[]): TransferRosterEvidence {
  return { teamId, playerIds, season: 2026, fetchedAt: "2026-09-14T12:00:00.000Z", expiresAt: "2026-09-21T12:00:00.000Z" }
}
export function transferPilotFixture(): TransferPilotEvidence {
  return { players: TRANSFER_PILOT_PLAYERS.map(p => ({ ...p })),
    clubs: [{ id: "fixture-destination", name: "Synthetic destination X", apiFootballId: fixtureDestination },
      ...[...new Map(TRANSFER_PILOT_PLAYERS.map(p => [p.clubId, { id: p.clubId, name: p.clubName, apiFootballId: p.localTeamId }])).values()]],
    rosters: [transferRoster(40, []), transferRoster(fixtureDestination, TRANSFER_PILOT_PLAYERS.map(p => p.providerPlayerId))],
    lineups: [], warnings: ["SYNTHETIC_FIXTURE_NOT_REAL_TRANSFER_DATA"] }
}
