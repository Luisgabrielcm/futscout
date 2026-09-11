import { createHash } from "node:crypto"
import { parseFixture, parseOfficialLineup } from "./officialLineup"
import type { OfficialLineup } from "../types/officialLineup"

export const LINEUP_PAYLOAD_VERSION = 1
export type SnapshotPayload = Pick<OfficialLineup, "fixture" | "startXI" | "substitutes">
export type SnapshotData = {
  clubId: string; provider: string; fixtureExternalId: number; teamExternalId: number
  fixtureDate: Date; formation: string | null; revision: number; payloadVersion: number
  payload: unknown; contentHash: string; fetchedAt: Date
}

export function toSourcePayload(lineup: OfficialLineup) {
  const { fixture: f } = lineup
  const player = (p: OfficialLineup["startXI"][number]) => ({ player: { id: p.apiFootballId, name: p.name, pos: p.position, grid: p.grid, number: p.number } })
  return {
    fixture: { fixture: { id: f.id, date: f.date, status: { short: f.status } }, teams: { home: f.home, away: f.away }, league: f.competition },
    response: [{ team: { id: lineup.apiTeamId }, formation: lineup.formation, startXI: lineup.startXI.map(player), substitutes: lineup.substitutes?.map(player) ?? null }],
  }
}

// Rebuild an allowlisted object: no unknown metadata, resolved IDs or local metrics.
export function validateLineupForSnapshot(lineup: OfficialLineup, now: Date): OfficialLineup {
  if (lineup.provider !== "api-football" || !Number.isFinite(now.getTime())) throw new Error("Invalid official lineup")
  const source = toSourcePayload(lineup)
  const fixture = parseFixture(source.fixture, lineup.apiTeamId, now)
  const result = fixture && parseOfficialLineup(fixture, source.response, lineup.apiTeamId, lineup.fetchedAt)
  if (!result || Date.parse(result.fetchedAt) > now.getTime() || Date.parse(result.fetchedAt) < Date.parse(result.fixture.date)) throw new Error("Invalid official lineup")
  return result
}

export function officialLineupContentHash(lineup: OfficialLineup): string {
  // Explicit field order, including ordered XI/bench (order affects safe visual fallback).
  const p = (v: OfficialLineup["startXI"][number]) => [v.apiFootballId, v.name, v.position, v.grid, v.number]
  const f = lineup.fixture
  return createHash("sha256").update(JSON.stringify([LINEUP_PAYLOAD_VERSION, lineup.provider, lineup.apiTeamId,
    f.id, f.date, f.status, f.home.id, f.home.name, f.away.id, f.away.name, f.competition.id, f.competition.name,
    lineup.formation, lineup.startXI.map(p), lineup.substitutes?.map(p) ?? null])).digest("hex")
}

export function decodeLineupSnapshot(row: SnapshotData, now: Date): OfficialLineup | null {
  if (row.payloadVersion !== LINEUP_PAYLOAD_VERSION || row.provider !== "api-football") return null
  try {
    const p = row.payload as SnapshotPayload
    const lineup = validateLineupForSnapshot({ provider: "api-football", apiTeamId: row.teamExternalId, formation: row.formation,
      fixture: p.fixture, startXI: p.startXI, substitutes: p.substitutes, fetchedAt: row.fetchedAt.toISOString() }, now)
    if (lineup.fixture.id !== row.fixtureExternalId || lineup.fixture.date !== row.fixtureDate.toISOString() || officialLineupContentHash(lineup) !== row.contentHash) return null
    return lineup
  } catch { return null }
}
