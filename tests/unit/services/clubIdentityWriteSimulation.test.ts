import assert from "node:assert/strict"
import test from "node:test"
import { runClubPlayerIdentityPipeline, type ClubIdentityReport } from "../../../services/clubPlayerIdentityPipeline"
import { planClubIdentityAutoWrite } from "../../../services/clubIdentityAuthorization"
import { clubIdentityFixture, identityNow } from "../../fixtures/clubIdentity"

// TEST-ONLY model of the future loop. No production write engine/adapter is connected in Phase A.
function simulate(report: ClubIdentityReport, failAt = -1, failure = "ATTEMPT_FAILURE") {
  const plan = planClubIdentityAutoWrite(report), state = new Map<string, { providerId: number; matchedAttempt: true }>()
  const events: string[] = [], result = { state, events, stopped: false, retries: 0 }
  if (plan.blockers.length) { result.stopped = true; events.push("STOP_CONFLICT"); return result }
  let transactions = 0
  for (const a of plan.actions) {
    if (a.action !== "ATOMIC_CANDIDATE") { events.push(a.action); continue }
    const draft = new Map(state); events.push("BEGIN_SERIALIZABLE"); transactions++
    draft.set(a.playerId!, { providerId: a.providerId, matchedAttempt: true })
    if (transactions === failAt) { events.push(failure); result.stopped = true; break }
    state.clear(); draft.forEach((v, k) => state.set(k, v)); events.push("COMMIT_PLAYER_AND_ATTEMPT")
  }
  return result
}
test("future fake loop consumes real dry-run: already no-op, auto atomic, review/unresolved skipped", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 4)
  f.players[0].apiFootballId = 1000
  f.players[1].position = "GOL"
  f.roster[3].player.name = "Unrelated Name"; f.roster[3].player.firstname = null; f.roster[3].player.lastname = null
  const r = runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow)
  assert.deepEqual(r.counts, { ALREADY_MATCHED: 1, AUTO_MATCH: 1, REVIEW: 1, UNRESOLVED: 1, CONFLICT: 0 })
  const s = simulate(r); assert.equal(s.state.size, 1); assert.equal(s.stopped, false); assert.equal(s.retries, 0)
  assert.deepEqual(s.events, ["NO_OP", "SKIP", "BEGIN_SERIALIZABLE", "COMMIT_PLAYER_AND_ATTEMPT", "SKIP"])
})
for (const failure of ["ATTEMPT_FAILURE", "INDETERMINATE_COMMIT", "AUDIT_MISMATCH", "STATE_MISMATCH"]) {
  test(`future fake loop stops on ${failure}, preserves prior commit and never retries`, () => {
    const f = clubIdentityFixture(529, "fc-barcelona", 3), r = runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow)
    const s = simulate(r, 2, failure)
    assert.equal(s.stopped, true); assert.equal(s.state.size, 1); assert.equal(s.retries, 0)
    assert.equal(s.events.filter(e => e === "BEGIN_SERIALIZABLE").length, 2)
    assert.equal(s.state.has("local-2"), false)
  })
}
test("future fake preflight rejects a conflict before any transaction", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 2); f.players[0].apiFootballId = 9999
  const s = simulate(runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow))
  assert.equal(s.stopped, true); assert.equal(s.state.size, 0); assert.deepEqual(s.events, ["STOP_CONFLICT"])
})
test("fake write budget never exceeds maxAutoWrites", () => {
  const f = clubIdentityFixture(529, "fc-barcelona", 12)
  const s = simulate(runClubPlayerIdentityPipeline(f.config, f.evidence, identityNow))
  assert.equal(s.state.size, 10); assert.equal(s.events.filter(e => e === "DEFER_BUDGET").length, 2)
})
