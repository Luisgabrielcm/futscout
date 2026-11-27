import test from "node:test"
import assert from "node:assert/strict"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { assessReviewedRealGameProjection, reviewedRealGamePolicyHash, clubBindingNameMatches, projectedGameClub } from "../../../lib/realGameProjection"
import { jointTransferViews, validateJointTransferPayload } from "../../../lib/jointTransferContexts"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"
import { zeroGameFreeAgentEconomics } from "../../../lib/publicEconomicOverlay"

const asOf = "2026-11-26"
function inactive(retired = false) {
  const f = projectionFixture()
  const state = retired ? "RETIRED" : "FREE_AGENT"
  f.candidate.real = { ...f.candidate.real!, status: state, club: null }
  f.candidate.jointTransfer.real = { ...f.candidate.jointTransfer.real!, state, club: null, parentClub: null, loan: null }
  f.movement = { ...f.movement, kind: retired ? "RETIREMENT_CONFIRMED" : "CURRENT_FREE_AGENT_CONFIRMED",
    evidenceHash: f.candidate.real.evidenceHash, sourceUrl: f.candidate.real.sourceUrl }
  f.candidate.jointTransfer.movements = [f.movement]
  f.eligibility = { ...f.eligibility, policyHash: reviewedRealGamePolicyHash, destinationClubId: null, destinationInGame: false,
    originClubId: null, originAvailable: false, destinationLicense: "UNKNOWN", individualPlayerEligibility: "UNKNOWN" }
  return f
}
function unlicensed() {
  const f = projectionFixture()
  f.eligibility = { ...f.eligibility, policyHash: reviewedRealGamePolicyHash, destinationLicense: "NO_LICENSED_PLAYERS", destinationInGame: false }
  return f
}
const windows = (selected: boolean) => ({ windows: ["2026-09-01", "2026-10-01", "2026-11-01"].map((date, i) =>
  ({ date, selected: selected && i === 2, complete: true, url: `https://example.invalid/callup/${i}`, contentHash: "a".repeat(64) })) })

test("the Lazio brand alias is bound to its existing EA identity and never rewrites the GAME reference", () => {
  assert.equal(clubBindingNameMatches("115841", "Lazio", "Latium", "REAL"), true)
  assert.equal(clubBindingNameMatches("115841", "Lazio", "Latium", "GAME"), false)
  assert.equal(clubBindingNameMatches("115845", "Lazio", "Latium", "REAL"), false)
  assert.equal(projectedGameClub({ eaId: "115841", name: "Lazio" })?.name, "Latium")
})

