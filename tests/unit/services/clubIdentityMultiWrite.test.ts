import assert from "node:assert/strict"
import test from "node:test"
import { executeClubIdentityAutoWrite } from "../../../services/clubIdentityAutoWrite"
import { createClubIdentityAuthorizationSummary, planClubIdentityAutoWrite, requireClubIdentityAuthorization } from "../../../services/clubIdentityAuthorization"
import { runClubPlayerIdentityPipeline } from "../../../services/clubPlayerIdentityPipeline"
import { clubWriteFixture } from "../../fixtures/clubIdentityWrite"

const ids = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `local-${i + from}`)

for (const count of [1, 2, 3, 4, 5]) test(`${count} auto-matches: sequential atomic commits, exact deltas and no duplicate attempts`, async () => {
  const f = clubWriteFixture(count), input = f.input(), before = structuredClone(f.db.evidence)
  const r = await executeClubIdentityAutoWrite(input, f.deps)
  assert.equal(r.stopped, false); assert.equal(r.auditFailure, false); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids(count)); assert.deepEqual(r.indeterminatePlayerIds, [])
  assert.deepEqual(r.notExecutedPlayerIds, []); assert.equal(f.db.writeTransactions, count)
  assert.equal(f.db.attempts.length, count)
  assert.deepEqual(f.db.events, ids(count).flatMap(id => [`update:${id}`, `attempt:${id}`, `commit:${id}`]))
  for (let i = 0; i < count; i++) {
    const { apiFootballId: oldId, updatedAt: oldTime, attempt: oldAttempt, ...oldFields } = before.players[i]
    const { apiFootballId, updatedAt, attempt, ...fields } = f.db.evidence.players[i]
    assert.equal(oldId, null); assert.equal(oldAttempt, null); assert.equal(apiFootballId, 1000 + i)
    assert.notDeepEqual(updatedAt, oldTime); assert.deepEqual(fields, oldFields)
    assert.equal(attempt?.status, "matched"); assert.equal(attempt.lastApiFootballId, 1000 + i)
  }
  // The previous token still hashes its envelope, but cannot authorize the new DB state.
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  assert.equal(f.db.writeTransactions, count)
  const again = await f.run()
  assert.equal(again.results.length, 0); assert.equal(again.stopped, false)
  assert.equal(again.skipped.filter(s => s.action === "NO_OP").length, count)
  assert.equal(f.db.attempts.length, count); assert.equal(f.db.writeTransactions, count)
})

for (const limit of [0, -1, 1.5, 6, 10, 100]) test(`maxAutoWrites=${limit} rejects config and authorization before dependencies`, async () => {
  const f = clubWriteFixture(1), input = f.input()
  f.config.writePolicy.maxAutoWrites = limit
  assert.throws(() => f.input(), /INVALID_CLUB_IDENTITY_CONFIG/)
  input.report.config.writePolicy.maxAutoWrites = limit
  assert.throws(() => createClubIdentityAuthorizationSummary(input.report), /INVALID_CLUB_IDENTITY_CONFIG/)
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /INVALID_CLUB_IDENTITY_CONFIG/)
  assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
})

test("six real matcher AUTO_MATCH rows remain six; no summary, token or first-five plan can be issued", () => {
  const f = clubWriteFixture(6)
  const report = runClubPlayerIdentityPipeline(f.config, f.db.evidence, f.clock.now)
  assert.equal(report.counts.AUTO_MATCH, 6); assert.equal(report.coverage.newAutoMatches, 6)
  assert.throws(() => createClubIdentityAuthorizationSummary(report), /BUDGET_EXCEEDED/)
  assert.throws(() => planClubIdentityAutoWrite(report), /BUDGET_EXCEEDED/)
  assert.equal(f.db.writeTransactions, 0)
})

for (const position of [1, 3, 5]) test(`attempt failure at ${position}: rollback current, preserve previous commits, leave rest untouched`, async () => {
  const f = clubWriteFixture(5); f.db.failAttemptFor = `local-${position - 1}`
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "ATTEMPT_FAILURE"); assert.equal(r.auditFailure, false)
  assert.equal(r.retries, 0); assert.equal(f.db.writeTransactions, position)
  assert.equal(f.db.attempts.length, position - 1); assert.deepEqual(r.committedPlayerIds, ids(position - 1))
  assert.deepEqual(r.notExecutedPlayerIds, ids(5 - position, position))
  assert.deepEqual(f.db.evidence.players.slice(position - 1).map(p => p.apiFootballId), Array(6 - position).fill(null))
  assert.deepEqual(f.db.events.filter(e => e.startsWith("commit:")), ids(position - 1).map(id => `commit:${id}`))
})

for (const position of [1, 3, 5]) for (const committed of [false, true]) {
  test(`indeterminate at ${position}, actual fake server commit=${committed}: stop, no retry or assumed rollback`, async () => {
    const f = clubWriteFixture(5); f.db.indeterminateFor = `local-${position - 1}`; f.db.commitDespiteError = committed
    const r = await f.run()
    assert.equal(r.stopped, true); assert.equal(r.stopReason, "INDETERMINATE_COMMIT"); assert.equal(r.retries, 0)
    assert.equal(f.db.writeTransactions, position); assert.equal(f.db.attempts.length, position - 1 + Number(committed))
    assert.deepEqual(r.committedPlayerIds, ids(position - 1))
    assert.deepEqual(r.indeterminatePlayerIds, [`local-${position - 1}`])
    assert.deepEqual(r.notExecutedPlayerIds, ids(5 - position, position)); assert.equal(r.auditFailure, committed)
    assert.equal(f.db.evidence.players[position - 1].apiFootballId, committed ? 999 + position : null)
    assert.ok(f.db.evidence.players.slice(position).every(p => p.apiFootballId === null && p.attempt === null))
  })
}

