import test from "node:test"
import assert from "node:assert/strict"
import { jointFixture } from "../../fixtures/jointTransfer"
import { validateLoanObservation, loanEffectiveState } from "../../../lib/jointTransferLoanSync"

test("a documented calendar season retains its label without inventing an exact expiry", () => {
  const loan = { ...jointFixture("800010").jointTransfer.real!.loan!, startsAt: null, endsAt: null, endSeason: "2026" }
  const before = structuredClone(loan)
  validateLoanObservation(loan)
  assert.equal(loanEffectiveState(loan, "2026-11-18"), "ACTIVE")
  assert.equal(loanEffectiveState(loan, "2027-01-01"), "PENDING_VERIFICATION")
  assert.deepEqual(loan, before)
  assert.equal(loan.endsAt, null)
  assert.equal(loan.state, "ACTIVE")
})
test("calendar season support preserves historical GAME observations and rejects malformed labels", () => {
  const p = jointFixture("800011"), original = p.jointTransfer.real!.loan!
  const loan = { ...original, context: "GAME" as const, state: "ACTIVE_IN_SNAPSHOT" as const,
    parentClub: { id: "10", name: "Manchester City" }, playingClub: { id: "234", name: "Benfica" },
    evidence: { ...original.evidence, url: p.game.snapshot.sourceUrl,
      snapshot: { version: "FC27 fixture", contentHash: p.game.snapshot.contentHash, effectiveAt: "2026-11-03" } },
    endsAt: null, endSeason: "2026" }
  validateLoanObservation(loan)
  assert.equal(loanEffectiveState(loan, "2028-01-01"), "ACTIVE_IN_SNAPSHOT")
  for (const endSeason of ["2026/28", "2026/2027", "26", "2026-12-31", "unknown"])
    assert.throws(() => validateLoanObservation({ ...loan, endSeason }), /LOAN_DATES_INVALID/)
})
