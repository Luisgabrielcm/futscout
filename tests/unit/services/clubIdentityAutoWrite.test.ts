import assert from "node:assert/strict"
import test from "node:test"
import { executeClubIdentityAutoWrite } from "../../../services/clubIdentityAutoWrite"
import { clubIdentityWriteToken, createClubIdentityAuthorizationSummary } from "../../../services/clubIdentityAuthorization"
import { clubWriteFixture } from "../../fixtures/clubIdentityWrite"
import { addIdentitySnapshot } from "../../fixtures/clubIdentity"

test("generic adapter uses real Serializable callback: Player+Attempt atomic, then updated summary is no-op", async () => {
  const f = clubWriteFixture(), r = await f.run()
  assert.equal(r.stopped, false); assert.equal(r.auditFailure, false); assert.equal(r.results.length, 2)
  assert.deepEqual(r.results.map(r => r.status), ["MATCHED", "MATCHED"])
  assert.equal(f.db.attempts.length, 2); assert.equal(f.db.writeTransactions, 2)
  const previous = structuredClone(f.db.evidence), again = await f.run()
  assert.equal(again.results.length, 0); assert.equal(again.skipped.filter(s => s.action === "NO_OP").length, 2)
  assert.equal(f.db.attempts.length, 2); assert.equal(f.db.writeTransactions, 2); assert.deepEqual(f.db.evidence, previous)
})

test("Eric simulation commits only Eric; realistic Joan rival blocks Joan, even with strong score", async () => {
  const f = clubWriteFixture(); f.config.writePolicy.maxAutoWrites = 1
  const [eric, joan] = f.db.evidence.players
  Object.assign(eric, { name: "Eric García", slug: "eric-garcia", dateOfBirth: new Date("2001-01-09"), position: "ZAG" })
  Object.assign(joan, { name: "Joan García", slug: "joan-garcia", dateOfBirth: new Date("2001-05-04"), position: "GOL" })
  const roster = f.db.evidence.cache!.players as typeof f.roster
  Object.assign(roster[0].player, { id: 619, name: "Eric García", firstname: "Eric", lastname: "García Martret", birth: { date: "2001-01-09" } })
  Object.assign(roster[1].player, { id: 182718, name: "Joan García", firstname: "Joan", lastname: "García Pons", birth: { date: "2001-05-04" } })
  roster[0].statistics[0].games!.position = "Defender"; roster[1].statistics[0].games!.position = "Goalkeeper"
  f.db.evidence.players.push({ ...joan, id: "rival", name: "Fabrício Garcia", nationality: "Portugal", clubId: "other", club: { name: "Other", apiFootballId: 42 } })
  const input = f.input(); assert.equal(input.report.rows[0].margin, 43); assert.equal(input.report.rows[1].decision, "REVIEW")
  const r = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(r.stopped, false); assert.deepEqual(r.results.map(x => x.providerId), [619]); assert.equal(f.db.attempts.length, 1)
  assert.equal(f.db.evidence.players[1].apiFootballId, null)
})

test("REVIEW, stale club and UNRESOLVED skip while ALREADY_MATCHED no-ops", async () => {
  const f = clubWriteFixture(4), p = f.db.evidence.players, roster = f.db.evidence.cache!.players as typeof f.roster
  p[0].apiFootballId = 1000; p[1].position = "GOL"
  p[2].clubId = "other"; p[2].club = { name: "Other", apiFootballId: 42 }
  Object.assign(roster[3].player, { name: "Unrelated", firstname: null, lastname: null })
  const r = await f.run()
  assert.equal(r.stopped, false); assert.equal(f.db.writeTransactions, 0); assert.equal(f.db.attempts.length, 0)
  assert.deepEqual(r.skipped.map(s => s.decision), ["ALREADY_MATCHED", "REVIEW", "REVIEW", "UNRESOLVED"])
})

