import assert from "node:assert/strict"
import test from "node:test"
import { clubWriteFixture } from "../../fixtures/clubIdentityWrite"
import { CITY_FIRST_IDENTITY_BATCH, cityFirstIdentityBatchConfig } from "../../../services/clubIdentityPilotConfig"
import { rankClubIdentityAutoMatches, selectedClubIdentityAutoMatches } from "../../../services/clubIdentityBatchSelection"
import { clubIdentityWriteToken, createClubIdentityAuthorizationSummary, planClubIdentityAutoWrite } from "../../../services/clubIdentityAuthorization"
import { executeClubIdentityAutoWrite } from "../../../services/clubIdentityAutoWrite"
import { dispatchClubIdentityRunner, parseClubIdentityRunnerArgs, requireCityFirstIdentityBatch } from "../../../services/clubIdentityRunner"
import type { ApiFootballTeamPlayer } from "../../../services/getApiFootballTeamPlayers"

// Synthetic names/births/roster, actual reviewed identity/order. No real DB/env/network.
function selectedFixture() {
  const f = clubWriteFixture(10, 50, "manchester-city")
  const roster = f.db.evidence.cache!.players as ApiFootballTeamPlayer[]
  CITY_FIRST_IDENTITY_BATCH.forEach((c, i) => {
    Object.assign(f.db.evidence.players[i], { id: c.playerId, slug: c.slug })
    roster[i].player.id = c.providerId
  })
  f.config.orderedBatchCandidates = CITY_FIRST_IDENTITY_BATCH
  return f
}
const ids = CITY_FIRST_IDENTITY_BATCH.map(c => c.playerId)

test("explicit five of ten preserve all matcher outcomes, order, deferred candidates and idempotency", async () => {
  const f = selectedFixture(), input = f.input(), before = structuredClone(f.db.evidence.players.slice(5))
  assert.equal(input.report.counts.AUTO_MATCH, 10)
  assert.deepEqual(createClubIdentityAuthorizationSummary(input.report).summary.orderedAutoMatchCandidates.map(c => c.playerId), ids)
  const plan = planClubIdentityAutoWrite(input.report)
  assert.equal(plan.selectedAutoMatches, 5); assert.equal(plan.actions.filter(a => a.action === "DEFER").length, 5)
  assert.deepEqual(plan.actions.filter(a => a.action === "ATOMIC_CANDIDATE").map(a => a.playerId), ids)
  const r = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(r.stopped, false); assert.equal(r.auditFailure, false)
  assert.deepEqual(r.results.map(r => r.status), Array(5).fill("MATCHED"))
  assert.deepEqual(r.committedPlayerIds, ids)
  assert.deepEqual(f.db.events, ids.flatMap(id => [`update:${id}`, `attempt:${id}`, `commit:${id}`]))
  assert.deepEqual(f.db.evidence.players.slice(5), before)
  assert.equal(r.skipped.filter(s => s.action === "DEFER" && s.decision === "AUTO_MATCH").length, 5)
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  const again = await f.run()
  assert.equal(again.stopped, false); assert.deepEqual(again.results, [])
  assert.equal(again.skipped.filter(s => s.action === "NO_OP").length, 5)
  assert.equal(f.db.writeTransactions, 5); assert.equal(f.db.attempts.length, 5)
})

for (const position of [1, 3, 5]) test(`City selected batch attempt failure ${position}: rollback current, no replacement or continuation`, async () => {
  const f = selectedFixture(); f.db.failAttemptFor = ids[position - 1]
  const r = await f.run()
  assert.equal(r.stopReason, "ATTEMPT_FAILURE"); assert.equal(r.auditFailure, false); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids.slice(0, position - 1))
  assert.deepEqual(r.notExecutedPlayerIds, ids.slice(position))
  assert.equal(f.db.writeTransactions, position); assert.equal(f.db.attempts.length, position - 1)
  assert.ok(f.db.evidence.players.slice(position - 1).every(p => p.apiFootballId === null && p.attempt === null))
})

for (const position of [1, 3, 5]) for (const committed of [false, true]) {
  test(`City indeterminate ${position}, fake server committed=${committed}: STOP, zero retry`, async () => {
    const f = selectedFixture(); f.db.indeterminateFor = ids[position - 1]; f.db.commitDespiteError = committed
    const r = await f.run()
    assert.equal(r.stopReason, "INDETERMINATE_COMMIT"); assert.equal(r.stopped, true); assert.equal(r.retries, 0)
    assert.deepEqual(r.committedPlayerIds, ids.slice(0, position - 1))
    assert.deepEqual(r.indeterminatePlayerIds, [ids[position - 1]])
    assert.deepEqual(r.notExecutedPlayerIds, ids.slice(position))
    assert.equal(f.db.writeTransactions, position)
    assert.equal(f.db.attempts.length, position - 1 + Number(committed))
    assert.ok(f.db.evidence.players.slice(position).every(p => p.apiFootballId === null && p.attempt === null))
  })
}

