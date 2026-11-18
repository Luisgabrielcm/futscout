import test from "node:test"
import assert from "node:assert/strict"
import { jointFixture, city, benfica } from "../../fixtures/jointTransfer"
import { jointHash } from "../../../lib/jointTransferContexts"
import { preservedGameHash } from "../../../lib/realOnlyTransfers"
import { isRealOnlyTransferDecision, realOnlyTransferDecision, transferDecisionReadScope } from "../../../lib/transferReadScope"
import { prepareRealOnlyTransferBatch, type RealOnlyTransferCandidate } from "../../../services/realOnlyTransferPreparation"
import { prepareJointTransferCommit } from "../../../services/jointTransferPersistence"

const asOf = "2026-11-18"
function candidate(eaId = "800001", loan = true): RealOnlyTransferCandidate {
  const original = jointFixture(eaId), base = structuredClone(original)
  base.real = null; base.jointTransfer.real = null
  if (loan) original.jointTransfer.real!.loan = { ...original.jointTransfer.real!.loan!, evidence: { ...original.jointTransfer.real!.loan!.evidence, contentHash: original.real!.evidenceHash } }
  else { original.jointTransfer.real!.loan = null; original.jointTransfer.real!.parentClub = null }
  return { base, expectedBaseHash: jointHash(base), patch: {
    real: { membership: original.jointTransfer.real!, evidence: original.real! },
    movement: { eaId, context: "REAL", kind: loan ? "LOAN_START" : "PERMANENT_TRANSFER", evidenceConfirmed: true,
      sourceUrl: original.real!.sourceUrl, evidenceHash: original.real!.evidenceHash, effectiveAt: null,
      route: { fromState: "CLUB", fromClub: city, toClub: benfica } },
  }, proof: { identityConfirmed: true, movementTypeConfirmed: true, currentPlayingConfirmed: true, chronologyConfirmed: true,
    sourceFileVerified: true, sourceHash: original.real!.evidenceHash, currentSourceHash: "e".repeat(64),
    currentObservedAt: "2026-11-18T10:00:00Z", authority: "CORROBORATED", conflicts: [] },
    gamePendingReasons: ["DESTINATION_GAME_AVAILABILITY_UNPROVEN"] }
}
const plan = (rows: RealOnlyTransferCandidate[]) => prepareRealOnlyTransferBatch({ candidates: rows, excludedEaIds: [], asOf })