for (const [n, max] of [[2, 1], [6, 5]]) test(`${n} candidates with maxAutoWrites=${max} rejects without truncation`, async () => {
  const f = clubWriteFixture(n); f.config.writePolicy.maxAutoWrites = max
  assert.throws(() => f.run(), /BUDGET_EXCEEDED/); assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
})

for (const key of ["clubId", "clubSlug", "apiFootballTeamId", "season", "cacheRowHash", "snapshotHash", "order", "playerId", "slug", "providerId", "confidence", "margin", "expectedUpdatedAt", "maxAutoWrites"] as const) {
  test(`v1 authorization rejects changed ${key} before any dependency`, async () => {
    const f = clubWriteFixture(), input = f.input(), summary = input.summary as ReturnType<typeof createClubIdentityAuthorizationSummary>["summary"]
    if (key === "order") summary.orderedAutoMatchCandidates.reverse()
    else if (key === "maxAutoWrites") summary.policy.maxAutoWrites = 1
    else if (key === "confidence" || key === "margin" || key === "providerId") summary.orderedAutoMatchCandidates[0][key] = 1
    else if (key === "playerId" || key === "slug" || key === "expectedUpdatedAt") summary.orderedAutoMatchCandidates[0][key] = "changed"
    else if (key === "apiFootballTeamId" || key === "season") summary[key]++
    else summary[key] = "changed"
    await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
    assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
  })
}

test("semantic summary canonicalization ignores property insertion order", async () => {
  const f = clubWriteFixture(1), input = f.input()
  input.summary = Object.fromEntries(Object.entries(input.summary as object).reverse())
  assert.equal((await executeClubIdentityAutoWrite(input, f.deps)).stopped, false)
})

for (const key of ["add", "remove", "updatedAt", "owner", "cache", "expired", "matcher", "snapshot"] as const) test(`fresh ${key} change aborts before writes`, async () => {
  const f = clubWriteFixture(), input = f.input()
  if (key === "add") {
    const third = clubWriteFixture(3); f.db.evidence = third.db.evidence
  }
  if (key === "remove") f.db.evidence.players[0].apiFootballId = 1000
  if (key === "updatedAt") f.db.evidence.players[0].updatedAt = new Date("2026-09-10T00:00:00.001Z")
  if (key === "owner") f.db.evidence.players[1].apiFootballId = 1000
  if (key === "cache") f.db.evidence.cacheRowHash = "different"
  if (key === "expired") f.db.evidence.cache!.expiresAt = f.clock.now
  if (key === "matcher") f.db.evidence.players[0].position = "GOL"
  if (key === "snapshot") f.config.snapshot.required = true
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps)); assert.equal(f.db.writeTransactions, 0)
})

test("forged candidate added to report with an old token is rejected", async () => {
  const f = clubWriteFixture(), input = f.input()
  input.report.rows[0].providerPlayerId = 999
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  assert.equal(f.db.writeTransactions, 0)
})

test("conflict stops before loading writable dependencies", async () => {
  const f = clubWriteFixture(); f.db.evidence.players[0].apiFootballId = 999
  await assert.rejects(f.run(), /CONFLICT/); assert.equal(f.db.writeTransactions, 0)
})

for (const key of ["branch", "dirty", "head", "expired", "future"]) test(`${key} authorization/git gate rejects`, async () => {
  const f = clubWriteFixture(), input = f.input()
  if (key === "branch") f.git.branch = "master"
  if (key === "dirty") f.git.clean = false
  if (key === "head") f.git.head = "b".repeat(40)
  if (key === "expired") f.clock.now = new Date("2026-09-12T12:15:00Z")
  if (key === "future") f.clock.now = new Date("2026-09-12T11:59:00Z")
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps)); assert.equal(f.db.writeTransactions, 0)
})

