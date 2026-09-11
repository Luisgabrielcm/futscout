import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { ADDITIONAL_LINEUP_PILOTS, ADDITIONAL_PROTECTED_TABLES, assertAdditionalPilotArguments, runAdditionalOfficialLineupPilot, type AdditionalPilotKey, type AdditionalPilotAudit, type AdditionalPilotDependencies } from "../../../services/officialLineupAdditionalPilot"
import { createOfficialLineupFetchGuard } from "../../../services/officialLineupFetchGuard"
import { createOfficialLineupRepository } from "../../../services/officialLineupRepository"
import { auditAdditionalPilot } from "../../../services/officialLineupAdditionalPilotRuntime"
import { parseFixture, parseOfficialLineup } from "../../../lib/officialLineup"
import { fixturePayload, lineupPayload, lineupCatalog, lineupNow } from "../../fixtures/officialLineup"

function fake(key: AdditionalPilotKey) {
  const target = ADDITIONAL_LINEUP_PILOTS[key]
  const fixtures = [1, 2, 3, 4, 5].map(id => { const f = fixturePayload(id); f.teams.home = { id: target.apiFootballId, name: target.name }; return f })
  const payload = lineupPayload(); payload[0].team.id = target.apiFootballId
  const calls: string[] = [], writes: string[] = [], events: Record<string, unknown>[] = []
  const barcelona = { clubId: "barcelona", revision: 1, contentHash: "synthetic-barcelona-hash", payload: "unchanged" }
  const state: AdditionalPilotAudit = {
    barcelonaIntact: true,
    tables: Object.fromEntries(ADDITIONAL_PROTECTED_TABLES.map(t => [t, { count: "10", hash: `same-${t}` }])),
    otherSnapshots: { count: "1", hash: JSON.stringify(barcelona) }, targetSnapshots: 0, totalSnapshots: 1,
  }
  const guard = createOfficialLineupFetchGuard("synthetic-key", async (url, init) => {
    calls.push(url); assert.equal(init.method, "GET"); assert.equal(init.redirect, "error")
    return { status: 200, json: async () => ({ errors: [], response: url.includes("/lineups") ? payload : fixtures }) }
  }, target.apiFootballId, lineupNow)
  const deps: AdditionalPilotDependencies = {
    readClubs: async () => [target], audit: async () => structuredClone(state), source: guard.source,
    readPlayers: async () => lineupCatalog,
    save: async (clubId, lineup) => {
      assert.equal(clubId, target.id); assert.equal(lineup.apiTeamId, target.apiFootballId)
      writes.push(clubId); state.targetSnapshots++; state.totalSnapshots++
      return { status: "created", snapshotId: "new", contentHash: "synthetic-new" }
    },
    report: event => { events.push(event) }, close: async () => { guard.stop() },
  }
  return { target, fixtures, payload, calls, writes, events, barcelona, state, guard, deps }
}