test("REAL-only loan and transfer retain the exact GAME snapshot, national team and movement history", () => {
  for (const loan of [true, false]) {
    const c = candidate("800001", loan), original = structuredClone(c), r = plan([c])
    assert.equal(r.eligible, 1); assert.equal(r.loans, +loan); assert.equal(r.transfers, +!loan)
    const u = r.batches[0].updates[0]
    assert.equal(preservedGameHash(u.payload), preservedGameHash(c.base)); assert.equal(u.expectedGameBaselineHash, preservedGameHash(c.base))
    assert.deepEqual(u.payload.game, c.base.game); assert.deepEqual(u.payload.jointTransfer.game, c.base.jointTransfer.game)
    assert.equal(u.payload.jointTransfer.futscoutProjection, undefined)
    assert.deepEqual(c, original); assert.deepEqual(r.batches[0].contexts, ["REAL"]); assert.equal(r.productionWrites, 0)
  }
})
test("NOT_IN_SQUAD is preserved without constructing a GAME club from the real destination", () => {
  const c = candidate(); c.base.game = { ...c.base.game, status: "UNKNOWN", club: null, nativeTeamIds: [], nativeClubTeamIds: [] }
  c.base.jointTransfer.game = { ...c.base.jointTransfer.game, state: "NOT_IN_SQUAD", club: null, nationalTeams: [], nationalCoverage: "NOT_IN_SQUAD" }
  c.expectedBaseHash = jointHash(c.base)
  const r = plan([c]); assert.equal(r.eligible, 1); assert.equal(r.batches[0].updates[0].payload.jointTransfer.game.state, "NOT_IN_SQUAD")
})
test("simple club confirmation, ambiguous routes, future moves and expired loans stay pending", () => {
  const mutations = [
    (c: RealOnlyTransferCandidate) => { c.patch.movement.kind = "CURRENT_CLUB_CONFIRMED" },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.route = undefined },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.route!.fromClub = null },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.effectiveAt = "2027-01-01" },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.loan = { ...c.patch.real.membership.loan!, endsAt: "2026-11-17" } },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.loan = { ...c.patch.real.membership.loan!, state: "RETURN_CONFIRMED" } },
    (c: RealOnlyTransferCandidate) => { c.proof.currentPlayingConfirmed = false },
    (c: RealOnlyTransferCandidate) => { c.proof.currentObservedAt = "2026-10-01T10:00:00Z" },
    (c: RealOnlyTransferCandidate) => { c.proof.currentObservedAt = "2026-12-01T10:00:00Z" },
    (c: RealOnlyTransferCandidate) => { c.proof.conflicts = ["LATER_MOVEMENT_UNRESOLVED"] },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.loan = { ...c.patch.real.membership.loan!, evidence: { ...c.patch.real.membership.loan!.evidence, contentHash: "f".repeat(64) } } },
  ]
  for (const mutate of mutations) { const c = candidate(); mutate(c); assert.equal(plan([c]).eligible, 0) }
})
test("permanent deals reject a remaining active loan and source tampering", () => {
  const c = candidate("800001", false); c.patch.real.membership.parentClub = city
  assert.equal(plan([c]).eligible, 0)
  const d = candidate(); d.patch.movement.sourceUrl += "/unproven"; assert.equal(plan([d]).eligible, 0)
  const e = candidate(); e.expectedBaseHash = "f".repeat(64); assert.equal(plan([e]).eligible, 0)
})
test("explicit REAL membership can be prepared without fabricating a transfer or changing GAME", () => {
  const c = candidate("800003", false)
  c.patch.movement.kind = "CURRENT_CLUB_CONFIRMED"; c.patch.movement.route = undefined
  c.proof.currentClubOnlyConfirmed = true; c.proof.movementTypeConfirmed = false
  const r = plan([c]); assert.equal(r.eligible, 1); assert.equal(r.clubConfirmations, 1)
  assert.equal(r.transfers, 0); assert.equal(r.loans, 0)
  const u = r.batches[0].updates[0]
  assert.equal(u.category, "REAL_ONLY_CLUB_CONFIRMATION")
  assert.equal(preservedGameHash(u.payload), preservedGameHash(c.base))
  assert.equal(u.payload.jointTransfer.movements.at(-1)!.route, undefined)
  assert.equal(u.payload.jointTransfer.movements.at(-1)!.effectiveAt, null)
  const item = { payload: u.payload, expectedGameBaselineHash: u.expectedGameBaselineHash, expectedSelection: null,
    expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: "2026-11-16T00:00:00.000Z" }
  assert(prepareJointTransferCommit([item], r.batches[0].decisionReference))
  assert.deepEqual(plan([c]), prepareRealOnlyTransferBatch({ candidates: [c], excludedEaIds: [], asOf, checkpoint: r.checkpoint }))
})
test("membership requires its own explicit proof and cannot smuggle dates, routes or an active loan", () => {
  for (const mutate of [
    (c: RealOnlyTransferCandidate) => { c.proof.currentClubOnlyConfirmed = false },
    (c: RealOnlyTransferCandidate) => { c.proof.movementTypeConfirmed = true },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.route = { fromState: "CLUB", fromClub: city, toClub: benfica } },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.effectiveAt = "2026-01-01" },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.parentClub = city },
    (c: RealOnlyTransferCandidate) => { c.proof.currentPlayingConfirmed = false },
    (c: RealOnlyTransferCandidate) => { c.proof.sourceFileVerified = false },
    (c: RealOnlyTransferCandidate) => { c.proof.conflicts = ["LOAN_ROLE_UNRESOLVED"] },
  ]) {
    const c = candidate("800003", false)
    c.patch.movement.kind = "CURRENT_CLUB_CONFIRMED"; c.patch.movement.route = undefined
    c.proof.currentClubOnlyConfirmed = true; c.proof.movementTypeConfirmed = false
    mutate(c); assert.equal(plan([c]).eligible, 0)
  }
})
test("source scope is authenticated by the existing root and malformed REAL-only decisions fail closed", () => {
  const d = realOnlyTransferDecision("a".repeat(64)); assert(isRealOnlyTransferDecision(d))
  assert.deepEqual(transferDecisionReadScope(d), { contexts: ["REAL"], gameView: "EA_SNAPSHOT" })
  assert.deepEqual(transferDecisionReadScope("existing-joint-decision"), { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" })
  for (const d of ["real-only-transfer:v2:" + "a".repeat(64), "real-only-transfer:v1:missing"]) assert.throws(() => isRealOnlyTransferDecision(d))
})
test("published selections are excluded, conflicting candidates are isolated and checkpoints are reproducible", () => {
  const a = candidate(), b = candidate("800002"), changed = structuredClone(b); changed.proof.currentSourceHash = "f".repeat(64)
  const input = { candidates: [a, a, b, changed], excludedEaIds: ["800001"], asOf }
  const r = prepareRealOnlyTransferBatch(input); assert.equal(r.eligible, 0); assert.deepEqual(r.duplicatesAvoided, ["800001"])
  assert.equal(r.pending[0].eaId, "800002"); assert.match(r.pending[0].reasons[0], /CONFLICTING_PROPOSALS/)
  assert.deepEqual(prepareRealOnlyTransferBatch({ ...input, checkpoint: r.checkpoint }), r)
  assert.throws(() => prepareRealOnlyTransferBatch({ ...input, checkpoint: { inputHash: "f".repeat(64), completedBatchIds: [] } }), /CHECKPOINT/)
})
test("large campaigns are split into atomic chunks without a discovery cap", () => {
  const r = plan(Array.from({ length: 451 }, (_, i) => candidate(String(800001 + i))))
  assert.equal(r.eligible, 451); assert.deepEqual(r.batches.map(b => b.updates.length), [200, 200, 51])
  assert(r.batches.every(b => b.expectedSelection === null && b.rollback.compareAndSwap))
})
test("writer requires a new selection, exact captured GAME baseline and an explicit REAL movement", () => {
  const r = plan([candidate()]), b = r.batches[0], u = b.updates[0]
  const item = { payload: u.payload, expectedGameBaselineHash: u.expectedGameBaselineHash, expectedSelection: null,
    expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: "2026-11-16T00:00:00.000Z" }
  assert(prepareJointTransferCommit([item], b.decisionReference))
  assert.throws(() => prepareJointTransferCommit([{ ...item, expectedGameBaselineHash: "f".repeat(64) }], b.decisionReference), /GAME_BASELINE/)
  assert.throws(() => prepareJointTransferCommit([{ ...item, expectedSelection: { version: 1, revisionId: "existing", decisionReference: "joint" } }], b.decisionReference), /NEW_SELECTION/)
})
