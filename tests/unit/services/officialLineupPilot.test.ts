import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createOfficialLineupFetchGuard } from "../../../services/officialLineupFetchGuard"
import { BARCELONA_LINEUP_PILOT, runOfficialLineupPilot, type LineupPilotDependencies } from "../../../services/officialLineupPilot"
import { isApiFootballRateLimitError } from "../../../services/apiFootballErrors"
import { fixturePayload, lineupPayload, lineupCatalog, lineupNow } from "../../fixtures/officialLineup"

const response = (data: unknown[]) => ({ status: 200, json: async () => ({ response: data, errors: [] }) })
test("fetch guard permits one fixtures request and three lineups; extra blocked BEFORE transport", async () => {
  const calls: { url: string; options: RequestInit }[] = []
  const guard = createOfficialLineupFetchGuard("synthetic-key", async (url, options) => { calls.push({ url, options }); return response(url.includes("/lineups") ? [] : [1, 2, 3, 4, 5].map(id => fixturePayload(id))) }, 1, lineupNow)
  await guard.source.fixtures(1)
  for (const id of [1, 2, 3]) await guard.source.lineup(id, 1)
  await assert.rejects(guard.source.lineup(4, 1), /budget/)
  assert.equal(calls.length, 4); assert.deepEqual(guard.counters(), { fixtures: 1, lineups: 3, total: 4, stopped: true })
  assert.equal(calls[0].options.redirect, "error"); assert.equal(calls[0].options.method, "GET"); assert.ok(calls[0].options.signal)
})
test("guard rejects host/path/team/extra params/duplicate params and unknown fixture without any fetch", async () => {
  const urls = ["https://evil.test/fixtures?team=1&last=5&timezone=UTC", "https://v3.football.api-sports.io/players?team=1", "https://v3.football.api-sports.io/fixtures?team=2&last=5&timezone=UTC", "https://v3.football.api-sports.io/fixtures?team=1&last=5&timezone=UTC&page=2", "https://v3.football.api-sports.io/fixtures?team=1&team=1&last=5&timezone=UTC", "https://v3.football.api-sports.io/fixtures/lineups?fixture=999&team=1"]
  for (const url of urls) { let calls = 0; const g = createOfficialLineupFetchGuard("test", async () => { calls++; return response([]) }, 1, lineupNow); await assert.rejects(g.request(url)); assert.equal(calls, 0) }
})
test("HTTP 429 and payload quota latch transport stopped, even if caller tries again", async () => {
  for (const result of [{ status: 429, json: async () => { assert.fail("429 must stop before body") } }, { status: 200, json: async () => ({ errors: { requests: "quota exceeded" }, response: [] }) }]) {
    let count = 0; const guard = createOfficialLineupFetchGuard("test", async () => { count++; return result }, 1, lineupNow)
    await assert.rejects(guard.source.fixtures(1), isApiFootballRateLimitError)
    await assert.rejects(guard.source.fixtures(1)); assert.equal(count, 1)
  }
})
test("transport timeout, JSON error and generic HTTP error have no retry", async () => {
  for (const kind of ["network", "json", "http"]) {
    let count = 0
    const guard = createOfficialLineupFetchGuard("test", async () => { count++; if (kind === "network") throw new Error("fake timeout"); return { status: kind === "http" ? 500 : 200, json: async () => { if (kind === "json") throw new SyntaxError("fake JSON"); return {} } } }, 1, lineupNow)
    await assert.rejects(guard.source.fixtures(1)); await assert.rejects(guard.source.fixtures(1)); assert.equal(count, 1)
  }
})
function pilotFake() {
  const calls: string[] = []
  const f = fixturePayload(); f.teams.home.id = 529
  const p = lineupPayload(); p[0].team.id = 529
  const hashes = { Player: { count: "12", hash: "same" }, Club: { count: "1", hash: "same" } }
  const deps: LineupPilotDependencies = {
    readClub: async () => { calls.push("club"); return BARCELONA_LINEUP_PILOT },
    audit: async () => { calls.push("audit"); return hashes },
    source: { fixtures: async () => { calls.push("fixtures"); return { status: 200, body: { response: [f], errors: [] } } }, lineup: async () => { calls.push("lineup"); return { status: 200, body: { response: p, errors: [] } } } },
    readPlayers: async () => { calls.push("players"); return lineupCatalog },
    save: async () => { calls.push("snapshot"); return { status: "created", snapshotId: "new", contentHash: "synthetic" } },
    close: async () => { calls.push("close") },
  }
  return { calls, deps, hashes }
}
test("pilot precheck, resolution, single snapshot, before/after audit and cleanup in order", async () => {
  const f = pilotFake(); const result = await runOfficialLineupPilot(f.deps, lineupNow)
  assert.equal(result.status, "created"); assert.equal(result.requests, 2)
  assert.deepEqual(f.calls, ["club", "audit", "fixtures", "lineup", "players", "audit", "snapshot", "audit", "close"])
})
test("pilot wrong club blocks all HTTP and writes, still cleans up", async () => {
  const f = pilotFake(); f.deps.readClub = async () => null
  await assert.rejects(runOfficialLineupPilot(f.deps, lineupNow)); assert.deepEqual(f.calls, ["close"])
})
test("pilot conflict fails before snapshot; unresolved does not invent association", async () => {
  const f = pilotFake(); f.deps.readPlayers = async () => [...lineupCatalog, { ...lineupCatalog[0], id: "conflict" }]
  await assert.rejects(runOfficialLineupPilot(f.deps, lineupNow), /conflict/)
  assert.ok(!f.calls.includes("snapshot")); assert.equal(f.calls.at(-1), "close")
  const g = pilotFake(); g.deps.readPlayers = async () => []
  const result = await runOfficialLineupPilot(g.deps, lineupNow)
  assert.ok("unresolved" in result); assert.equal(result.unresolved, 12)
})
test("pilot no lineup and quota never save snapshots or invoke matcher", async () => {
  for (const quota of [false, true]) {
    const f = pilotFake(); f.deps.source.lineup = async () => quota ? { status: 429, body: null } : { status: 200, body: { response: [], errors: [] } }
    if (quota) await assert.rejects(runOfficialLineupPilot(f.deps, lineupNow), isApiFootballRateLimitError)
    else assert.equal((await runOfficialLineupPilot(f.deps, lineupNow)).status, "no_lineup")
    assert.ok(!f.calls.includes("snapshot")); assert.equal(f.calls.at(-1), "close")
  }
})
test("protected-table drift aborts before write; audit failures still close", async () => {
  const f = pilotFake(); let audits = 0
  f.deps.audit = async () => ++audits === 1 ? f.hashes : { ...f.hashes, Player: { count: "13", hash: "changed" } }
  await assert.rejects(runOfficialLineupPilot(f.deps, lineupNow), /Protected tables changed/)
  assert.ok(!f.calls.includes("snapshot")); assert.equal(f.calls.at(-1), "close")
})
test("write path has only snapshot create; audit uses a fixed protected-table allowlist and READ ONLY", () => {
  const repository = readFileSync("services/officialLineupRepository.ts", "utf8")
  assert.equal((repository.match(/\.create\(/g) ?? []).length, 1); assert.match(repository, /tx\.clubOfficialLineupSnapshot\.create/)
  assert.doesNotMatch(repository, /\.update\(|\.upsert\(|\.delete|matcher|syncError/)
  const audit = readFileSync("services/officialLineupPilotAudit.ts", "utf8")
  for (const table of ["Player", "Club", "ApiFootballTeamRosterCache", "ApiFootballPlayerMatchAttempt", "SyncState", "SyncError", "PlayerAttributes"]) assert.ok(audit.includes(`"${table}"`))
  assert.match(audit, /SET TRANSACTION READ ONLY/)
  const script = readFileSync("scripts/runOfficialLineupBarcelonaPilot.ts", "utf8")
  assert.ok(script.indexOf("process.argv") < script.indexOf('import("dotenv/config")'))
  assert.match(script, /clubOfficialLineupSnapshot.count\(\)/)
})
