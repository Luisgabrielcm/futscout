import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { canonicalJson } from "../../../lib/clubContexts"
import { validateLoanObservation, loanEffectiveState, inspectLoanBatch, classifyMovement,
  projectLoanMembership, filterLoanPresentations, prepareIncrementalLoanSync, emptyLoanBaselineHash, type LoanObservation, type LoanMembership } from "../../../lib/jointTransferLoanSync"

const owner = { id: "10", name: "Manchester City" }, borrower = { id: "234", name: "Benfica" }
const make = (patch: Partial<LoanObservation> = {}): LoanObservation => ({ eaId: "276528", context: "REAL", loanKey: "fixture-loan-1", state: "ACTIVE",
  parentClub: owner, playingClub: borrower, startsAt: null, endsAt: null, endSeason: "2026/27",
  purchase: { kind: "OPTION", condition: null, evidenceUrl: "https://example.invalid/loan" },
  identityConfirmed: true, chronologyConfirmed: true, movementTypeConfirmed: true,
  evidence: { url: "https://example.invalid/loan", evidenceDate: "2026-09-02", consultedAt: "2026-11-16T00:00:00Z", contentHash: "a".repeat(64), snapshot: null }, ...patch })
const membership: LoanMembership = { eaId: "276528", context: "REAL", state: "CLUB", club: borrower, nationalTeams: [] }
const asOf = "2026-11-16"
const game = (): LoanObservation => make({ context: "GAME", state: "ACTIVE_IN_SNAPSHOT", evidence: { ...make().evidence,
  snapshot: { version: "FC27 synthetic", contentHash: "b".repeat(64), effectiveAt: null } } })
const beforeHash = (rows: LoanObservation[]) => createHash("sha256").update(canonicalJson(rows)).digest("hex")

test("REAL loan keeps playing club, parent and principal contract role separate", () => {
  const value = projectLoanMembership({ membership, loan: make(), asOf })
  assert.equal(value.playingClub?.name, "Benfica"); assert.equal(value.parentClub?.name, "Manchester City")
  assert.equal(value.loanBadge, "Emprestado pelo Manchester City")
  assert.equal(value.mainContractClub?.id, "10"); assert.equal(value.mainContractEnd, null)
})
test("GAME never inherits a REAL loan or vice versa; the game requires a version", () => {
  assert.throws(() => projectLoanMembership({ membership: { ...membership, context: "GAME" }, loan: make(), asOf }), /CONTEXT_MISMATCH/)
  assert.throws(() => validateLoanObservation({ ...game(), evidence: make().evidence }), /GAME_LOAN_VERSION_REQUIRED/)
  const native = projectLoanMembership({ membership: { ...membership, context: "GAME", club: owner }, loan: null, asOf })
  assert.equal(native.clubLabel, "Manchester City"); assert.equal(native.loanBadge, null)
})
test("FREE_AGENT, UNKNOWN and NOT_IN_SQUAD preserve national membership without a loan", () => {
  for (const state of ["FREE_AGENT", "UNKNOWN", "NOT_IN_SQUAD"] as const) {
    const value = projectLoanMembership({ membership: { eaId: "233927", context: "GAME", state, club: null, nationalTeams: [{ eaTeamId: "1370", name: "Brasil" }] }, loan: null, asOf })
    assert.equal(value.clubState, state); assert.equal(value.nationalTeams[0].eaTeamId, "1370"); assert.equal(value.parentClub, null)
  }
  assert.throws(() => projectLoanMembership({ membership: { ...membership, state: "FREE_AGENT", club: null }, loan: make(), asOf }), /LOAN_PLAYING_CLUB_MISMATCH/)
})
test("a planned end never implies return or permanent purchase", () => {
  const expired = make({ endsAt: "2026-06-30" })
  assert.equal(loanEffectiveState(expired, asOf), "PENDING_VERIFICATION")
  const value = projectLoanMembership({ membership, loan: expired, asOf })
  assert.equal(value.playingClub?.id, borrower.id); assert.equal(value.parentClub?.id, owner.id); assert.equal(value.loanBadge, null)
  assert.equal(loanEffectiveState({ ...game(), endsAt: "2025-06-30" }, asOf), "ACTIVE_IN_SNAPSHOT")
  assert.equal(loanEffectiveState(make({ startsAt: "2027-01-01" }), asOf), "PENDING_VERIFICATION")
})
test("a proven snapshot date after the loan end requires review; an undated snapshot remains source-bound", () => {
  const dated = { ...game(), endsAt: "2026-06-30", evidence: { ...game().evidence, snapshot: { ...game().evidence.snapshot!, effectiveAt: "2026-11-03" } } }
  assert(inspectLoanBatch([dated], asOf).results[0].reasons.includes("LOAN_EXPIRED_BEFORE_SNAPSHOT_EFFECTIVE_DATE"))
  assert.equal(projectLoanMembership({ membership: { ...membership, context: "GAME" }, loan: dated, asOf }).loanBadge, null)
})