test("reviewed free agency and retirement exclude GAME while preserving REAL, EA snapshot and national teams", () => {
  for (const retired of [false, true]) {
    const f = inactive(retired), before = structuredClone(f.candidate)
    f.candidate.jointTransfer.futscoutProjection = assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
    assert.equal(f.candidate.jointTransfer.futscoutProjection.status, "READY")
    assert.equal(f.candidate.jointTransfer.futscoutProjection.representation, "EXCLUDED")
    validateJointTransferPayload(f.candidate)
    const views = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED")
    assert.equal(views.game?.clubState, "NOT_IN_SQUAD")
    assert.equal(views.game?.clubLabel, "Fora da projeção FutScout")
    assert.equal(views.game?.realFreeAgent, false)
    assert.equal(zeroGameFreeAgentEconomics({ transferContexts: views }), true)
    assert.equal(zeroGameFreeAgentEconomics({ transferContexts: views }, "REAL"), false)
    assert.equal(views.real?.clubLabel, retired ? "Aposentado" : "Jogador sem clube")
    assert.deepEqual(f.candidate.game, before.game)
    assert.deepEqual(f.candidate.jointTransfer.game, before.jointTransfer.game)
    assert.deepEqual(views.game?.nationalTeams, before.jointTransfer.game.nationalTeams)
    assert.equal(views.snapshotGame?.playingClub?.id, before.jointTransfer.game.club?.id)
  }
})
test("inactive exclusion rejects ambiguous identities, mismatched IDs, future facts and wrong movement evidence", () => {
  const f = inactive()
  for (const eligibility of [{ ...f.eligibility, identity: "AMBIGUOUS" as const }, { ...f.eligibility, eaId: "123" },
    { ...f.eligibility, destinationClubId: "fabricated" }, { ...f.eligibility, originClubId: "fabricated" }])
    assert.equal(assessReviewedRealGameProjection(f.candidate, eligibility, f.movement, asOf).status, "REVIEW")
  for (const patch of [{ eaId: "123" }, { evidenceHash: "b".repeat(64) }, { effectiveAt: "2027-01-01" }]) {
    const movement = { ...f.movement, ...patch }
    assert.equal(assessReviewedRealGameProjection(f.candidate, f.eligibility, movement, asOf).status, "REVIEW")
  }
})
test("unlicensed real club needs positive evidence in the last three windows for GAME free agency", () => {
  const f = unlicensed()
  assert.equal(assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW")
  f.eligibility.nationalWindowReview = windows(true)
  const p = assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  assert.equal(p.status, "READY"); assert.equal(p.representation, "FREE_AGENT")
  assert.equal(p.membership?.club, null)
  assert.deepEqual(p.realLoanRoute?.playingClub, f.candidate.jointTransfer.real?.club)
})
test("complete absence in three windows excludes GAME, while missing, repeated or future lists stay in review", () => {
  const f = unlicensed(); f.eligibility.nationalWindowReview = windows(false)
  assert.equal(assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).representation, "EXCLUDED")
  for (const patch of [windows(false).windows.slice(0, 2), windows(false).windows.map(w => ({ ...w, complete: false })),
    windows(false).windows.map(w => ({ ...w, date: "2026-10-01" })), windows(false).windows.map(w => ({ ...w, date: "2027-01-01" }))])
    assert.equal(assessReviewedRealGameProjection(f.candidate, { ...f.eligibility, nationalWindowReview: { windows: patch } }, f.movement, asOf).status, "REVIEW")
})
test("exclusion affects GAME count/rows and markets before pagination; REAL and original-squad queries remain intact", () => {
  const f = inactive(); f.candidate.jointTransfer.futscoutProjection = assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  const ids = new Set([f.candidate.eaPlayerId])
  const game = jointCatalogFilter([f.candidate], {}, undefined, ids)
  assert.match(JSON.stringify(game.where), /notIn/); assert(game.sql.values.includes(f.candidate.eaPlayerId))
  const real = jointCatalogFilter([f.candidate], { membershipContext: "REAL" }, undefined, ids)
  assert.doesNotMatch(JSON.stringify(real.where), /notIn/)
  assert.equal(jointCatalogFilter([f.candidate], {}, undefined).where.length, 0)
})

test("verified absence can exclude an unavailable player without inventing positive GAME availability", () => {
  const f = unlicensed()
  f.eligibility.gamePresence = "UNKNOWN"
  f.eligibility.evidence = f.eligibility.evidence.filter(e => e.role !== "PLAYER_GAME_PRESENCE")
  f.eligibility.nationalWindowReview = windows(false)
  const projection = assessReviewedRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  assert.equal(projection.status, "READY")
  assert.equal(projection.representation, "EXCLUDED")
  assert.equal(projection.eligibility.gamePresence, "UNKNOWN")
  assert.deepEqual(projection.membership?.nationalTeams, f.candidate.jointTransfer.game.nationalTeams)
  for (const nationalWindowReview of [windows(true), undefined])
    assert.equal(assessReviewedRealGameProjection(f.candidate, { ...f.eligibility, nationalWindowReview }, f.movement, asOf).status, "REVIEW")
  assert.equal(assessReviewedRealGameProjection(f.candidate, { ...f.eligibility, identity: "AMBIGUOUS" }, f.movement, asOf).status, "REVIEW")
})
