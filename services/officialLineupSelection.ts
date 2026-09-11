import { ApiFootballRateLimitError, hasApiFootballRateLimitSignal } from "./apiFootballErrors"
import { parseFixture, parseOfficialLineup } from "../lib/officialLineup"
import type { OfficialLineup } from "../types/officialLineup"

export const OFFICIAL_LINEUP_BUDGET = 4 // 1 fixture request + at most 3 lineup requests.
export type LineupResponse = { status: number; body: unknown }
export function readLineupResponse({ status, body }: LineupResponse): unknown[] {
  const data = typeof body === "object" && body !== null ? body as Record<string, unknown> : null
  if (status === 429 || hasApiFootballRateLimitSignal(data?.errors) || hasApiFootballRateLimitSignal(data?.message)) throw new ApiFootballRateLimitError()
  if (status !== 200 || !data || !Array.isArray(data.response) || (data.errors && Object.keys(data.errors).length)) throw new Error("Invalid API-Football lineup response")
  return data.response
}

// No HTTP implementation, secrets or persistence here. Future controlled runner only.
// Rejected requests propagate immediately, including quota, timeout and malformed JSON.
export async function selectRecentOfficialLineup(teamId: number, now: Date, source: {
  fixtures: (teamId: number) => Promise<LineupResponse>
  lineup: (fixtureId: number, teamId: number) => Promise<LineupResponse>
}): Promise<{ lineup: OfficialLineup | null; requests: number }> {
  if (!Number.isSafeInteger(teamId) || teamId <= 0 || !Number.isFinite(now.getTime())) throw new Error("Invalid lineup selection input")
  let requests = 1
  const fixtures = readLineupResponse(await source.fixtures(teamId)).map(v => parseFixture(v, teamId, now)).filter(v => v !== null)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id - a.id)
  const unique = fixtures.filter((f, i) => fixtures.findIndex(other => other.id === f.id) === i).slice(0, OFFICIAL_LINEUP_BUDGET - 1)
  for (const fixture of unique) {
    requests++
    const response = readLineupResponse(await source.lineup(fixture.id, teamId))
    const lineup = parseOfficialLineup(fixture, response, teamId, now.toISOString())
    if (lineup) return { lineup, requests }
  }
  return { lineup: null, requests }
}