test("unconfirmed evidence cannot produce an active loan badge even outside the planner", () => {
  for (const flag of ["identityConfirmed", "chronologyConfirmed", "movementTypeConfirmed"] as const) {
    const value = projectLoanMembership({ membership, loan: make({ [flag]: false }), asOf })
    assert.equal(value.loanStatus, "PENDING_VERIFICATION"); assert.equal(value.loanBadge, null)
  }
})
test("date reversal, invalid calendar dates, parent=borrower and unsupported purchase claims fail", () => {
  assert.throws(() => validateLoanObservation(make({ startsAt: "2026-09-02", endsAt: "2026-06-30" })), /LOAN_DATES_INVALID/)
  assert.throws(() => validateLoanObservation(make({ startsAt: "2026-02-30" })), /LOAN_DATES_INVALID/)
  assert.throws(() => validateLoanObservation(make({ endSeason: "2026/99" })), /LOAN_DATES_INVALID/)
  assert.throws(() => validateLoanObservation(make({ parentClub: borrower })), /CLUB_INVALID/)
  assert.throws(() => validateLoanObservation(make({ purchase: { kind: "OPTION", condition: null, evidenceUrl: null } })), /PURCHASE_TERMS_EVIDENCE_REQUIRED/)
  assert.throws(() => validateLoanObservation(make({ purchase: { kind: "CONDITIONAL_OBLIGATION", condition: null, evidenceUrl: "https://example.invalid/loan" } })), /PURCHASE_CONDITION_REQUIRED/)
  validateLoanObservation({ ...game(), purchase: { kind: "UNKNOWN", condition: null, evidenceUrl: null, nativeFlag: 1, nativeAmountRaw: 0 } })
})
test("two active loans conflict only within the same player, context and snapshot", () => {
  const other = make({ loanKey: "another", playingClub: { id: "110062", name: "Girona" } })
  const result = inspectLoanBatch([make(), other, game()], asOf)
  assert.equal(result.review, 1); assert.equal(result.ready, 1)
  assert(result.results.find(r => r.context === "REAL")?.reasons.includes("MULTIPLE_ACTIVE_LOANS"))
  const secondVersion = { ...game(), evidence: { ...game().evidence, snapshot: { ...game().evidence.snapshot!, contentHash: "c".repeat(64) } } }
  assert.equal(inspectLoanBatch([game(), secondVersion], asOf).review, 0)
})
test("history interval overlap is a conflict, exact duplicates are idempotent", () => {
  const a = make({ loanKey: "old", state: "ENDED_CONFIRMED", startsAt: "2026-01-01", endsAt: "2026-06-30" })
  const b = make({ loanKey: "new", startsAt: "2026-06-15", endsAt: "2027-06-30" })
  assert(inspectLoanBatch([a, b], asOf).results[0].reasons.includes("LOAN_PERIOD_OVERLAP"))
  const duplicate = inspectLoanBatch([make(), make()], asOf)
  assert.equal(duplicate.ready, 1); assert.equal(duplicate.duplicateHashes.length, 1)
})
test("ambiguous or malformed players do not block unrelated safe updates", () => {
  const bad = make({ eaId: "1", identityConfirmed: false })
  const malformed = make({ eaId: "2", startsAt: "2026-02-30" })
  const plan = prepareIncrementalLoanSync({ before: [], next: [make(), bad, malformed], asOf, expectedBeforeHash: emptyLoanBaselineHash() })
  assert.equal(plan.updates.length, 1); assert.equal(plan.review.length, 1); assert.equal(plan.rejected.length, 1)
})
test("incremental plans have stable hashes, checkpoints and compare-and-swap rollback", () => {
  const input = { before: [], next: [make()], asOf, expectedBeforeHash: emptyLoanBaselineHash() }
  const first = prepareIncrementalLoanSync(input)
  assert.deepEqual(first, prepareIncrementalLoanSync(input)); assert.equal(first.executionAuthorized, false)
  assert.equal(first.updates[0].rollback.compareAndSwapRequired, true); assert.equal(first.checkpoint.batchHash, first.batchHash)
  assert(first.forbiddenWriteTargets.includes("Player.clubId"))
  const replay = prepareIncrementalLoanSync({ before: [make()], next: [make()], asOf, expectedBeforeHash: beforeHash([make()]) })
  assert.equal(replay.updates.length, 0)
  assert.throws(() => prepareIncrementalLoanSync({ ...input, expectedBeforeHash: "f".repeat(64) }), /LOAN_BASELINE_CHANGED/)
})
test("source absence preserves an existing loan; explicit same-episode return can close it", () => {
  const before = [make()]
  const missing = prepareIncrementalLoanSync({ before, next: [], asOf, expectedBeforeHash: beforeHash(before) })
  assert.equal(missing.updates.length, 0); assert.equal(missing.absentFromNext.length, 1)
  const ended = make({ state: "RETURN_CONFIRMED", endsAt: "2026-10-31" })
  const close = prepareIncrementalLoanSync({ before, next: [ended], asOf, expectedBeforeHash: beforeHash(before) })
  assert.equal(close.updates[0].action, "CLOSE_SAME_LOAN_WITHOUT_INFERRED_CLUB_CHANGE")
  const old = { ...ended, loanKey: "older-episode" }
  assert.equal(prepareIncrementalLoanSync({ before, next: [old], asOf, expectedBeforeHash: beforeHash(before) }).updates.length, 0)
})
test("a new loan cannot silently replace an unclosed prior active loan", () => {
  const previous = make({ loanKey: "prior-episode" }), next = make({ loanKey: "new-episode" })
  const blocked = prepareIncrementalLoanSync({ before: [previous], next: [next], asOf, expectedBeforeHash: beforeHash([previous]) })
  assert.equal(blocked.updates.length, 0); assert(blocked.review[0].reasons.includes("PRIOR_ACTIVE_LOAN_NOT_CLOSED"))
  const closed = { ...previous, state: "RETURN_CONFIRMED" as const, endsAt: "2026-06-30" }
  assert.equal(prepareIncrementalLoanSync({ before: [previous], next: [closed, next], asOf, expectedBeforeHash: beforeHash([previous]) }).updates.length, 1)
})
test("loan, return, recall and definitive purchase remain distinct movement types", () => {
  assert.equal(classifyMovement("LOAN_START", true).changesMainContractOwner, false)
  assert.equal(classifyMovement("LOAN_RETURN_CONFIRMED", true).changesMainContractOwner, false)
  assert.equal(classifyMovement("LOAN_RECALL_CONFIRMED", true).changesMainContractOwner, false)
  assert.equal(classifyMovement("LOAN_TO_PERMANENT", true).changesMainContractOwner, true)
  assert.equal(classifyMovement("PERMANENT_TRANSFER", true).autoPurchaseOnOptionOrObligation, false)
  assert.throws(() => classifyMovement("LOAN_TO_PERMANENT", false), /MOVEMENT_EVIDENCE_REQUIRED/)
})
test("current/parent club filters are independent and scoped to the correct context", () => {
  const real = projectLoanMembership({ membership, loan: make(), asOf })
  const native = projectLoanMembership({ membership: { ...membership, context: "GAME", club: owner }, loan: null, asOf })
  assert.equal(filterLoanPresentations([real, native], { context: "REAL", playingClubId: "234", parentClubId: "10" }).length, 1)
  assert.equal(filterLoanPresentations([real, native], { context: "GAME", parentClubId: "10" }).length, 0)
  assert.equal(filterLoanPresentations([real, native], { context: "GAME", playingClubId: "10" }).length, 1)
})
test("FutScout projected rosters require an approved matching eligibility decision and never claim official status", () => {
  const input = { membership, loan: make(), asOf, mode: "FUTSCOUT_PROJECTED" as const }
  assert.throws(() => projectLoanMembership(input), /APPROVED_PROJECTED_ELIGIBILITY_REQUIRED/)
  const policyHash = "d".repeat(64)
  const projected = projectLoanMembership({ ...input, approvedEligibilityPolicyHash: policyHash,
    eligibility: { eaId: "276528", destinationId: "234", policyVersion: "approved-fixture", policyHash, allowed: true } })
  assert.equal(projected.isOfficialSquadClaimed, false); assert.match(projected.provenanceLabel, /não corresponde/)
})
test("economic values and manual edits cannot be overwritten by the loan view model", () => {
  const value = projectLoanMembership({ membership, loan: make(), asOf })
  for (const key of ["clubId", "salary", "contractEnd", "marketValue", "potential", "manualEdits"]) assert(!(key in value))
})
