import assert from "node:assert/strict"
import test from "node:test"
import { clubWriteFixture } from "../../fixtures/clubIdentityWrite"
import { REAL_FIRST_IDENTITY_BATCH, realFirstIdentityBatchConfig } from "../../../services/clubIdentityPilotConfig"
import { rankClubIdentityAutoMatches, selectedClubIdentityAutoMatches } from "../../../services/clubIdentityBatchSelection"
import { clubIdentityWriteToken, createClubIdentityAuthorizationSummary, planClubIdentityAutoWrite } from "../../../services/clubIdentityAuthorization"
import { executeClubIdentityAutoWrite } from "../../../services/clubIdentityAutoWrite"
import { dispatchClubIdentityRunner, parseClubIdentityRunnerArgs, requireRealFirstIdentityBatch } from "../../../services/clubIdentityRunner"
import type { ApiFootballTeamPlayer } from "../../../services/getApiFootballTeamPlayers"

// Synthetic names/births/roster, actual reviewed identity/order. No real DB/env/network.
function selectedFixture() {
  const f = clubWriteFixture(9, 541, "real-madrid")
  const roster = f.db.evidence.cache!.players as ApiFootballTeamPlayer[]
  REAL_FIRST_IDENTITY_BATCH.forEach((c, i) => {
    Object.assign(f.db.evidence.players[i], { id: c.playerId, slug: c.slug })
    roster[i].player.id = c.providerId
  })
  f.config.orderedBatchCandidates = REAL_FIRST_IDENTITY_BATCH
  f.config.ineligibleBatchPolicy = "DEFER"
  Object.assign(f.db.evidence.players[5], { id: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim" })
  roster[5].player.id = 744
  roster[6].player.id = 291964
  roster[7].player.id = 341640
  roster[8].player.id = 361497
  return f
}
const ids = REAL_FIRST_IDENTITY_BATCH.map(c => c.playerId)

test("explicit Real five of nine preserve all matcher outcomes, order, deferred candidates and idempotency", async () => {
  const f = selectedFixture(), input = f.input(), before = structuredClone(f.db.evidence.players.slice(5))
  assert.equal(input.report.counts.AUTO_MATCH, 9)
  assert.deepEqual(createClubIdentityAuthorizationSummary(input.report).summary.orderedAutoMatchCandidates.map(c => c.playerId), ids)
  const plan = planClubIdentityAutoWrite(input.report)
  assert.equal(plan.selectedAutoMatches, 5); assert.equal(plan.actions.filter(a => a.action === "DEFER").length, 4)
  assert.deepEqual(plan.actions.filter(a => a.action === "ATOMIC_CANDIDATE").map(a => a.playerId), ids)
  const r = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(r.stopped, false); assert.equal(r.auditFailure, false)
  assert.deepEqual(r.results.map(r => r.status), Array(5).fill("MATCHED"))
  assert.deepEqual(r.committedPlayerIds, ids)
  assert.deepEqual(f.db.events, ids.flatMap(id => [`update:${id}`, `attempt:${id}`, `commit:${id}`]))
  assert.deepEqual(f.db.evidence.players.slice(5), before)
  assert.equal(r.skipped.filter(s => s.action === "DEFER" && s.decision === "AUTO_MATCH").length, 4)
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  const again = await f.run()
  assert.equal(again.stopped, false); assert.deepEqual(again.results, [])
  assert.equal(again.skipped.filter(s => s.action === "NO_OP").length, 5)
  assert.equal(f.db.writeTransactions, 5); assert.equal(f.db.attempts.length, 5)
})

for (const position of [1, 3, 5]) test(`Real selected batch attempt failure ${position}: rollback current, no replacement or continuation`, async () => {
  const f = selectedFixture(); f.db.failAttemptFor = ids[position - 1]
  const r = await f.run()
  assert.equal(r.stopReason, "ATTEMPT_FAILURE"); assert.equal(r.auditFailure, false); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids.slice(0, position - 1))
  assert.deepEqual(r.notExecutedPlayerIds, ids.slice(position))
  assert.equal(f.db.writeTransactions, position); assert.equal(f.db.attempts.length, position - 1)
  assert.ok(f.db.evidence.players.slice(position - 1).every(p => p.apiFootballId === null && p.attempt === null))
})

for (const position of [1, 3, 5]) for (const committed of [false, true]) {
  test(`Real indeterminate ${position}, fake server committed=${committed}: STOP, zero retry`, async () => {
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

test("Real provider conflict at four stops before its update and never starts five", async () => {
  const f = selectedFixture()
  f.db.onWrite = draft => { if (f.db.writeTransactions === 4) draft.players[8].apiFootballId = REAL_FIRST_IDENTITY_BATCH[3].providerId }
  const r = await f.run()
  assert.equal(r.stopReason, "CONFLICT_PROVIDER_ID_TAKEN"); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids.slice(0, 3)); assert.deepEqual(r.notExecutedPlayerIds, [ids[4]])
  assert.equal(f.db.events.includes(`update:${ids[3]}`), false)
  assert.equal(f.db.writeTransactions, 4); assert.equal(f.db.attempts.length, 3)
})

test("Real updatedAt changed at four blocks the conditional update", async () => {
  const f = selectedFixture()
  f.db.onWrite = draft => { if (f.db.writeTransactions === 4) draft.players[3].updatedAt = new Date("2026-09-11") }
  const r = await f.run()
  assert.equal(r.stopReason, "CONCURRENT_MODIFICATION"); assert.deepEqual(r.committedPlayerIds, ids.slice(0, 3))
  assert.deepEqual(r.notExecutedPlayerIds, [ids[4]]); assert.equal(f.db.events.includes(`update:${ids[3]}`), false)
})

for (const kind of ["sixth", "remove", "order", "substitute", "updatedAt"] as const) {
  test(`Real summary ${kind} mutation rejects before any DB dependency`, async () => {
    const f = selectedFixture(), input = f.input()
    const s = input.summary as ReturnType<typeof createClubIdentityAuthorizationSummary>["summary"]
    if (kind === "sixth") s.orderedAutoMatchCandidates.push({ ...s.orderedAutoMatchCandidates[4], playerId: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim", providerId: 744 })
    if (kind === "remove") s.orderedAutoMatchCandidates.pop()
    if (kind === "order") s.orderedAutoMatchCandidates.reverse()
    if (kind === "substitute") Object.assign(s.orderedAutoMatchCandidates[4], { playerId: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim", providerId: 744 })
    if (kind === "updatedAt") s.orderedAutoMatchCandidates[3].expectedUpdatedAt = "2026-09-11T00:00:00.000Z"
    await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
    assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
  })
}

test("selected candidate becoming review stops instead of taking the sixth", async () => {
  const f = selectedFixture(), input = f.input()
  f.db.evidence.players[4].position = "GOL"
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  assert.equal(f.db.writeTransactions, 0)
})

test("missing, duplicate, empty or sixth member is never accepted as an explicit selection", () => {
  for (const kind of ["empty", "duplicate", "missing", "sixth"]) {
    const f = selectedFixture(), report = f.input().report
    const list: { playerId: string; slug: string; providerId: number }[] = [...REAL_FIRST_IDENTITY_BATCH]
    if (kind === "empty") list.splice(0)
    if (kind === "duplicate") list[4] = list[0]
    if (kind === "missing") list[4] = { ...list[4], slug: "wrong" }
    if (kind === "sixth") list.push({ playerId: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim", providerId: 744 })
    report.config.orderedBatchCandidates = list
    assert.throws(() => selectedClubIdentityAutoMatches(report), /BATCH_SELECTION|BATCH_CANDIDATE/)
  }
})

function realDispatchFixture() {
  const f = selectedFixture(), report = f.input().report
  // Dispatcher-only evidence. Real matcher/atomic adapter are tested above with the fake DB.
  report.config = realFirstIdentityBatchConfig()
  report.cache = { ...report.cache, rowHash: report.config.cache.expectedRowHash!, count: 29 }
  report.snapshotHash = report.config.snapshot.expectedHash!
  report.totalProviderPlayers = 29
  while (report.rows.length < 29) report.rows.push({ ...structuredClone(report.rows[0]), providerPlayerId: 900000 + report.rows.length,
    localCandidate: null, decision: "UNRESOLVED" })
  for (const r of report.rows) {
    const index = REAL_FIRST_IDENTITY_BATCH.findIndex(c => c.providerId === r.providerPlayerId)
    r.lineupEvidence.present = index >= 0
    if (index >= 0) { r.confidence = 100; r.margin = index === 0 ? 85 : 75 }
    const deferred = { 744: [96, 45, true], 291964: [90, 75, false],
      341640: [96, 71, false], 361497: [90, 65, true] } as const
    const d = deferred[r.providerPlayerId as keyof typeof deferred]
    if (d) { r.confidence = d[0]; r.margin = d[1]; r.lineupEvidence.present = d[2] }
  }
  const envelope = { head: f.git.head, report, authorization: createClubIdentityAuthorizationSummary(report) }
  const args = ["--write", "--club", "real-madrid", "--season", "2026", "--summary-file", "audit/reports/real.json",
    "--confirmation", clubIdentityWriteToken(report), "--expected-head", f.git.head]
  const events: string[] = []
  const deps = { git: (...a: string[]) => a[0] === "branch" ? f.git.branch : a[0] === "status" ? f.git.clean ? "" : " M file" : f.git.head,
    clock: () => f.clock.now, blockHttp: () => { events.push("block-http") }, readSummary: () => envelope,
    readOnly: async () => { events.push("read-only") },
    loadWrite: async () => { events.push("load-write"); return async () => { events.push("fake-write") } } }
  return { ...f, report, envelope, args, events, deps }
}

test("Real ranking reproduces the five proposed members and never modifies the complete report", () => {
  const f = realDispatchFixture(), before = structuredClone(f.report)
  assert.deepEqual(rankClubIdentityAutoMatches(f.report).slice(0, 5).map(r => r.providerPlayerId), REAL_FIRST_IDENTITY_BATCH.map(c => c.providerId))
  assert.deepEqual(rankClubIdentityAutoMatches(f.report).map(r => r.providerPlayerId),
    [47400, 283, 1271, 284300, 377122, 744, 341640, 361497, 291964])
  requireRealFirstIdentityBatch(f.report); assert.deepEqual(f.report, before)
  assert.ok(Object.isFrozen(REAL_FIRST_IDENTITY_BATCH)); assert.ok(REAL_FIRST_IDENTITY_BATCH.every(Object.isFrozen))
})

test("Real preflight never loads writes; future write dispatcher requires explicit envelope and matching CLI club", async () => {
  const f = realDispatchFixture()
  await dispatchClubIdentityRunner(["--preflight", "--club", "real-madrid", "--season", "2026"], f.deps)
  assert.deepEqual(f.events, ["block-http", "read-only"])
  f.events.length = 0
  await dispatchClubIdentityRunner(f.args, f.deps)
  assert.deepEqual(f.events, ["block-http", "load-write", "fake-write"])
})

for (const kind of ["sixth", "remove", "order", "Brahim", "slug", "cache", "snapshot", "expired", "head", "branch", "dirty", "token", "cli-club"]) {
  test(`Real operational gate rejects ${kind} before loading persistence`, async () => {
    const f = realDispatchFixture(), list: { playerId: string; slug: string; providerId: number }[] = [...REAL_FIRST_IDENTITY_BATCH]
    if (kind === "sixth") list.push({ playerId: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim", providerId: 744 })
    if (kind === "remove") list.pop()
    if (kind === "order") list.reverse()
    if (kind === "Brahim") list[4] = { playerId: "cmt9b6owq00fsukuct1bqp49e", slug: "brahim", providerId: 744 }
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

for (const outcome of ["REVIEW", "UNRESOLVED"] as const) test(`Real fresh envelope shrinks for ${outcome}, never replaces Endrick with Brahim`, async () => {
  const f = selectedFixture()
  if (outcome === "REVIEW") f.db.evidence.players[4].position = "GOL"
  else {
    const roster = f.db.evidence.cache!.players as ApiFootballTeamPlayer[]
    Object.assign(roster[4].player, { name: "Quuxxyz", firstname: "Quuxxyz", lastname: null })
  }
  const input = f.input()
  assert.equal(input.report.rows.find(r => r.providerPlayerId === 377122)!.decision, outcome)
  const summary = createClubIdentityAuthorizationSummary(input.report).summary
  assert.deepEqual(summary.orderedAutoMatchCandidates.map(c => c.playerId), ids.slice(0, 4))
  assert.equal(summary.policy.maxAutoWrites, 5)
  const before = structuredClone(f.db.evidence.players.slice(4))
  const result = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(result.stopped, false)
  assert.deepEqual(result.committedPlayerIds, ids.slice(0, 4))
  assert.deepEqual(result.results.map(r => r.status), Array(4).fill("MATCHED"))
  assert.deepEqual(f.db.evidence.players.slice(4), before)
})

test("Real closed cohort can authorize a zero-candidate no-op, without pulling deferred matches", async () => {
  const f = selectedFixture()
  f.db.evidence.players.slice(0, 5).forEach(p => { p.position = "GOL" })
  const input = f.input()
  assert.equal(createClubIdentityAuthorizationSummary(input.report).summary.orderedAutoMatchCandidates.length, 0)
  const result = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(result.stopped, false); assert.deepEqual(result.results, [])
  assert.equal(f.db.writeTransactions, 0); assert.equal(f.db.attempts.length, 0)
})

test("Real operational gate accepts a newly reduced report but rejects changes to its frozen cohort", () => {
  const f = realDispatchFixture()
  f.report.rows.find(r => r.providerPlayerId === 377122)!.decision = "REVIEW"
  requireRealFirstIdentityBatch(f.report)
  assert.deepEqual(createClubIdentityAuthorizationSummary(f.report).summary.orderedAutoMatchCandidates.map(c => c.playerId), ids.slice(0, 4))
  f.report.config.orderedBatchCandidates = REAL_FIRST_IDENTITY_BATCH.slice(0, 4)
  assert.throws(() => requireRealFirstIdentityBatch(f.report), /REAL_BATCH_SCOPE_MISMATCH/)
})

for (const [index, name, local, provider, providerId] of [
  [6, "Arda Güler", "Turkey", "Türkiye", 291964],
  [8, "Dean Huijsen", "Spain", "Netherlands", 361497],
] as const) test(`Real ${name}: nationality divergence remains visible and deferred, not silently normalized`, () => {
  const f = selectedFixture(), p = f.db.evidence.players[index]
  const roster = f.db.evidence.cache!.players as ApiFootballTeamPlayer[]
  p.name = name; p.nationality = local
  Object.assign(roster[index].player, { name, firstname: name.split(" ")[0], lastname: name.split(" ")[1], nationality: provider })
  const input = f.input(), row = input.report.rows.find(r => r.providerPlayerId === providerId)!
  assert.deepEqual(row.nationality, { local, provider, matches: false })
  assert.equal(row.nameScore, 100); assert.equal(row.confidence, 90)
  assert.equal(row.decision, "AUTO_MATCH")
  assert.equal(planClubIdentityAutoWrite(input.report).actions.find(a => a.providerId === providerId)!.action, "DEFER")
  assert.equal(createClubIdentityAuthorizationSummary(input.report).summary.orderedAutoMatchCandidates.some(c => c.providerId === providerId), false)
})

for (const field of ["nationality", "birth", "position", "snapshot", "club", "confidence", "margin", "max", "ranking"] as const) {
  test(`Real operational evidence gate rejects ${field} without loading persistence`, async () => {
    const f = realDispatchFixture(), row = f.report.rows.find(r => r.providerPlayerId === 47400)!
    if (field === "nationality" || field === "birth" || field === "position") row[field].matches = false
    if (field === "snapshot") row.lineupEvidence.present = false
    if (field === "club") row.rosterEvidence.teamMatches = false
    if (field === "confidence") row.confidence = 99
    if (field === "margin") row.margin = 74
    if (field === "max") f.report.config.writePolicy.maxAutoWrites = 6
    if (field === "ranking") row.margin = 75
    await assert.rejects(dispatchClubIdentityRunner(f.args, f.deps))
    assert.equal(f.events.includes("load-write"), false)
  })
}

test("Real CLI rejects missing flags, other seasons and arbitrary club write", () => {
  const f = realDispatchFixture()
  for (const index of [5, 7, 9]) { const args = [...f.args]; args.splice(index, 2); assert.throws(() => parseClubIdentityRunnerArgs(args)) }
  const season = [...f.args]; season[4] = "2024"; assert.throws(() => parseClubIdentityRunnerArgs(season))
  const other = [...f.args]; other[2] = "unapproved-club"; assert.throws(() => parseClubIdentityRunnerArgs(other))
})
