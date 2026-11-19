import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { jointFixture, city, benfica } from "../../fixtures/jointTransfer"
import { jointHash, jointTransferViews, validateJointTransferPayload } from "../../../lib/jointTransferContexts"
import { preservedGameHash } from "../../../lib/realOnlyTransfers"
import { classifyMovement, filterLoanPresentations } from "../../../lib/jointTransferLoanSync"
import { prepareRealOnlyTransferBatch, type RealOnlyTransferCandidate } from "../../../services/realOnlyTransferPreparation"
import { prepareJointTransferCommit } from "../../../services/jointTransferPersistence"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const asOf = "2026-11-19"
function candidate(state: "FREE_AGENT" | "RETIRED", eaId = "800071"): RealOnlyTransferCandidate {
  const base = jointFixture(eaId), source = base.real!
  base.real = null; base.jointTransfer.real = null
  return { base, expectedBaseHash: jointHash(base), patch: {
    real: { membership: { context: "REAL", state, club: null, parentClub: null, loan: null, nationalTeams: [], nationalCoverage: "UNKNOWN" },
      evidence: { ...source, status: state, club: null, observedAt: asOf + "T10:00:00Z" } },
    movement: { eaId, context: "REAL", kind: state === "RETIRED" ? "RETIREMENT_CONFIRMED" : "CURRENT_FREE_AGENT_CONFIRMED",
      evidenceConfirmed: true, sourceUrl: source.sourceUrl, evidenceHash: source.evidenceHash, effectiveAt: null },
  }, proof: { identityConfirmed: true, movementTypeConfirmed: false, currentEmploymentStatusConfirmed: true, currentPlayingConfirmed: false,
    chronologyConfirmed: true, sourceFileVerified: true, sourceHash: source.evidenceHash, currentSourceHash: source.evidenceHash,
    currentObservedAt: asOf + "T10:00:00Z", authority: "OFFICIAL", conflicts: [] }, gamePendingReasons: ["GAME_CONTEXT_RETAINED"] }
}
const plan = (c: RealOnlyTransferCandidate[]) => prepareRealOnlyTransferBatch({ candidates: c, excludedEaIds: [], asOf })

test("documented REAL retirement and free agency preserve the exact GAME club and national team", () => {
  for (const state of ["FREE_AGENT", "RETIRED"] as const) {
    const c = candidate(state), original = structuredClone(c), p = plan([c])
    assert.equal(p.eligible, 1); assert.equal(p.transfers, 0); assert.equal(p.loans, 0); assert.equal(p.clubConfirmations, 0)
    assert.equal(p.freeAgents, +(state === "FREE_AGENT")); assert.equal(p.retirements, +(state === "RETIRED"))
    const u = p.batches[0].updates[0]
    assert.equal(u.payload.real!.status, state); assert.equal(u.payload.real!.club, null)
    assert.equal(preservedGameHash(u.payload), preservedGameHash(c.base))
    assert.deepEqual(u.payload.game, c.base.game); assert.deepEqual(u.payload.jointTransfer.game.nationalTeams, [{ eaTeamId: "1370", name: "Brasil" }])
    assert.equal(u.payload.jointTransfer.futscoutProjection, undefined); assert.deepEqual(c, original)
    assert.equal(classifyMovement(c.patch.movement.kind, true).changesMainContractOwner, false)
    assert.deepEqual(p, prepareRealOnlyTransferBatch({ candidates: [c], excludedEaIds: [], asOf, checkpoint: p.checkpoint }))
  }
})

test("absence of a club, uncertain identity, expired evidence and conflicting sources cannot prove retirement or free agency", () => {
  for (const change of [
    (c: RealOnlyTransferCandidate) => { c.proof.currentEmploymentStatusConfirmed = false },
    (c: RealOnlyTransferCandidate) => { c.proof.identityConfirmed = false },
    (c: RealOnlyTransferCandidate) => { c.proof.movementTypeConfirmed = true },
    (c: RealOnlyTransferCandidate) => { c.proof.sourceFileVerified = false },
    (c: RealOnlyTransferCandidate) => { c.proof.currentObservedAt = "2026-10-01T00:00:00Z" },
    (c: RealOnlyTransferCandidate) => { c.proof.conflicts = ["CURRENT_STATUS_CONFLICT"] },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.state = "UNKNOWN"; c.patch.real.evidence.status = "UNKNOWN" },
    (c: RealOnlyTransferCandidate) => { c.patch.movement.effectiveAt = "2027-01-01" },
  ]) for (const state of ["FREE_AGENT", "RETIRED"] as const) { const c = candidate(state); change(c); assert.equal(plan([c]).eligible, 0) }
})

