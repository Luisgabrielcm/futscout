/** Public projection: deliberately excludes metrics with unresolved units. */
export type RealStatisticRow = {
  id: string
  season: number
  apiTeamId: number | null
  apiLeagueId: number | null
  teamName: string
  competitionName: string
  position: string | null
  appearances: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
}

export type RealStatisticView = RealStatisticRow & {
  source: "API-Football"
  observedAt: string | null
  coverage: "unknown" | "partial"
}

const count = (value: number | null) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null

/** Legacy updatedAt is intentionally not accepted as collection provenance. */
export function projectRealStatistics(rows: RealStatisticRow[]): RealStatisticView[] {
  return rows.map(row => ({
    id: row.id, season: row.season, apiTeamId: row.apiTeamId, apiLeagueId: row.apiLeagueId,
    teamName: row.teamName, competitionName: row.competitionName, position: row.position,
    appearances: count(row.appearances), minutes: count(row.minutes),
    goals: count(row.goals), assists: count(row.assists),
    source: "API-Football", observedAt: null, coverage: "unknown",
  }))
}

export function statisticsForSeason(rows: RealStatisticView[], season: number) {
  return rows.filter(row => row.season === season)
}