for (const key of ["city", "real"] as const) {
  test(`${key}: exact identity, official lineup, single isolated write and Barcelona preserved`, async () => {
    const f = fake(key), original = structuredClone(f.barcelona), hashes = structuredClone(f.state.tables)
    const result = await runAdditionalOfficialLineupPilot(key, f.deps, lineupNow)
    assert.equal(result.status, "created"); assert.equal(result.requests, 2)
    assert.deepEqual(result.startXI, { resolved: 11, unresolved: 0, conflicts: 0 })
    assert.deepEqual(result.substitutes, { resolved: 1, unresolved: 0, conflicts: 0 })
    assert.deepEqual(f.writes, [f.target.id]); assert.equal(f.state.targetSnapshots, 1); assert.equal(f.state.totalSnapshots, 2)
    assert.deepEqual(f.barcelona, original); assert.equal(f.state.otherSnapshots.hash, JSON.stringify(original)); assert.deepEqual(f.state.tables, hashes)
    assert.ok(f.calls.every(url => new URL(url).searchParams.get("team") === String(f.target.apiFootballId)))
    assert.deepEqual(f.guard.counters(), { fixtures: 1, lineups: 1, total: 2, stopped: true })
    assert.equal(f.events[0].event, "before-snapshot-write"); assert.equal(f.events.at(-1)?.event, "final-audit")
  })
  test(`${key}: wrong club, wrong team ID, name or ambiguous identity stops before HTTP`, async () => {
    for (const clubs of [[], [{ ...ADDITIONAL_LINEUP_PILOTS[key], id: "wrong" }], [{ ...ADDITIONAL_LINEUP_PILOTS[key], apiFootballId: 529 }], [{ ...ADDITIONAL_LINEUP_PILOTS[key], name: "Wrong club" }], [ADDITIONAL_LINEUP_PILOTS[key], ADDITIONAL_LINEUP_PILOTS[key]]]) {
      const f = fake(key); f.deps.readClubs = async () => clubs
      await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /identity/)
      assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.guard.counters().stopped, true)
    }
  })
  test(`${key}: duplicate snapshot aborts before HTTP or write`, async () => {
    const f = fake(key); f.state.targetSnapshots = 1; f.state.totalSnapshots = 2
    await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /already has/)
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0)
  })
  test(`${key}: fifth request blocked BEFORE fetch, no retry`, async () => {
    const f = fake(key); await f.guard.source.fixtures(f.target.apiFootballId)
    for (const id of [1, 2, 3]) await f.guard.source.lineup(id, f.target.apiFootballId)
    await assert.rejects(f.guard.source.lineup(4, f.target.apiFootballId), /budget/)
    await assert.rejects(f.guard.source.lineup(5, f.target.apiFootballId), /stopped/)
    assert.equal(f.calls.length, 4); assert.equal(f.writes.length, 0)
  })
  test(`${key}: invalid lineup or provider wrong team never writes, budget remains four`, async () => {
    for (const wrongTeam of [false, true]) {
      const f = fake(key)
      if (wrongTeam) f.payload[0].team.id = 529
      else f.payload[0].startXI.pop()
      await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /No valid/)
      assert.equal(f.calls.length, 4); assert.equal(f.writes.length, 0); assert.equal(f.guard.counters().stopped, true)
    }
  })
  test(`${key}: catalog conflict fails before write; unresolved is preserved without name matching`, async () => {
    const f = fake(key); f.deps.readPlayers = async () => [...lineupCatalog, { ...lineupCatalog[0], id: "duplicate" }]
    await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /conflict/)
    assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 2)
    const g = fake(key); g.deps.readPlayers = async () => []
    const result = await runAdditionalOfficialLineupPilot(key, g.deps, lineupNow)
    assert.equal(result.startXI.unresolved, 11); assert.equal(result.substitutes.unresolved, 1); assert.equal(g.writes.length, 1)
  })
  test(`${key}: protected table or Barcelona drift before save fails closed`, async () => {
    for (const other of [false, true]) {
      const f = fake(key); let audits = 0
      f.deps.audit = async () => {
        if (++audits > 1) {
          if (other) f.state.otherSnapshots.hash = "changed-barcelona"
          else f.state.tables.League.hash = "changed-league"
        }
        return structuredClone(f.state)
      }
      await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /audit/)
      assert.equal(f.writes.length, 0); assert.equal(f.guard.counters().stopped, true)
    }
  })
  test(`${key}: exact single authorization flag, no combined or cross-club execution`, () => {
    assert.doesNotThrow(() => assertAdditionalPilotArguments(key, [`--execute-${ADDITIONAL_LINEUP_PILOTS[key].slug}-official-lineup`]))
    for (const args of [[], ["--execute"], ["--execute-barcelona-official-lineup"], ["--execute-manchester-city-official-lineup", "--execute-real-madrid-official-lineup"]]) assert.throws(() => assertAdditionalPilotArguments(key, args))
    const other = key === "city" ? "real" : "city"
    assert.throws(() => assertAdditionalPilotArguments(key, [`--execute-${ADDITIONAL_LINEUP_PILOTS[other].slug}-official-lineup`]))
  })
  test(`${key}: approved writer checks target empty INSIDE serializable transaction, no second snapshot`, async () => {
    const f = fake(key), calls: string[] = []
    let count = 0
    const tx = {
      club: { findUnique: async () => ({ apiFootballId: f.target.apiFootballId }) },
      clubOfficialLineupSnapshot: {
        count: async (args: unknown) => { calls.push("count"); assert.deepEqual(args, { where: { clubId: f.target.id } }); return count },
        findFirst: async () => null,
        create: async ({ data }: { data: { clubId: string } }) => { calls.push("create"); assert.equal(data.clubId, f.target.id); count++; return { id: "first" } },
      },
    }
    const db = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => { calls.push("transaction"); assert.equal(options.isolationLevel, "Serializable"); return fn(tx) } } as unknown as PrismaClient
    const writer = createOfficialLineupRepository(db, { requireEmptyClub: true })
    const lineup = parseOfficialLineup(parseFixture(f.fixtures[0], f.target.apiFootballId, lineupNow)!, f.payload, f.target.apiFootballId, lineupNow.toISOString())!
    await writer.saveOfficialLineupSnapshot(f.target.id, lineup, lineupNow)
    await assert.rejects(writer.saveOfficialLineupSnapshot(f.target.id, lineup, lineupNow), /already has/)
    assert.equal(count, 1); assert.deepEqual(calls, ["transaction", "count", "create", "transaction", "count"])
  })
}