test("non-club employment cannot contain a route, a current club, or an active loan", () => {
  for (const change of [
    (c: RealOnlyTransferCandidate) => { c.patch.movement.route = { fromState: "CLUB", fromClub: city, toClub: benfica } },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.club = benfica },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.parentClub = city },
    (c: RealOnlyTransferCandidate) => { c.patch.real.membership.loan = jointFixture().jointTransfer.real!.loan },
  ]) { const c = candidate("RETIRED"); change(c); assert.equal(plan([c]).eligible, 0) }
})

test("retirement is rejected in GAME even when the caller bypasses preparation", () => {
  const p = plan([candidate("RETIRED")]).batches[0].updates[0].payload
  p.jointTransfer.game = { ...p.jointTransfer.game, state: "RETIRED", club: null }
  assert.throws(() => validateJointTransferPayload(p), /MEMBERSHIP_INVALID/)
})

test("the payload validator rejects missing employment evidence and GAME employment events", () => {
  for (const state of ["FREE_AGENT", "RETIRED"] as const) {
    const p = plan([candidate(state)]).batches[0].updates[0].payload
    const noEvidence = structuredClone(p); noEvidence.jointTransfer.movements = []
    assert.throws(() => validateJointTransferPayload(noEvidence), /EMPLOYMENT_EVIDENCE_REQUIRED/)
    const fakeGameEvent = structuredClone(p)
    fakeGameEvent.jointTransfer.movements = [...fakeGameEvent.jointTransfer.movements,
      { ...fakeGameEvent.jointTransfer.movements.at(-1)!, context: "GAME" }]
    assert.throws(() => validateJointTransferPayload(fakeGameEvent), /EMPLOYMENT_OBSERVATION_IS_REAL_ONLY/)
  }
})

test("the existing writer binds employment-only selections to a new version and unchanged GAME baseline", () => {
  const p = plan([candidate("FREE_AGENT")]), b = p.batches[0], u = b.updates[0]
  const item = { payload: u.payload, expectedGameBaselineHash: u.expectedGameBaselineHash, expectedSelection: null,
    expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: "2026-11-16T00:00:00.000Z" }
  assert(prepareJointTransferCommit([item], b.decisionReference))
  assert.throws(() => prepareJointTransferCommit([{ ...item, expectedGameBaselineHash: "f".repeat(64) }], b.decisionReference), /GAME_BASELINE/)
})

test("REAL employment cards and profiles show verified status without fabricated loan terms", () => {
  const { default: Component } = loadCatalogModule<typeof import("../../../app/components/PlayerLoanContext")>("app/components/PlayerLoanContext.tsx", {})
  for (const state of ["FREE_AGENT", "RETIRED"] as const) {
    const u = plan([candidate(state)]).batches[0].updates[0], views = jointTransferViews(u.payload, asOf), value = views.real!
    assert.equal(views.game!.playingClub!.id, city.id)
    assert.equal(filterLoanPresentations([value, views.game!], { context: "REAL", state }).length, 1)
    for (const locale of ["pt", "en"] as const) for (const variant of ["card", "profile"] as const) {
      const html = renderToStaticMarkup(createElement(Component, { value, playerName: "Synthetic identity", locale, variant }))
      assert.match(html, state === "RETIRED" ? locale === "pt" ? /Aposentado/ : /Retired/ : locale === "pt" ? /Agente livre/ : /Free agent/)
      assert.doesNotMatch(html, /Emprestado pelo|On loan from|Benfica|Loan start|Início do empréstimo|Purchase option/)
    }
  }
})
