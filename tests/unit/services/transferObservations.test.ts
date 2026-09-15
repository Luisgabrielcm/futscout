import assert from "node:assert/strict"
import test from "node:test"
import { compareTransferObservations, parseTransferResponse, resolveTransferTeamObservation, transferCanonicalKey } from "../../../lib/transferObservations"
import { evaluateCurrentClubEvidence } from "../../../services/currentClubEvidence"
import { fixtureDestination, transferEvent, transferNow, transferPayload, transferRoster } from "../../fixtures/transferObservation"

const parse = (events: unknown[] = [transferEvent()]) => parseTransferResponse(transferPayload(306, events), 306, transferNow)
test("valid transfer identity, raw fields and source order survive normalization without mutation", () => {
  const payload = transferPayload(), before = structuredClone(payload), r = parseTransferResponse(payload, 306, transferNow)
  assert.equal(r.validation, "VALID_IDENTITY"); assert.equal(r.returnedPlayerIdentity?.id, 306)
  assert.equal(r.transfers[0].sourceIndex, 0); assert.equal(r.transfers[0].fromProviderTeamId, 40)
  assert.equal(r.transfers[0].toProviderTeamId, fixtureDestination); assert.deepEqual(payload, before)
})
test("wrong player anywhere in response blocks all events, even after a valid group", () => {
  const body = transferPayload(); body.response.push({ ...body.response[0], player: { id: 44, name: "Mohamed Salah" } }); body.results = 2
  assert.throws(() => parseTransferResponse(body, 306, transferNow), /INVALID_PROVIDER_IDENTITY/)
})
test("empty response has no returned identity and no fabricated transfer", () => {
  const r = parseTransferResponse({ errors: [], results: 0, response: [] }, 306, transferNow)
  assert.equal(r.validation, "EMPTY_NO_EVIDENCE"); assert.equal(r.returnedPlayerIdentity, null); assert.deepEqual(r.transfers, [])
})
for (const body of [null, {}, { errors: [], results: 1, response: [] }, { errors: ["bad"], results: 0, response: [] },
  { ...transferPayload(), paging: { current: 1, total: 2 } }, transferPayload(306, [42]),
  transferPayload(306, [{ ...transferEvent(), type: 500 }]), transferPayload(306, [{ ...transferEvent(), teams: { in: { id: "40" } } }])]) {
  test(`malformed/paginated response fails closed: ${JSON.stringify(body).slice(0, 100)}`, () => assert.throws(() => parseTransferResponse(body, 306, transferNow)))
}
for (const type of ["Free", "Loan", "N/A", "€ 50M", " € 50M ", null]) {
  test(`typeRaw ${JSON.stringify(type)} is exact and never becomes marketValue or numeric fee`, () => {
    const t = parse([transferEvent("2026-09-10", type)]).transfers[0]
    assert.equal(t.typeRaw, type); assert.equal("marketValue" in t, false); assert.equal("transferFee" in t, false)
    assert.equal("transferValue" in t, false)
  })
}
for (const [raw, expected] of [["2026-09-15", "VALID"], ["2026-09-16", "FUTURE_TRANSFER"], ["2026-02-30", "INVALID_DATE"],
  ["not-a-date", "INVALID_DATE"], [null, "MISSING_DATE"], ["", "MISSING_DATE"]] as const) {
  test(`date ${raw} is retained and classified as ${expected}`, () => {
    const r = parse([transferEvent(raw)]); assert.equal(r.transfers.length, 1)
    assert.equal(r.transfers[0].dateRaw, raw); assert.equal(r.transfers[0].dateState, expected)
    if (expected !== "VALID") assert.ok(r.warnings.includes(expected))
  })
}
test("chronological asc/desc do not assume source order; invalid dates stay visible at the end", () => {
  const r = parse([transferEvent("2026-09-12"), transferEvent(null), transferEvent("2026-09-01"), transferEvent("2026-09-12")])
  assert.deepEqual(r.transfers.map(t => t.sourceIndex), [0, 1, 2, 3])
  assert.deepEqual(r.chronologicalAsc.map(t => t.sourceIndex), [2, 0, 3, 1]); assert.deepEqual(r.chronologicalDesc.map(t => t.sourceIndex), [0, 3, 2, 1])
})
test("comparison distinguishes exact duplicate, corrected raw type/name and distinct route on same date", () => {
  const [a, b, c, d] = parse([transferEvent(), transferEvent(), transferEvent("2026-09-10", "Loan"), transferEvent("2026-09-10", "Free", 40, 900002)]).transfers
  assert.equal(transferCanonicalKey(a), transferCanonicalKey(b)); assert.equal(compareTransferObservations(a, b), "EXACT_DUPLICATE")
  assert.equal(compareTransferObservations(a, c), "POSSIBLE_REVISION"); assert.equal(compareTransferObservations(a, d), "DISTINCT_EVENT")
  assert.equal(compareTransferObservations(a, { ...a, toTeamNameRaw: "Renamed" }), "POSSIBLE_REVISION")
})
test("missing teams remain null; name-only club lookup is prohibited", () => {
  const t = parse([{ date: "2026-09-10", type: "N/A" }]).transfers[0]
  assert.equal(t.fromProviderTeamId, null); assert.equal(t.toTeamNameRaw, null)
  const clubs = [{ id: "c", name: "Exact name", apiFootballId: 50 }]
  assert.equal(resolveTransferTeamObservation(null, "Exact name", clubs).status, "UNKNOWN_TEAM")
  assert.equal(resolveTransferTeamObservation(51, "Exact name", clubs).status, "UNKNOWN_TEAM")
  assert.equal(resolveTransferTeamObservation(50, "Unrelated", clubs).clubId, "c")
  assert.equal(resolveTransferTeamObservation(50, null, [...clubs, { ...clubs[0], id: "other" }]).status, "CONFLICT")
})
test("only explicit supported loan/return labels produce hints; a reverse route does not", () => {
  const r = parse([transferEvent("2026-09-10", "Loan"), transferEvent("2026-09-11", "Return from loan"), transferEvent("2026-09-12", "N/A", fixtureDestination, 40)])
  assert.deepEqual(r.transfers.map(t => t.kindHint), ["LOAN_HINT", "RETURN_FROM_LOAN_HINT", "UNKNOWN_TRANSFER_KIND"])
})

