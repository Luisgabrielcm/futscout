import { parseFixture } from "../lib/officialLineup"
import { readLineupResponse, type LineupResponse } from "./officialLineupSelection"
import { ApiFootballRateLimitError } from "./apiFootballErrors"

type FetchResponse = Pick<Response, "status" | "json">
export type LineupFetch = (url: string, init: RequestInit) => Promise<FetchResponse>

// An isolated transport, not a global fetch patch. Never imported by public runtime.
export function createOfficialLineupFetchGuard(apiKey: string, fetchOriginal: LineupFetch, teamId: number, now: Date) {
  if (!apiKey || !Number.isSafeInteger(teamId) || teamId <= 0) throw new Error("Invalid lineup transport configuration")
  let fixtures = 0, lineups = 0, stopped = false, busy = false
  const permittedFixtures = new Set<number>()
  const requestedFixtures = new Set<number>()
  async function request(input: string): Promise<LineupResponse> {
    try {
      if (stopped || busy) throw new Error("Lineup transport stopped or concurrent request")
      const url = new URL(input)
      const isFixtures = url.pathname === "/fixtures"
      const expectedKeys = isFixtures ? ["team", "last", "timezone"] : ["fixture", "team"]
      if (url.origin !== "https://v3.football.api-sports.io" || url.username || url.password || url.hash ||
          !["/fixtures", "/fixtures/lineups"].includes(url.pathname) || url.searchParams.get("team") !== String(teamId) ||
          [...url.searchParams.keys()].length !== expectedKeys.length || expectedKeys.some(k => url.searchParams.getAll(k).length !== 1)) throw new Error("Lineup endpoint not permitted")
      if (fixtures + lineups >= 4) throw new Error("Lineup global budget exceeded")
      if (isFixtures) {
        if (fixtures !== 0 || url.searchParams.get("last") !== "5" || url.searchParams.get("timezone") !== "UTC") throw new Error("Lineup fixture budget or parameters invalid")
        fixtures++
      } else {
        const fixtureId = Number(url.searchParams.get("fixture"))
        if (!Number.isSafeInteger(fixtureId) || !permittedFixtures.has(fixtureId) || requestedFixtures.has(fixtureId) || lineups >= 3) throw new Error("Lineup fixture not permitted or budget exceeded")
        lineups++; requestedFixtures.add(fixtureId)
      }
      busy = true
      // Count before transport. Redirects and built-in retries are not allowed.
      const response = await fetchOriginal(url.toString(), { method: "GET", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "x-apisports-key": apiKey } })
      if (response.status === 429) throw new ApiFootballRateLimitError()
      const result = { status: response.status, body: await response.json() }
      const data = readLineupResponse(result)
      if (stopped) throw new Error("Lineup transport was stopped during request")
      if (isFixtures) {
        if (data.length > 5) throw new Error("Fixture response exceeded requested limit")
        for (const value of data) { const fixture = parseFixture(value, teamId, now); if (fixture) permittedFixtures.add(fixture.id) }
      }
      return result
    } catch (error) { stopped = true; throw error } finally { busy = false }
  }
  return {
    request,
    source: {
      fixtures: (id: number) => request(`https://v3.football.api-sports.io/fixtures?team=${id}&last=5&timezone=UTC`),
      lineup: (fixtureId: number, id: number) => request(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}&team=${id}`),
    },
    counters: () => ({ fixtures, lineups, total: fixtures + lineups, stopped }),
    stop: () => { stopped = true },
  }
}
