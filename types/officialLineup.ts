import type { PitchPlayer } from "../lib/clubPitchLayout"

export type FixtureContext = {
  id: number; date: string; status: string
  home: { id: number; name: string }; away: { id: number; name: string }
  competition: { id: number; name: string }
}
export type LineupPlayer = {
  apiFootballId: number | null; name: string; position: string | null
  grid: string | null; number: number | null
}
export type OfficialLineup = {
  provider: "api-football"; apiTeamId: number; fixture: FixtureContext
  formation: string | null; startXI: LineupPlayer[]; substitutes: LineupPlayer[] | null
  fetchedAt: string
}
export type LineupCatalogPlayer = PitchPlayer & { apiFootballId: number | null }
export type AssociatedLineupPlayer = LineupPlayer & { catalog: LineupCatalogPlayer | null }
export type OfficialLineupView = Omit<OfficialLineup, "startXI" | "substitutes"> & {
  startXI: AssociatedLineupPlayer[]; substitutes: AssociatedLineupPlayer[] | null
  rows: AssociatedLineupPlayer[][] | null; stale: boolean
}
