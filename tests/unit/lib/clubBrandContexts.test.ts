import test from "node:test"
import assert from "node:assert/strict"
import { clubBindingNameMatches, projectedGameClubView } from "../../../lib/realGameProjection"
import { projectLoanMembership } from "../../../lib/jointTransferLoanSync"
import { jointFixture } from "../../fixtures/jointTransfer"

test("brand aliases are exact and context-specific; original GAME never accepts a REAL alias", () => {
  for (const [id, real, game] of [["115845", "Atalanta", "Bergamo Calcio"], ["131681", "AC Milan", "Milano FC"], ["131682", "Inter", "Lombardia FC"]]) {
    assert(clubBindingNameMatches(id, real, game, "REAL")); assert(clubBindingNameMatches(id, real, game, "PROJECTION"))
    assert(!clubBindingNameMatches(id, real, game, "GAME")); assert(!clubBindingNameMatches("999", real, game, "REAL"))
    assert(!clubBindingNameMatches(id, real.toLowerCase(), game, "REAL")); assert(!clubBindingNameMatches(id, game, real, "REAL"))
  }
})

test("projected loan owner and destination use game brands without mutating REAL evidence or nationals", () => {
  const p = jointFixture(), m = p.jointTransfer.real!
  const playingClub = { ...m.club!, eaId: "115845", name: "Atalanta" }, parentClub = { ...m.parentClub!, eaId: "131682", name: "Inter" }
  const loan = { ...m.loan!, playingClub, parentClub }
  const real = projectLoanMembership({ membership: { ...m, eaId: p.eaPlayerId, club: loan.playingClub }, loan, asOf: "2026-11-18" })
  const projected = { ...real, context: "GAME" as const, displayContext: "FUTSCOUT_PROJECTED" }, before = structuredClone(projected)
  const bindings = [playingClub, parentClub], shown = projectedGameClubView(projected, bindings)!
  assert.equal(shown.playingClub?.name, "Bergamo Calcio"); assert.equal(shown.loanBadge, "Emprestado pelo Lombardia FC")
  assert.equal(shown.mainContractClub?.name, "Lombardia FC"); assert.equal(shown.loanParties?.parentClub.name, "Lombardia FC")
  assert.deepEqual(shown.nationalTeams, real.nationalTeams); assert.deepEqual(shown.evidence, real.evidence)
  assert.deepEqual(projected, before); assert.equal(projectedGameClubView(real, bindings), real)
})