test("City provider conflict at four stops before its update and never starts five", async () => {
  const f = selectedFixture()
  f.db.onWrite = draft => { if (f.db.writeTransactions === 4) draft.players[9].apiFootballId = CITY_FIRST_IDENTITY_BATCH[3].providerId }
  const r = await f.run()
  assert.equal(r.stopReason, "CONFLICT_PROVIDER_ID_TAKEN"); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids.slice(0, 3)); assert.deepEqual(r.notExecutedPlayerIds, [ids[4]])
  assert.equal(f.db.events.includes(`update:${ids[3]}`), false)
  assert.equal(f.db.writeTransactions, 4); assert.equal(f.db.attempts.length, 3)
})

test("City updatedAt changed at four blocks the conditional update", async () => {
  const f = selectedFixture()
  f.db.onWrite = draft => { if (f.db.writeTransactions === 4) draft.players[3].updatedAt = new Date("2026-09-11") }
  const r = await f.run()
  assert.equal(r.stopReason, "CONCURRENT_MODIFICATION"); assert.deepEqual(r.committedPlayerIds, ids.slice(0, 3))
  assert.deepEqual(r.notExecutedPlayerIds, [ids[4]]); assert.equal(f.db.events.includes(`update:${ids[3]}`), false)
})

for (const kind of ["sixth", "remove", "order", "substitute", "updatedAt"] as const) {
  test(`City summary ${kind} mutation rejects before any DB dependency`, async () => {
    const f = selectedFixture(), input = f.input()
    const s = input.summary as ReturnType<typeof createClubIdentityAuthorizationSummary>["summary"]
    if (kind === "sixth") s.orderedAutoMatchCandidates.push({ ...s.orderedAutoMatchCandidates[4], playerId: "local-5", slug: "person-5", providerId: 1005 })
    if (kind === "remove") s.orderedAutoMatchCandidates.pop()
    if (kind === "order") s.orderedAutoMatchCandidates.reverse()
    if (kind === "substitute") Object.assign(s.orderedAutoMatchCandidates[4], { playerId: "local-5", slug: "person-5", providerId: 1005 })
    if (kind === "updatedAt") s.orderedAutoMatchCandidates[3].expectedUpdatedAt = "2026-09-11T00:00:00.000Z"
    await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
    assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
  })
}

test("selected candidate becoming review stops instead of taking the sixth", async () => {
  const f = selectedFixture(), input = f.input()
  f.db.evidence.players[4].position = "GOL"
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /BATCH_CANDIDATE_NOT_ELIGIBLE/)
  assert.equal(f.db.writeTransactions, 0)
})

test("missing, duplicate, empty or sixth member is never accepted as an explicit selection", () => {
  for (const kind of ["empty", "duplicate", "missing", "sixth"]) {
    const f = selectedFixture(), report = f.input().report
    const list: { playerId: string; slug: string; providerId: number }[] = [...CITY_FIRST_IDENTITY_BATCH]
    if (kind === "empty") list.splice(0)
    if (kind === "duplicate") list[4] = list[0]
    if (kind === "missing") list[4] = { ...list[4], slug: "wrong" }
    if (kind === "sixth") list.push({ playerId: "local-5", slug: "person-5", providerId: 1005 })
    report.config.orderedBatchCandidates = list
    assert.throws(() => selectedClubIdentityAutoMatches(report), /BATCH_SELECTION|BATCH_CANDIDATE/)
  }
})