test("additional audit reads eight fixed tables and non-target snapshots in READ ONLY transaction", async () => {
  const queries: { sql: string; values: unknown[] }[] = [], order: string[] = []
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray) => { assert.equal(strings[0], "SET TRANSACTION READ ONLY"); order.push("read-only") },
    $queryRaw: async (query: { sql: string; values: unknown[] }) => { order.push("query"); queries.push(query); return [{ count: "1", hash: "same" }] },
    clubOfficialLineupSnapshot: { count: async () => 0, findMany: async () => [{ fixtureExternalId: 1635628, revision: 1, payloadVersion: 1, formation: "4-3-3", contentHash: "1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11" }] },
  }
  const db = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "RepeatableRead"); return fn(tx) } } as unknown as PrismaClient
  const result = await auditAdditionalPilot(db, "target")
  assert.equal(order[0], "read-only"); assert.equal(queries.length, 9)
  for (const table of ADDITIONAL_PROTECTED_TABLES) assert.ok(queries.some(q => q.sql.includes(`FROM "${table}" t`)))
  assert.match(queries[8].sql, /WHERE "clubId" <>/); assert.deepEqual(queries[8].values, ["target"])
  assert.deepEqual(result.otherSnapshots, { count: "1", hash: "same" }); assert.equal(result.targetSnapshots, 0)
  assert.equal(result.barcelonaIntact, true)
})
test("changed Barcelona baseline blocks both pilots before any request", async () => {
  for (const key of ["city", "real"] as const) {
    const f = fake(key); f.state.barcelonaIntact = false
    await assert.rejects(runAdditionalOfficialLineupPilot(key, f.deps, lineupNow), /audit/)
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0)
  }
})
test("post-write audit failure is reported, closes transport and never retries or repairs", async () => {
  const f = fake("city"), save = f.deps.save
  f.deps.save = async (...args) => { const result = await save(...args); f.state.otherSnapshots.hash = "external-drift"; return result }
  await assert.rejects(runAdditionalOfficialLineupPilot("city", f.deps, lineupNow), /final audit mismatch/)
  assert.equal(f.writes.length, 1); assert.equal(f.guard.counters().stopped, true)
})
test("standalone runners guard arguments before runtime import and execute only their fixed target", () => {
  for (const [file, key] of [["ManchesterCity", "city"], ["RealMadrid", "real"]]) {
    const code = readFileSync(`scripts/runOfficialLineup${file}Pilot.ts`, "utf8")
    assert.ok(code.indexOf(`assertAdditionalPilotArguments("${key}", process.argv`) < code.indexOf('import("../services/officialLineupAdditionalPilotRuntime")'))
    assert.equal((code.match(/await executeAdditionalPilot\(/g) ?? []).length, 1)
    assert.ok(code.includes(`await executeAdditionalPilot("${key}")`)); assert.doesNotMatch(code, /dotenv|process\.env|fetch\(/)
  }
})