function evidence(events: unknown[] = []) {
  return { localPlayer: { providerPlayerId: 306, identityConfirmed: true, clubId: "liverpool", localTeamId: 40 },
    transferObservations: parse(events).transfers, validRosters: [transferRoster(40, [])], officialLineups: [] as { teamId: number; fixtureDate: string; playerIds: number[] }[],
    resolvedTeams: [resolveTransferTeamObservation(fixtureDestination, "X", [{ id: "destination", name: "X", apiFootballId: fixtureDestination }])], now: transferNow }
}
test("Salah absence alone is insufficient and proposes no destination", () => {
  const r = evaluateCurrentClubEvidence(evidence()); assert.equal(r.decision, "INSUFFICIENT_EVIDENCE")
  assert.equal(r.reason, "ABSENT_FROM_LOCAL_CLUB_ROSTER"); assert.equal(r.candidateTeamId, null); assert.equal(r.writable, false)
})
test("Salah synthetic transfer needs destination roster; corroboration makes only a candidate", () => {
  const e = evidence([transferEvent()]); assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER")
  e.validRosters.push(transferRoster(fixtureDestination, [306])); const before = structuredClone(e)
  assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE"); assert.deepEqual(e, before)
})
test("local roster confirms local club, not a transfer", () => {
  const e = evidence(); e.validRosters = [transferRoster(40, [306])]
  assert.equal(evaluateCurrentClubEvidence(e).decision, "CURRENT_CLUB_CONFIRMED")
})
test("other club roster without transfer chronology is stale, never auto-transfer", () => {
  const e = evidence(); e.validRosters.push(transferRoster(fixtureDestination, [306]))
  assert.equal(evaluateCurrentClubEvidence(e).decision, "STALE_LOCAL_CLUB")
})
test("explicit A to B with contemporary C roster is conflict", () => {
  const e = evidence([transferEvent()]); e.validRosters.push(transferRoster(900002, [306]), transferRoster(fixtureDestination, [306]))
  assert.equal(evaluateCurrentClubEvidence(e).decision, "CONFLICT")
})
test("Enzo: Chelsea plus City rosters and historical City lineup never select a club", () => {
  const e = evidence(); e.localPlayer = { providerPlayerId: 5996, identityConfirmed: true, clubId: "chelsea", localTeamId: 49 }
  e.validRosters = [transferRoster(49, [5996]), transferRoster(50, [5996])]
  e.officialLineups = [{ teamId: 50, fixtureDate: "2026-09-08T19:00:00Z", playerIds: [5996] }]
  const r = evaluateCurrentClubEvidence(e); assert.equal(r.decision, "CONFLICT"); assert.equal(r.candidateTeamId, null)
})
test("historical lineup before transfer does not contradict destination; later/same-day one does", () => {
  const e = evidence([transferEvent()]); e.validRosters.push(transferRoster(fixtureDestination, [306]))
  e.officialLineups = [{ teamId: 40, fixtureDate: "2026-09-08T19:00:00Z", playerIds: [306] }]
  assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE")
  e.officialLineups[0].fixtureDate = "2026-09-10T19:00:00Z"; assert.equal(evaluateCurrentClubEvidence(e).decision, "CONFLICT")
})
test("future transfer is reported but cannot move present club", () => {
  const e = evidence([transferEvent("2026-10-01")]); const r = evaluateCurrentClubEvidence(e)
  assert.equal(r.decision, "INSUFFICIENT_EVIDENCE"); assert.equal(r.candidateTeamId, null); assert.ok(r.warnings.includes("FUTURE_TRANSFER"))
})
test("latest effective date wins, not last source item; future entries do not override it", () => {
  const e = evidence([transferEvent(), transferEvent("2026-01-01", "Free", 50, 40), transferEvent("2026-10-01", "Free", fixtureDestination, 50)])
  e.validRosters.push(transferRoster(fixtureDestination, [306])); assert.equal(evaluateCurrentClubEvidence(e).candidateTeamId, fixtureDestination)
})
test("latest same-day revision or two distinct routes are ambiguous, exact duplicates are harmless", () => {
  const e = evidence([transferEvent(), transferEvent()]); e.validRosters.push(transferRoster(fixtureDestination, [306]))
  assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE")
  e.transferObservations[1].typeRaw = "Loan"; assert.equal(evaluateCurrentClubEvidence(e).decision, "CONFLICT")
  e.transferObservations[1].toProviderTeamId = 900002; assert.equal(evaluateCurrentClubEvidence(e).decision, "CONFLICT")
})
test("unknown destination / unconfirmed identity cannot produce transfer candidate", () => {
  const e = evidence([transferEvent()]); e.resolvedTeams = []
  assert.equal(evaluateCurrentClubEvidence(e).reason, "UNKNOWN_DESTINATION_TEAM")
  e.localPlayer.identityConfirmed = false; assert.equal(evaluateCurrentClubEvidence(e).decision, "INSUFFICIENT_EVIDENCE")
})
test("destination roster exists but lacks player: mismatch, not proof of another destination", () => {
  const e = evidence([transferEvent()]); e.validRosters.push(transferRoster(fixtureDestination, []))
  assert.equal(evaluateCurrentClubEvidence(e).decision, "ROSTER_MISMATCH")
})
for (const [type, expected] of [["Loan", "LOAN_CANDIDATE"], ["Return from loan", "RETURN_FROM_LOAN_CANDIDATE"]]) {
  test(`${type} + corroboration preserves kind without any write`, () => {
    const e = evidence([transferEvent("2026-09-10", type)]); e.validRosters.push(transferRoster(fixtureDestination, [306]))
    const r = evaluateCurrentClubEvidence(e); assert.equal(r.decision, expected); assert.equal(r.writable, false)
  })
}
test("expired/wrong-season destination roster is not current evidence", () => {
  const e = evidence([transferEvent()]); const r = transferRoster(fixtureDestination, [306]); r.season = 2025; e.validRosters.push(r)
  assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER")
  r.season = 2026; r.expiresAt = "2026-09-15T11:59:59Z"; assert.equal(evaluateCurrentClubEvidence(e).decision, "TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER")
})
