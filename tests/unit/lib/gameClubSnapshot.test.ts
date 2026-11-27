import test from "node:test"
import assert from "node:assert/strict"
import { jointFixture, city, benfica } from "../../fixtures/jointTransfer"
import { jointTransferViews, validateJointTransferPayload } from "../../../lib/jointTransferContexts"
import { selectedGameMembership } from "../../../lib/realGameProjection"
import { zeroGameFreeAgentEconomics } from "../../../lib/publicEconomicOverlay"
import { gameClubSnapshotDecision, transferDecisionReadScope } from "../../../lib/transferReadScope"

function fixture() {
  const p = jointFixture()
  p.gameClubSnapshot = { version: 1, snapshot: { ...p.game.snapshot, id: "synthetic-new-squad", origin: "GAME_SQUAD_FILE", contentHash: "e".repeat(64), rosterVersion: "synthetic-new-version" },
    evidenceHash: "f".repeat(64), nativeTeamIds: ["234"], nativeClubTeamIds: ["234"], economicsZeroBefore: false,
    membership: { ...structuredClone(p.jointTransfer.game), club: benfica } }
  return p
}
test("selected squad changes only GAME and retains original snapshot, REAL loan and national team", () => {
  const p = fixture(), original = jointFixture()
  validateJointTransferPayload(p)
  const view = jointTransferViews(p, "2026-11-27")
  assert.equal(view.game?.playingClub?.id, benfica.id)
  assert.equal(view.snapshotGame?.playingClub?.id, city.id)
  assert.deepEqual(p.game, original.game)
  assert.deepEqual(p.jointTransfer, original.jointTransfer)
  assert.deepEqual(view.real, jointTransferViews(original, "2026-11-27").real)
  assert.deepEqual(view.game?.nationalTeams, original.jointTransfer.game.nationalTeams)
  assert.equal(view.game?.evidence?.snapshot?.contentHash, "e".repeat(64))
  assert.equal(selectedGameMembership(p, false).club?.id, benfica.id)
})
test("explicit free agency keeps the previous economic display policy and never zeros REAL", () => {
  const p = fixture(), s = p.gameClubSnapshot!
  s.membership.state = "FREE_AGENT"; s.membership.club = null
  s.nativeTeamIds = ["111592"]; s.nativeClubTeamIds = []
  for (const before of [false, true]) {
    s.economicsZeroBefore = before
    const transferContexts = jointTransferViews(p, "2026-11-27")
    assert.equal(zeroGameFreeAgentEconomics({ transferContexts }), before)
    assert.equal(zeroGameFreeAgentEconomics({ transferContexts }, "REAL"), false)
  }
})
test("new club without a native squad link is rejected", () => {
  const p = fixture(); p.gameClubSnapshot!.nativeTeamIds = ["10"]
  assert.throws(() => validateJointTransferPayload(p), /GAME_CLUB_NOT_IN_NATIVE_LINKS/)
})
test("a club update cannot silently replace national-team evidence", () => {
  const p = fixture(); p.gameClubSnapshot!.membership.nationalTeams = []
  assert.throws(() => validateJointTransferPayload(p), /GAME_CLUB_SNAPSHOT_INVALID/)
})
test("squad loan has separate GAME provenance and does not replace the REAL loan", () => {
  const p = fixture(), s = p.gameClubSnapshot!, real = structuredClone(p.jointTransfer.real)
  s.membership.parentClub = city
  s.membership.loan = { ...structuredClone(real!.loan!), context: "GAME", state: "ACTIVE_IN_SNAPSHOT", loanKey: "synthetic-new-game-loan",
    parentClub: { id: city.eaId!, name: city.name }, playingClub: { id: benfica.eaId!, name: benfica.name },
    purchase: { kind: "UNKNOWN", condition: null, evidenceUrl: null },
    evidence: { url: s.snapshot.sourceUrl, contentHash: s.evidenceHash, consultedAt: s.snapshot.observedAt, evidenceDate: null,
      snapshot: { version: s.snapshot.rosterVersion!, contentHash: s.snapshot.contentHash, effectiveAt: null } } }
  validateJointTransferPayload(p)
  assert.equal(jointTransferViews(p, "2026-11-27").game?.parentClub?.id, city.id)
  assert.deepEqual(p.jointTransfer.real, real)
  s.membership.loan = { ...s.membership.loan, evidence: { ...s.membership.loan.evidence,
    snapshot: { ...s.membership.loan.evidence.snapshot!, contentHash: "0".repeat(64) } } }
  assert.throws(() => validateJointTransferPayload(p), /GAME_CLUB_SNAPSHOT_LOAN_INVALID/)
})
test("read scope explicitly separates GAME-only from preserved paired readers", () => {
  const h = "a".repeat(64)
  assert.deepEqual(transferDecisionReadScope(gameClubSnapshotDecision(h, "GAME")), { contexts: ["GAME"], gameView: "EA_SNAPSHOT" })
  assert.deepEqual(transferDecisionReadScope(gameClubSnapshotDecision(h, "PAIRED_NATIVE")), { contexts: ["REAL", "GAME"], gameView: "EA_SNAPSHOT" })
  assert.deepEqual(transferDecisionReadScope(gameClubSnapshotDecision(h, "PAIRED_PROJECTED")), { contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED" })
  assert.throws(() => transferDecisionReadScope("game-club-snapshot:v1:invalid:GAME"), /DECISION_INVALID/)
})
