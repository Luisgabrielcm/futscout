import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import * as core from "../../../lib/officialLineup"
import { selectRecentOfficialLineup, readLineupResponse } from "../../../services/officialLineupSelection"
import { isApiFootballRateLimitError } from "../../../services/apiFootballErrors"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { fixturePayload, lineupPayload, lineupCatalog, lineupNow } from "../../fixtures/officialLineup"

const ok = (response: unknown[]) => ({ status: 200, body: { errors: [], response } })
const fixture = () => core.parseFixture(fixturePayload(), 1, lineupNow)!
const normalized = () => core.parseOfficialLineup(fixture(), lineupPayload(), 1, lineupNow.toISOString())!
const service = loadCatalogModule<typeof import("../../../services/officialLineupService")>("services/officialLineupService.ts", { "server-only": {}, "../lib/officialLineup": core, "./officialLineupCapability": { getOfficialLineupReadStore: async () => null } })

test("latest completed fixture with valid lineup wins, independent of source order", async () => {
  const calls: number[] = []
  const result = await selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => ok([fixturePayload(99, "2026-09-09"), fixturePayload()]), lineup: async id => { calls.push(id); return ok(lineupPayload()) } })
  assert.equal(result.lineup?.fixture.id, 100); assert.deepEqual(calls, [100]); assert.equal(result.requests, 2)
})
test("last fixture without lineup walks back and stops at first valid one", async () => {
  const calls: number[] = []
  const result = await selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => ok([fixturePayload(), fixturePayload(99, "2026-09-09")]), lineup: async id => { calls.push(id); return ok(id === 100 ? [] : lineupPayload()) } })
  assert.deepEqual(calls, [100, 99]); assert.equal(result.lineup?.fixture.id, 99)
})
test("budget: exactly one fixture and at most three lineup requests, no retry", async () => {
  let count = 0
  const result = await selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => ok(Array.from({ length: 10 }, (_, i) => fixturePayload(i + 1))), lineup: async () => { count++; return ok([]) } })
  assert.equal(count, 3); assert.equal(result.requests, 4); assert.equal(result.lineup, null)
})
for (const limit of [{ status: 429, body: null }, { status: 200, body: { errors: { requests: "quota reached" }, response: [] } }]) {
  test(`fail-stop ${limit.status} at fixture stage`, async () => {
    let calls = 0
    await assert.rejects(selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => limit, lineup: async () => { calls++; return ok([]) } }), isApiFootballRateLimitError)
    assert.equal(calls, 0)
  })
  test(`fail-stop ${limit.status} during lineup walk-back`, async () => {
    let calls = 0
    await assert.rejects(selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => ok([fixturePayload(), fixturePayload(99)]), lineup: async () => { calls++; return limit } }), isApiFootballRateLimitError)
    assert.equal(calls, 1)
  })
}
test("generic/JSON errors propagate without retry, not confused with quota", async () => {
  for (const bad of [{ status: 500, body: {} }, { status: 200, body: "invalid JSON" }, { status: 200, body: { errors: { token: "invalid" }, response: [] } }]) {
    assert.throws(() => readLineupResponse(bad), error => !isApiFootballRateLimitError(error))
  }
  let calls = 0
  await assert.rejects(selectRecentOfficialLineup(1, lineupNow, { fixtures: async () => ok([fixturePayload(), fixturePayload(99)]), lineup: async () => { calls++; throw new SyntaxError("fake JSON") } }))
  assert.equal(calls, 1)
})
test("wrong club, future, cancelled and outside-window fixtures are excluded", () => {
  assert.equal(core.parseFixture(fixturePayload(), 3, lineupNow), null)
  assert.equal(core.parseFixture(fixturePayload(100, "2026-09-12"), 1, lineupNow), null)
  assert.equal(core.parseFixture(fixturePayload(100, "2025-01-01"), 1, lineupNow), null)
  const value = fixturePayload(); value.fixture.status.short = "PST"
  assert.equal(core.parseFixture(value, 1, lineupNow), null)
})
test("formation, XI, substitutes, provider IDs, shirt number and grid preserved", () => {
  const result = normalized()
  assert.equal(result.startXI.length, 11); assert.equal(result.formation, "4-3-3")
  assert.equal(result.substitutes?.[0].apiFootballId, 12); assert.equal(result.startXI[0].grid, "1:1"); assert.equal(result.startXI[0].number, 1)
})
test("invalid count, duplicate starter/bench IDs and wrong team are rejected", () => {
  for (const change of [(p: ReturnType<typeof lineupPayload>) => { p[0].startXI.pop() }, (p: ReturnType<typeof lineupPayload>) => { p[0].substitutes[0].player.id = 1 }, (p: ReturnType<typeof lineupPayload>) => { p[0].team.id = 2 }]) {
    const p = lineupPayload(); change(p); assert.equal(core.parseOfficialLineup(fixture(), p, 1, lineupNow.toISOString()), null)
  }
})
test("only existing unique provider identity associates; names and OVR do not", () => {
  const result = core.associateOfficialLineup(normalized(), [...lineupCatalog, { ...lineupCatalog[0], id: "extra", apiFootballId: 999, officialOverall: 99 }], lineupNow)
  assert.deepEqual(result.startXI.map(p => p.apiFootballId), Array.from({ length: 11 }, (_, i) => i + 1))
  assert.equal(result.startXI[0].catalog?.id, "local-1")
  assert.equal(core.associateOfficialLineup(normalized(), [{ ...lineupCatalog[0], apiFootballId: 999, name: "Source 1" }], lineupNow).startXI[0].catalog, null)
})
test("unresolved and ambiguous identity never pick another catalogue player", () => {
  const p = lineupPayload(); p[0].startXI[0].player.id = null
  const result = core.associateOfficialLineup(core.parseOfficialLineup(fixture(), p, 1, lineupNow.toISOString())!, lineupCatalog, lineupNow)
  assert.equal(result.startXI[0].catalog, null)
  assert.equal(core.associateOfficialLineup(normalized(), [...lineupCatalog, { ...lineupCatalog[0], id: "duplicate" }], lineupNow).startXI[0].catalog, null)
})
test("official grid controls rows; missing formation is never recalculated", () => {
  const p = lineupPayload(); p[0].formation = null
  const result = core.associateOfficialLineup(core.parseOfficialLineup(fixture(), p, 1, lineupNow.toISOString())!, [], lineupNow)
  assert.equal(result.formation, null); assert.deepEqual(result.rows?.map(r => r.length), [3, 3, 4, 1]); assert.equal(result.rows?.at(-1)?.[0].apiFootballId, 1)
})
test("without grid use compatible formation and source positions; otherwise no invented placement", () => {
  const p = lineupPayload(); p[0].startXI.forEach(v => { v.player.grid = null })
  assert.deepEqual(core.associateOfficialLineup(core.parseOfficialLineup(fixture(), p, 1, lineupNow.toISOString())!, [], lineupNow).rows?.map(r => r.length), [3, 3, 4, 1])
  p[0].formation = "4-2-3-1"
  assert.equal(core.associateOfficialLineup(core.parseOfficialLineup(fixture(), p, 1, lineupNow.toISOString())!, [], lineupNow).rows, null)
})
test("stale is based on fixture date, not recent refresh date", () => {
  const lineup = normalized(); lineup.fixture.date = "2026-08-01T00:00:00Z"
  assert.equal(core.associateOfficialLineup(lineup, [], lineupNow).stale, true)
  assert.equal(core.associateOfficialLineup(normalized(), [], lineupNow).stale, false)
})
test("read service is disabled without a store and cannot access API or DB", async () => {
  assert.equal(await service.getLatestOfficialClubLineup("club"), null)
})
test("read service revalidates snapshots and resolves all IDs with one catalogue read", async () => {
  let reads = 0
  const value = await service.getLatestOfficialClubLineup("club", {
    readSnapshots: async () => [{ clubId: "club", apiTeamId: 1, payloadVersion: 1, fixture: fixturePayload(), response: lineupPayload(), fetchedAt: lineupNow.toISOString() }],
    readPlayersByApiIds: async ids => { reads++; assert.equal(ids.length, 12); return lineupCatalog },
  }, lineupNow)
  assert.equal(reads, 1); assert.equal(value?.startXI.length, 11)
})
test("read service rejects cross-club snapshots without querying players", async () => {
  const value = await service.getLatestOfficialClubLineup("club", { readSnapshots: async () => [{ clubId: "other", apiTeamId: 1, payloadVersion: 1, fixture: fixturePayload(), response: lineupPayload(), fetchedAt: lineupNow.toISOString() }], readPlayersByApiIds: async () => { assert.fail("unexpected catalogue read") } }, lineupNow)
  assert.equal(value, null)
})
test("public boundary has no operational imports, fetch, secrets or writes", () => {
  for (const file of ["services/officialLineupService.ts", "lib/officialLineup.ts", "app/components/OfficialLineupPanel.tsx"]) {
    const source = readFileSync(file, "utf8")
    assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|officialLineupSelection|resolveApiFootball|\.upsert\(|\.create\(/)
  }
  assert.match(readFileSync("services/officialLineupService.ts", "utf8"), /import "server-only"/)
})
