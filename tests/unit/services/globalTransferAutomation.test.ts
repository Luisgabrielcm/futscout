import assert from "node:assert/strict"
import test from "node:test"
import { prepareGlobalTransferAutomation, groupTransferResearch, type GlobalTransferCandidate } from "../../../services/globalTransferAutomation"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { jointHash } from "../../../lib/jointTransferContexts"
import { classifyMovement } from "../../../lib/jointTransferLoanSync"

function row(id = "276528"): GlobalTransferCandidate {
  const update = projectionFixture(id), real = update.candidate.real!
  return { update, proof: { eaId: id, destinationClubId: update.candidate.jointTransfer.real!.club!.id,
    identityVerified: true, sourceFileVerified: true, sourceHash: real.evidenceHash, sourceUrl: real.sourceUrl,
    authority: "OFFICIAL", observedAt: "2026-11-16T03:00:00.000Z", evidenceDate: "2026-09-02", membershipOnly: false, conflicts: [] } }
}
const input = (candidates = [row()]) => ({ before: [], expectedBeforeHash: jointHash([]), asOf: "2026-11-16", candidates,
  publishedEaIds: [], historicalLoanCount: 614, historicalDivergenceCount: 3277 })
test("large batch keeps paired contexts, bounded chunks and independent national/EA evidence", () => {
  const rows = Array.from({ length: 205 }, (_, i) => row(String(100000 + i))), original = jointHash(rows)
  const plan = prepareGlobalTransferAutomation(input(rows))
  assert.equal(plan.eligible, 205); assert.deepEqual(plan.batches.map(b => b.playerCount), [100, 100, 5])
  assert.equal(jointHash(rows), original); assert.equal(plan.productionWrites, 0); assert.equal(plan.executionAuthorized, false)
  for (const batch of plan.batches) for (const u of batch.updates) {
    assert.deepEqual(u.contexts, ["REAL", "GAME"]); assert.equal(u.originalEaSnapshotChanged, false)
    assert.deepEqual(u.payload.jointTransfer.futscoutProjection!.membership!.nationalTeams, u.payload.jointTransfer.game.nationalTeams)
    assert.equal("salary" in u.payload, false); assert.equal("clubId" in u.payload, false)
    assert.equal(u.rollback.compareAndSwapRequired, true)
  }
})
test("real conflict is isolated; published ten and duplicate exact proofs are not reprocessed", () => {
  const safe = row("100001"), conflict = row("100002"), bad = structuredClone(conflict)
  bad.proof.destinationClubId = "different"
  const plan = prepareGlobalTransferAutomation({ ...input([safe, safe, conflict, bad, row("276528")]), publishedEaIds: ["276528"] })
  assert.equal(plan.eligible, 1); assert.equal(plan.conflicts.length, 1); assert.deepEqual(plan.excludedPublished, ["276528"])
})
test("unverified identity, changed source, future/stale evidence and licence gaps stay outside batches", () => {
  for (const mutate of [
    (r: GlobalTransferCandidate) => { r.proof.identityVerified = false },
    (r: GlobalTransferCandidate) => { r.proof.sourceHash = "f".repeat(64) },
    (r: GlobalTransferCandidate) => { r.proof.observedAt = "2026-11-01T00:00:00Z" },
    (r: GlobalTransferCandidate) => { r.proof.evidenceDate = "2026-11-17" },
    (r: GlobalTransferCandidate) => { r.update.eligibility.destinationLicense = "UNKNOWN" },
    (r: GlobalTransferCandidate) => { r.proof.evidenceDate = "2026-02-30" },
  ]) { const r = row(); mutate(r); const p = prepareGlobalTransferAutomation(input([r])); assert.equal(p.eligible, 0); assert.equal(p.pending.length, 1) }
})
test("membership is not a permanent transfer or a way to close an active loan", () => {
  const r = row(), u = r.update
  u.candidate.jointTransfer.real!.loan = null; u.candidate.jointTransfer.real!.parentClub = null
  u.movement.kind = "CURRENT_CLUB_CONFIRMED"; u.movement.evidenceHash = u.candidate.real!.evidenceHash
  u.candidate.jointTransfer.movements = [u.movement]; r.proof.membershipOnly = true
  assert.equal(prepareGlobalTransferAutomation(input([r])).eligible, 1)
  assert.equal(classifyMovement("CURRENT_CLUB_CONFIRMED", true).changesMainContractOwner, false)
  const old = projectionFixture().candidate
  assert.equal(prepareGlobalTransferAutomation({ ...input([r]), before: [old], expectedBeforeHash: jointHash([old]) }).eligible, 0)
  u.movement.kind = "PERMANENT_TRANSFER"
  assert.equal(prepareGlobalTransferAutomation(input([r])).eligible, 0)
})
test("checkpoint replay skips completed batches, rejects changed inputs/unknown receipts", () => {
  const initial = prepareGlobalTransferAutomation(input()), batchId = initial.batches[0].batchId
  const checkpoint = { ...initial.checkpoint, completedBatches: [{ batchId, receiptHash: "a".repeat(64) }] }
  assert.equal(prepareGlobalTransferAutomation({ ...input(), checkpoint }).remainingBatches.length, 0)
  assert.equal(prepareGlobalTransferAutomation(input()).batches[0].batchId, batchId)
  assert.throws(() => prepareGlobalTransferAutomation({ ...input([row("100001")]), checkpoint }), /CHECKPOINT/)
  assert.throws(() => prepareGlobalTransferAutomation({ ...input(), checkpoint: { ...checkpoint, completedBatches: [{ batchId: "unknown", receiptHash: "a".repeat(64) }] } }), /CHECKPOINT/)
})
test("group research by versioned source; source/version changes invalidate cache; no paid retry", () => {
  const a = { eaId: "1", clubId: "club", sourceUrl: "https://example.invalid/roster", sourceVersion: "v1" }
  const jobs = groupTransferResearch([a, { ...a, eaId: "2" }, a, { ...a, sourceVersion: "v2" }])
  assert.equal(jobs.length, 2); assert.deepEqual(jobs[0].eaIds, ["1", "2"]); assert.notEqual(jobs[0].cacheKey, jobs[1].cacheKey)
  assert.equal(jobs[0].paidProviderAllowed, false); assert.equal(jobs[0].onRateLimit, "STOP_AND_CHECKPOINT")
})
test("snapshot discrepancies and historical loans never become current real updates on their own", () => {
  const p = prepareGlobalTransferAutomation(input([])); assert.equal(p.eligible, 0)
  assert.deepEqual(p.referenceOnly, { loans: 614, divergences: 3277 }); assert.equal(p.autoActivationAllowed, false)
  assert.throws(() => prepareGlobalTransferAutomation({ ...input(), expectedBeforeHash: "f".repeat(64) }), /BASELINE/)
})