test("provider conflict in transaction three preserves 1/2 and never starts 4/5", async () => {
  const f = clubWriteFixture(5)
  f.db.onWrite = draft => { if (f.db.writeTransactions === 3) draft.players[4].apiFootballId = 1002 }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "CONFLICT_PROVIDER_ID_TAKEN")
  assert.equal(r.auditFailure, false); assert.equal(r.retries, 0); assert.equal(f.db.writeTransactions, 3)
  assert.equal(f.db.attempts.length, 2); assert.deepEqual(r.committedPlayerIds, ids(2))
  assert.deepEqual(r.notExecutedPlayerIds, ids(2, 3))
  assert.equal(f.db.events.includes("update:local-2"), false)
})

test("updatedAt changed in transaction four stops before its update and leaves five untouched", async () => {
  const f = clubWriteFixture(5)
  f.db.onWrite = draft => { if (f.db.writeTransactions === 4) draft.players[3].updatedAt = new Date("2026-09-11") }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "CONCURRENT_MODIFICATION")
  assert.equal(f.db.writeTransactions, 4); assert.equal(f.db.attempts.length, 3)
  assert.deepEqual(r.committedPlayerIds, ids(3)); assert.deepEqual(r.notExecutedPlayerIds, ["local-4"])
  assert.equal(f.db.events.includes("update:local-3"), false); assert.equal(r.retries, 0)
})

for (const change of ["order", "remove", "add"] as const) test(`exact five-candidate authorization rejects ${change}`, async () => {
  const f = clubWriteFixture(5), input = f.input()
  const summary = input.summary as ReturnType<typeof createClubIdentityAuthorizationSummary>["summary"]
  if (change === "order") summary.orderedAutoMatchCandidates.reverse()
  if (change === "remove") summary.orderedAutoMatchCandidates.pop()
  if (change === "add") summary.orderedAutoMatchCandidates.push({ ...summary.orderedAutoMatchCandidates[0], playerId: "extra", providerId: 9999 })
  assert.throws(() => requireClubIdentityAuthorization(input.report, summary, input.confirmation, f.clock.now), /AUTHORIZATION_MISMATCH/)
  await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /AUTHORIZATION_MISMATCH/)
  assert.equal(f.db.readTransactions, 0); assert.equal(f.db.writeTransactions, 0)
})

for (const change of ["remove", "add"] as const) test(`candidate ${change} after two commits stops before third transaction`, async () => {
  const f = clubWriteFixture(4)
  f.db.onRead = n => {
    if (n !== 6) return // initial, before/after each candidate, then before third
    if (change === "remove") f.db.evidence.players[2].position = "GOL"
    else {
      const extra = clubWriteFixture(5).db.evidence
      f.db.evidence.players.push(extra.players[4])
      const roster = f.db.evidence.cache!.players as typeof f.roster
      roster.push((extra.cache!.players as typeof f.roster)[4])
      f.db.evidence.cache!.playerCount++
    }
  }
  const r = await f.run()
  assert.equal(r.stopped, true); assert.equal(r.stopReason, "STATE_OR_AUDIT_CHANGED")
  assert.equal(f.db.writeTransactions, 2); assert.equal(f.db.attempts.length, 2); assert.equal(r.retries, 0)
  assert.deepEqual(r.committedPlayerIds, ids(2)); assert.equal(f.db.events.includes("update:local-2"), false)
})

test("audit after several commits rejects an unrelated Player field change", async () => {
  const f = clubWriteFixture(5)
  f.db.onRead = n => { if (n === 7) f.db.evidence.players[4].externalId = "unexpected-ea-change" }
  const r = await f.run()
  assert.equal(r.auditFailure, true); assert.equal(r.stopped, true); assert.equal(r.stopReason, "AUDIT_MISMATCH")
  assert.deepEqual(r.committedPlayerIds, ids(3)); assert.deepEqual(r.notExecutedPlayerIds, ids(2, 3))
  assert.equal(f.db.writeTransactions, 3); assert.equal(f.db.attempts.length, 3)
})

for (const [team, slug] of [[50, "manchester-city"], [541, "real-madrid"]] as const) {
  test(`${slug}: five synthetic auto-matches with no operational club IDs in the core`, async () => {
    const f = clubWriteFixture(5, team, slug), r = await f.run()
    assert.equal(r.stopped, false); assert.equal(r.auditFailure, false)
    assert.equal(f.db.writeTransactions, 5); assert.equal(f.db.attempts.length, 5)
  })
  for (const cache of ["missing", "expired", "2024"] as const) test(`${slug}: ${cache} roster blocks before any writable transaction`, async () => {
    const f = clubWriteFixture(2, team, slug), input = f.input()
    if (cache === "missing") f.db.evidence.cache = null
    else if (cache === "expired") f.db.evidence.cache!.expiresAt = f.clock.now
    else f.db.evidence.cache!.season = 2024
    await assert.rejects(executeClubIdentityAutoWrite(input, f.deps), /VALID_ROSTER_REQUIRED/)
    assert.equal(f.db.writeTransactions, 0); assert.equal(f.db.attempts.length, 0)
  })
}
