import test from "node:test"
import assert from "node:assert/strict"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { assessCurrentRealGameProjection, assessRealGameProjection, currentRealGamePolicyHash, realGamePolicyHash } from "../../../lib/realGameProjection"
import { jointHash, jointTransferViews, validateJointTransferPayload } from "../../../lib/jointTransferContexts"

function freeAgent() {
  const f = projectionFixture()
  f.candidate.real = { ...f.candidate.real!, status: "FREE_AGENT", club: null }
  f.candidate.jointTransfer.real = { ...f.candidate.jointTransfer.real!, state: "FREE_AGENT", club: null, parentClub: null, loan: null }
  f.movement = { ...f.movement, kind: "CURRENT_FREE_AGENT_CONFIRMED", evidenceHash: f.candidate.real.evidenceHash, sourceUrl: f.candidate.real.sourceUrl }
  f.candidate.jointTransfer.movements = [f.movement]
  f.eligibility = { ...f.eligibility, policyHash: currentRealGamePolicyHash, destinationClubId: null, destinationInGame: false,
    originClubId: null, originAvailable: false, destinationLicense: "UNKNOWN", individualPlayerEligibility: "UNKNOWN",
    evidence: f.eligibility.evidence.filter(e => ["PLAYER_IDENTITY", "PLAYER_GAME_PRESENCE"].includes(e.role)) }
  return f
}
const asOf = "2026-11-25"
test("confirmed REAL free agent projects to GAME without changing the original club or nationals", () => {
  const f = freeAgent(), before = structuredClone(f.candidate)
  const p = assessCurrentRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  assert.equal(p.version, 2); assert.equal(p.status, "READY"); assert.equal(p.membership?.state, "FREE_AGENT")
  assert.equal(p.membership?.club, null); assert.equal(p.membership?.parentClub, null); assert.equal(p.membership?.loan, null)
  assert.deepEqual(p.membership?.nationalTeams, f.candidate.jointTransfer.game.nationalTeams)
  assert.deepEqual(f.candidate, before)
  f.candidate.jointTransfer.futscoutProjection = p
  validateJointTransferPayload(f.candidate)
  const shown = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED")
  assert.equal(shown.real?.clubLabel, "Jogador sem clube"); assert.equal(shown.game?.clubLabel, "Jogador sem clube")
  assert.equal(shown.real?.realFreeAgent, true); assert.equal(shown.game?.realFreeAgent, true)
  assert.equal(shown.snapshotGame?.playingClub?.id, before.jointTransfer.game.club?.id)
})
test("unknown identity or GAME presence cannot be upgraded to a free agent", () => {
  for (const patch of [{ identity: "AMBIGUOUS" }, { gamePresence: "UNKNOWN" }, { gamePresence: "UNAVAILABLE" }] as const) {
    const f = freeAgent()
    assert.equal(assessCurrentRealGameProjection(f.candidate, { ...f.eligibility, ...patch }, f.movement, asOf).status, "REVIEW")
  }
})
test("free agent requires positive, bound employment evidence rather than missing club information", () => {
  for (const kind of ["CURRENT_CLUB_CONFIRMED", "RETIREMENT_CONFIRMED"] as const) {
    const f = freeAgent(), movement = { ...f.movement, kind }
    f.candidate.jointTransfer.movements = [movement]
    assert.equal(assessCurrentRealGameProjection(f.candidate, f.eligibility, movement, asOf).status, "REVIEW")
  }
  const f = freeAgent()
  assert.equal(assessCurrentRealGameProjection(f.candidate, f.eligibility, { ...f.movement, evidenceHash: "f".repeat(64) }, asOf).status, "REVIEW")
})
test("free agent cannot carry a destination, a loan, fabricated eligibility, or UT-only presence", () => {
  const f = freeAgent()
  for (const patch of [{ destinationClubId: "fabricated" }, { originClubId: "fabricated" }, { destinationInGame: true }, { destinationLicense: "LICENSED_PLAYERS" }] as const)
    assert.equal(assessCurrentRealGameProjection(f.candidate, { ...f.eligibility, ...patch }, f.movement, asOf).status, "REVIEW")
  f.eligibility.evidence = f.eligibility.evidence.map(e => e.role === "PLAYER_GAME_PRESENCE" ? { ...e, scope: "UT_ONLY" } : e)
  assert.equal(assessCurrentRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW")
})
test("new policy never changes a signed v1 projection or accepts the wrong policy hash", () => {
  const f = projectionFixture(), original = assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf), hash = jointHash(original)
  assert.equal(original.version, 1); assert.equal(original.policyHash, realGamePolicyHash)
  assert.equal(assessCurrentRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW")
  assert.equal(jointHash(assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)), hash)
  const free = freeAgent()
  assert.equal(assessRealGameProjection(free.candidate, { ...free.eligibility, policyHash: realGamePolicyHash }, free.movement, asOf).status, "REVIEW")
})
test("current licensed club may be projected with fresh GAME evidence despite absence in a historical snapshot", () => {
  const f = projectionFixture(), before = structuredClone(f.candidate.game)
  f.candidate.game = { ...before, status: "UNKNOWN", club: null, nativeTeamIds: [], nativeClubTeamIds: [] }
  f.candidate.jointTransfer.game = { ...f.candidate.jointTransfer.game, state: "NOT_IN_SQUAD", club: null, nationalTeams: [], nationalCoverage: "NOT_IN_SQUAD" }
  f.eligibility.policyHash = currentRealGamePolicyHash
  const p = assessCurrentRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  assert.equal(p.status, "READY"); assert.equal(p.membership?.club?.id, f.candidate.jointTransfer.real?.club?.id)
  assert.equal(p.membership?.nationalCoverage, "UNKNOWN"); assert.deepEqual(p.membership?.nationalTeams, [])
  f.candidate.jointTransfer.futscoutProjection = p
  validateJointTransferPayload(f.candidate)
  const views = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED")
  assert.equal(views.game?.playingClub?.id, f.candidate.jointTransfer.real?.club?.id)
  assert.equal(views.snapshotGame?.clubLabel, "Não encontrado neste squad")
})
test("tampered new projection fails validation", () => {
  const f = freeAgent()
  f.candidate.jointTransfer.futscoutProjection = assessCurrentRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  f.candidate.jointTransfer.futscoutProjection.approvalReference = "unapproved"
  assert.throws(() => validateJointTransferPayload(f.candidate), /INVALID_OR_STALE/)
})
