import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import Statistics from "../../../app/components/PlayerSeasonStatistics"
import { projectRealStatistics, statisticsForSeason, type RealStatisticRow } from "../../../lib/realStatistics"

const row: RealStatisticRow = { id: "a", season: 2025, apiTeamId: 1, apiLeagueId: 2,
  teamName: "Club A", competitionName: "Cup A", position: "Midfielder",
  appearances: 0, minutes: null, goals: 0, assists: null }

test("projection preserves zero/absence, removes uncertain metrics and never uses updatedAt", () => {
  const result = projectRealStatistics([{ ...row, ...{ rating: 8, passes: 900, updatedAt: new Date() } }])[0]
  assert.equal(result.appearances, 0)
  assert.equal(result.minutes, null)
  assert.equal(result.observedAt, null)
  assert.equal(result.coverage, "unknown")
  assert.ok(!("rating" in result) && !("passes" in result) && !("updatedAt" in result))
  assert.equal(projectRealStatistics([{ ...row, minutes: -1 }])[0].minutes, null)
})

test("season projection preserves separate teams/competitions and empty season", () => {
  const rows = projectRealStatistics([row, { ...row, id: "b", teamName: "Club B", apiTeamId: 3 }, { ...row, id: "c", season: 2024 }])
  assert.equal(statisticsForSeason(rows, 2025).length, 2)
  assert.equal(statisticsForSeason(rows, 2023).length, 0)
})

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: rendering is network-free, with safe GK, partial and empty states`, () => {
    const previous = globalThis.fetch
    globalThis.fetch = () => { throw Error("UNEXPECTED_NETWORK") }
    try {
      const rows = projectRealStatistics([row, { ...row, id: "b", competitionName: "Cup B" }])
      const html = renderToStaticMarkup(createElement(Statistics, { locale, rows }))
      assert.match(html, /Cup A/); assert.match(html, /Cup B/)
      assert.match(html, /<dd>0<\/dd>/); assert.match(html, /<dd>—<\/dd>/)
      assert.doesNotMatch(html, /2025\/26/)
      const gk = renderToStaticMarkup(createElement(Statistics, { locale, rows: projectRealStatistics([{ ...row, position: "Goalkeeper" }]) }))
      assert.doesNotMatch(gk, /<dt>Gols|<dt>Goals|Reflex/)
      assert.match(gk, /cobertura|coverage/)
      const empty = renderToStaticMarkup(createElement(Statistics, { locale, rows: [] }))
      assert.match(empty, /indisponíveis|unavailable/)
    } finally { globalThis.fetch = previous }
  })
}