test("failure on candidate four rolls back four, preserves commits 1-3 and never starts five", async () => {
  const f = clubWriteFixture(5); f.db.failAttemptFor = "local-3"
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "ATTEMPT_FAILURE"); assert.equal(r.auditFailure, false)
  assert.equal(f.db.writeTransactions, 4); assert.equal(f.db.attempts.length, 3); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ["local-0", "local-1", "local-2"])
  assert.deepEqual(r.notExecutedPlayerIds, ["local-4"]); assert.equal(f.db.evidence.players[3].apiFootballId, null)
})

for (const committed of [false, true]) test(`indeterminate commit (server committed=${committed}) stops and never assumes rollback`, async () => {
  const f = clubWriteFixture(3); f.db.indeterminateFor = "local-1"; f.db.commitDespiteError = committed
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "INDETERMINATE_COMMIT"); assert.equal(f.db.writeTransactions, 2)
  assert.deepEqual(r.indeterminatePlayerIds, ["local-1"]); assert.deepEqual(r.notExecutedPlayerIds, ["local-2"])
  assert.equal(f.db.attempts.length, committed ? 2 : 1); assert.equal(r.auditFailure, committed); assert.equal(r.retries, 0)
})

test("audit mismatch after a commit stops the next player without destructive compensation", async () => {
  const f = clubWriteFixture(3); f.db.corruptProtectedAfterCommit = true
  const r = await f.run()
  assert.equal(r.auditFailure, true); assert.equal(r.stopped, true); assert.equal(f.db.writeTransactions, 1)
  assert.equal(f.db.attempts.length, 1); assert.deepEqual(r.committedPlayerIds, ["local-0"])
})

test("state change between outer read and Serializable revalidation aborts without any update", async () => {
  const f = clubWriteFixture(); f.db.onWrite = draft => { draft.players[1].updatedAt = new Date("2026-09-11") }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(f.db.writeTransactions, 1); assert.equal(f.db.attempts.length, 0)
  assert.equal(f.db.events.some(e => e.startsWith("update:")), false)
})

for (const [team, slug] of [[50, "manchester-city"], [541, "real-madrid"]] as const) test(`${slug} generic adapter uses fakes, not real club processing`, async () => {
  const f = clubWriteFixture(2, team, slug), r = await f.run()
  assert.equal(r.stopped, false); assert.equal(f.db.attempts.length, 2)
})

test("old player-by-player token cannot authorize a club execution", async () => {
  const f = clubWriteFixture(), input = f.input()
  input.confirmation = clubIdentityWriteToken(input.report).replace("AUTHORIZE_CLUB_IDENTITY_V1", "AUTHORIZE_BARCELONA_IDENTITY_V2")
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps)); assert.equal(f.db.writeTransactions, 0)
})

test("generic atomic adapter preserves a pinned snapshot without requiring lineup participation", async () => {
  const f = clubWriteFixture()
  addIdentitySnapshot({ ...f, evidence: f.db.evidence }, false)
  f.config.snapshot.expectedHash = f.db.evidence.snapshot!.contentHash
  const input = f.input(); assert.equal(input.report.rows[0].lineupEvidence.present, false)
  const r = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(r.stopped, false); assert.equal(f.db.attempts.length, 2)
})

test("snapshot payload changed inside Serializable revalidation aborts before update", async () => {
  const f = clubWriteFixture()
  addIdentitySnapshot({ ...f, evidence: f.db.evidence }, false)
  f.db.onWrite = draft => { draft.snapshot!.formation = "4-4-2" }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(f.db.attempts.length, 0)
  assert.equal(f.db.events.some(e => e.startsWith("update:")), false)
})

test("authorization expiry while acquiring the transaction cannot extend write validity", async () => {
  const f = clubWriteFixture()
  f.db.onWrite = () => { f.clock.now = new Date("2026-09-12T12:15:00Z") }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(f.db.attempts.length, 0)
  assert.equal(f.db.events.some(e => e.startsWith("update:")), false)
})
