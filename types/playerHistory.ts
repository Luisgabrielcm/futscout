// Public presentation DTO. A read adapter must validate provenance and resolve
// observation revisions before supplying these rows. No operational IDs/hashes.
export type CareerMetrics = { appearances?: number | null; goals?: number | null; assists?: number | null }
export type PlayerHistoryData = {
  source: string
  summary?: CareerMetrics & { trophies?: number | null; clubs?: number | null }
  seasons?: (CareerMetrics & { season: string; club: string | null; competition: string | null; minutes?: number | null })[]
  transfers?: { date: string; from: string | null; to: string | null; typeRaw: string | null }[]
  clubs?: { name: string; from: string | null; until: string | null }[]
  trophies?: { competition: string; season: string; team: string | null }[]
  international?: (CareerMetrics & { team: string; period: string | null })[]
}
export type CurrentPlayerStatistics = CareerMetrics & {
  source: string
  period: string
  competition: string
  minutes?: number | null
  starts?: number | null
}