function cityDispatchFixture() {
  const f = selectedFixture(), report = f.input().report
  // Dispatcher-only evidence. Real matcher/atomic adapter are tested above with the fake DB.
  report.config = cityFirstIdentityBatchConfig()
  report.cache = { ...report.cache, rowHash: report.config.cache.expectedRowHash!, count: 30 }
  report.snapshotHash = report.config.snapshot.expectedHash!
  report.totalProviderPlayers = 30
  while (report.rows.length < 30) report.rows.push({ ...structuredClone(report.rows[0]), providerPlayerId: 900000 + report.rows.length,
    localCandidate: null, decision: "UNRESOLVED" })
  for (const r of report.rows) {
    const index = CITY_FIRST_IDENTITY_BATCH.findIndex(c => c.providerId === r.providerPlayerId)
    r.lineupEvidence.present = index >= 0
    if (index >= 0) { r.confidence = 100; r.margin = index === 4 ? 65 : 75 }
  }
  const envelope = { head: f.git.head, report, authorization: createClubIdentityAuthorizationSummary(report) }
  const args = ["--write", "--club", "manchester-city", "--season", "2026", "--summary-file", "audit/reports/city.json",
    "--confirmation", clubIdentityWriteToken(report), "--expected-head", f.git.head]
  const events: string[] = []
  const deps = { git: (...a: string[]) => a[0] === "branch" ? f.git.branch : a[0] === "status" ? f.git.clean ? "" : " M file" : f.git.head,
    clock: () => f.clock.now, blockHttp: () => { events.push("block-http") }, readSummary: () => envelope,
    readOnly: async () => { events.push("read-only") },
    loadWrite: async () => { events.push("load-write"); return async () => { events.push("fake-write") } } }
  return { ...f, report, envelope, args, events, deps }
}

test("City ranking reproduces the five proposed members and never modifies the complete report", () => {
  const f = cityDispatchFixture(), before = structuredClone(f.report)
  assert.deepEqual(rankClubIdentityAutoMatches(f.report).slice(0, 5).map(r => r.providerPlayerId), CITY_FIRST_IDENTITY_BATCH.map(c => c.providerId))
  requireCityFirstIdentityBatch(f.report); assert.deepEqual(f.report, before)
  assert.ok(Object.isFrozen(CITY_FIRST_IDENTITY_BATCH)); assert.ok(CITY_FIRST_IDENTITY_BATCH.every(Object.isFrozen))
})

test("City preflight never loads writes; future write dispatcher requires explicit envelope and matching CLI club", async () => {
  const f = cityDispatchFixture()
  await dispatchClubIdentityRunner(["--preflight", "--club", "manchester-city", "--season", "2026"], f.deps)
  assert.deepEqual(f.events, ["block-http", "read-only"])
  f.events.length = 0
  await dispatchClubIdentityRunner(f.args, f.deps)
  assert.deepEqual(f.events, ["block-http", "load-write", "fake-write"])
})

for (const kind of ["sixth", "remove", "order", "Nunes", "slug", "cache", "snapshot", "expired", "head", "branch", "dirty", "token", "cli-club"]) {
  test(`City operational gate rejects ${kind} before loading persistence`, async () => {
    const f = cityDispatchFixture(), list: { playerId: string; slug: string; providerId: number }[] = [...CITY_FIRST_IDENTITY_BATCH]
    if (kind === "sixth") list.push({ playerId: "local-5", slug: "person-5", providerId: 1005 })
    if (kind === "remove") list.pop()
    if (kind === "order") list.reverse()
    if (kind === "Nunes") list[4] = { playerId: "cmt9bqw4h01mvukucjy9of2gn", slug: "matheus-nunes", providerId: 41621 }
    if (kind === "slug") list[4] = { ...list[4], slug: "wrong" }
    f.report.config.orderedBatchCandidates = list
    if (kind === "cache") f.report.cache.rowHash = "changed"
    if (kind === "snapshot") f.report.snapshotHash = "changed"
    if (kind === "expired") f.clock.now = new Date("2026-09-13")
    if (kind === "head") f.args[10] = "b".repeat(40)
    if (kind === "branch") f.git.branch = "master"
    if (kind === "dirty") f.git.clean = false
    if (kind === "token") f.args[8] = "AUTHORIZE_CLUB_IDENTITY_V1:" + "b".repeat(64)
    if (kind === "cli-club") f.args[2] = "fc-barcelona"
    await assert.rejects(dispatchClubIdentityRunner(f.args, f.deps))
    assert.equal(f.events.includes("load-write"), false)
  })
}

test("City CLI rejects missing flags, other seasons and arbitrary club write", () => {
  const f = cityDispatchFixture()
  for (const index of [5, 7, 9]) { const args = [...f.args]; args.splice(index, 2); assert.throws(() => parseClubIdentityRunnerArgs(args)) }
  const season = [...f.args]; season[4] = "2024"; assert.throws(() => parseClubIdentityRunnerArgs(season))
  const other = [...f.args]; other[2] = "unapproved-club"; assert.throws(() => parseClubIdentityRunnerArgs(other))
})
