import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { city, benfica, jointEnvironment, fixtureDate } from "../../fixtures/jointTransfer"
import { assessRealGameProjection, realGamePolicyHash, realGamePolicy, selectedGameMembership } from "../../../lib/realGameProjection"
import { jointHash, jointTransferViews, jointReadManifest, validateJointTransferPayload } from "../../../lib/jointTransferContexts"
import { prepareJointRealGameSync, prepareJointRealGameCommit, confirmedRealChange } from "../../../services/jointRealGameSync"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { formatCurrency } from "../../../utils/formatCurrency"

const asOf = "2026-11-16"
function prepared() {
  const f = projectionFixture(), projection = assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  f.candidate.jointTransfer.futscoutProjection = projection
  return f
}
function projectionEnv(p: ReturnType<typeof prepared>["candidate"]) {
  const base = jointEnvironment([p]), manifest = JSON.parse(base.JOINT_TRANSFER_READ_MANIFEST)
  manifest.entries[0].gameView = "FUTSCOUT_PROJECTED"
  return { ...base, JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "1", JOINT_REAL_GAME_POLICY_SHA256: realGamePolicyHash,
    JOINT_TRANSFER_READ_MANIFEST: JSON.stringify(manifest), JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(manifest) }
}

test("approved policy projects a licensed real loan jointly while preserving the exact original EA snapshot", () => {
  const f = projectionFixture(), original = structuredClone(f.candidate.game)
  const batch = prepareJointRealGameSync({ before: [], expectedBeforeHash: jointHash([]), updates: [f], asOf, unverifiedRealEaIds: [] })
  assert.equal(batch.jointReady, 1); assert.equal(batch.reviewCount, 0); assert.equal(batch.automaticRealOnlyActivation, false)
  assert.deepEqual(batch.updates[0].contexts, ["REAL", "GAME"])
  const p = batch.updates[0].payload, views = jointTransferViews(p, asOf, "FUTSCOUT_PROJECTED")
  assert.equal(views.real?.clubLabel, "Benfica"); assert.equal(views.game?.clubLabel, "Benfica")
  assert.equal(views.game?.parentClub?.name, "Manchester City"); assert.equal(views.game?.displayContext, "FUTSCOUT_PROJECTED")
  assert.equal(views.snapshotGame?.clubLabel, "Manchester City"); assert.equal(views.snapshotGame?.loanBadge, null)
  assert.equal(views.game?.evidence?.snapshot, null); assert.equal(views.game?.loanDates?.endsAt, null)
  assert.deepEqual(p.game, original); assert.equal(realGamePolicy.preserveOriginalEaSnapshot, true)
})

test("unlicensed destination means projected FREE_AGENT, not real unemployment or a fictional official game loan", () => {
  const f = projectionFixture(); f.eligibility.destinationLicense = "NO_LICENSED_PLAYERS"
  f.candidate.jointTransfer.futscoutProjection = assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  const views = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED"), projection = f.candidate.jointTransfer.futscoutProjection
  assert.equal(projection.status, "READY"); assert.equal(views.game?.clubState, "FREE_AGENT")
  assert.equal(views.game?.loanBadge, null); assert.equal(views.game?.loanStatus, null)
  assert.equal(views.real?.clubLabel, "Benfica"); assert.equal(views.real?.loanStatus, "ACTIVE")
  assert.equal(views.projectedRealLoanRoute?.parentClub.name, "Manchester City"); assert.equal(views.projectedRealLoanRoute?.playingClub.name, "Benfica")
  assert.deepEqual(views.game?.nationalTeams, views.snapshotGame?.nationalTeams)
  assert.equal(f.candidate.game.status, "CLUB"); assert.equal(projection.officialEaMovementClaimed, false)
})

test("partial licensing is decided individually and UNKNOWN never becomes FREE_AGENT", () => {
  for (const [individual, expected] of [["ELIGIBLE", "CLUB"], ["INELIGIBLE", "FREE_AGENT"], ["UNKNOWN", "PENDING"]] as const) {
    const f = projectionFixture(); f.eligibility.destinationLicense = "PARTIAL"; f.eligibility.individualPlayerEligibility = individual
    if (individual !== "UNKNOWN") f.eligibility.evidence = [...f.eligibility.evidence, { ...f.eligibility.evidence[2], role: "PLAYER_DESTINATION_ELIGIBILITY", eaId: f.candidate.eaPlayerId, individualDecision: individual }]
    assert.equal(assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).representation, expected)
  }
  const f = projectionFixture(); f.eligibility.destinationLicense = "UNKNOWN"
  assert.equal(assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW")
  f.eligibility.destinationLicense = "PARTIAL"
  assert.equal(assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW")
})

test("ambiguous identity, unknown availability, UT-only evidence and mismatched IDs stay in review", () => {
  const mutations = [
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.identity = "AMBIGUOUS" },
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.gamePresence = "UNKNOWN" },
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.evidence = f.eligibility.evidence.map(e => e.role === "PLAYER_GAME_PRESENCE" ? { ...e, scope: "UT_ONLY" } : e) },
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.evidence = f.eligibility.evidence.map(e => e.role === "PLAYER_GAME_PRESENCE" ? { ...e, eaId: "999999" } : e) },
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.policyHash = "0".repeat(64) },
    (f: ReturnType<typeof projectionFixture>) => { f.eligibility.destinationInGame = false },
  ]
  for (const mutate of mutations) { const f = projectionFixture(); mutate(f); assert.equal(assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf).status, "REVIEW") }
})

test("stale real facts or mutated source snapshot cannot retain an approved projection", () => {
  const f = prepared(); f.candidate.jointTransfer.real!.club = city
  assert.throws(() => validateJointTransferPayload(f.candidate))
  const g = prepared(); g.candidate.game.evidenceHash = "f".repeat(64)
  assert.throws(() => validateJointTransferPayload(g.candidate), /PROJECTION_INVALID/)
})

test("definitive transfers are projected without a loan or parent; principal economic data are outside the patch", () => {
  const f = projectionFixture(); f.candidate.jointTransfer.real!.loan = null; f.candidate.jointTransfer.real!.parentClub = null
  f.movement = { ...f.movement, kind: "PERMANENT_TRANSFER", evidenceHash: f.candidate.real!.evidenceHash }
  f.candidate.jointTransfer.movements = [f.movement]
  f.candidate.jointTransfer.futscoutProjection = assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  const view = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED")
  assert.equal(view.game?.clubLabel, "Benfica"); assert.equal(view.game?.parentClub, null); assert.equal(view.game?.loanBadge, null)
  assert.equal(view.game?.mainContractEnd, null); assert.equal(f.candidate.jointTransfer.futscoutProjection.status, "READY")
})

test("loan end dates require verification and never cause an automatic return", () => {
  const f = projectionFixture(); f.candidate.jointTransfer.real!.loan = { ...f.candidate.jointTransfer.real!.loan!, endsAt: "2026-11-15" }
  const p = assessRealGameProjection(f.candidate, f.eligibility, f.movement, asOf)
  assert.equal(p.status, "REVIEW"); assert.equal(p.membership, null); assert.equal(p.realLoanRoute?.playingClub.name, "Benfica")
})

test("confirmed return and recall close the actual episode and prepare both contexts without changing the source squad", () => {
  for (const kind of ["LOAN_RETURN_CONFIRMED", "LOAN_RECALL_CONFIRMED"] as const) {
    const original = prepared().candidate, f = projectionFixture()
    const closed = { ...f.candidate.jointTransfer.real!.loan!, state: "RETURN_CONFIRMED" as const, endsAt: "2026-11-15" }
    f.candidate.jointTransfer.real = { ...f.candidate.jointTransfer.real!, club: city, parentClub: null, loan: null }
    f.candidate.real = { ...f.candidate.real!, club: { eaId: city.eaId, name: city.name }, sourceUrl: "https://example.invalid/return", evidenceHash: "f".repeat(64) }
    f.candidate.jointTransfer.history = [closed]
    f.movement = { ...f.movement, kind, sourceUrl: f.candidate.real.sourceUrl, evidenceHash: f.candidate.real.evidenceHash }
    f.candidate.jointTransfer.movements = [f.movement]
    f.eligibility.destinationClubId = city.id; f.eligibility.originClubId = null
    f.eligibility.evidence = f.eligibility.evidence.map(e => e.role === "DESTINATION_SQUAD_LICENSE" ? { ...e, clubId: city.id } : e)
    const batch = prepareJointRealGameSync({ before: [original], updates: [f], expectedBeforeHash: jointHash([original]), asOf, unverifiedRealEaIds: [] })
    assert.equal(batch.jointReady, 1)
    const views = jointTransferViews(batch.updates[0].payload, asOf, "FUTSCOUT_PROJECTED")
    assert.equal(views.game?.clubLabel, "Manchester City"); assert.equal(views.real?.clubLabel, "Manchester City"); assert.equal(views.game?.loanBadge, null)
    assert.deepEqual(batch.updates[0].payload.game, original.game)
  }
})

test("batch preparation isolates pending cases and is idempotent even when the evaluation day changes", () => {
  const f = projectionFixture(), first = prepareJointRealGameSync({ before: [], updates: [f], expectedBeforeHash: jointHash([]), asOf, unverifiedRealEaIds: [] })
  const before = [first.updates[0].payload]
  const replay = prepareJointRealGameSync({ before, updates: [f], expectedBeforeHash: jointHash(before), asOf: "2026-11-17", unverifiedRealEaIds: [] })
  assert.equal(replay.jointReady, 0)
  const pending = prepareJointRealGameSync({ before: [], updates: [f], expectedBeforeHash: jointHash([]), asOf, unverifiedRealEaIds: [f.candidate.eaPlayerId] })
  assert.equal(pending.jointReady, 0); assert.equal(pending.reviewCount, 1)
  const malformed = projectionFixture("999999")
  malformed.candidate.jointTransfer.real!.loan = { ...malformed.candidate.jointTransfer.real!.loan!, endsAt: "2026-02-30" }
  const isolated = prepareJointRealGameSync({ before: [], updates: [f, malformed], expectedBeforeHash: jointHash([]), asOf, unverifiedRealEaIds: [] })
  assert.equal(isolated.jointReady, 1); assert.equal(isolated.reviewCount, 1)
})

test("projected activation requires both contexts, exact approved policy and separate default-off projection gate", () => {
  const f = prepared(), env = projectionEnv(f.candidate)
  assert(jointReadManifest(env)); assert.equal(jointReadManifest({ ...env, JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "0" }), null)
  assert.equal(jointReadManifest({ ...env, JOINT_REAL_GAME_POLICY_SHA256: "f".repeat(64) }), null)
  const manifest = JSON.parse(env.JOINT_TRANSFER_READ_MANIFEST); manifest.entries[0].contexts = ["REAL"]
  assert.equal(jointReadManifest({ ...env, JOINT_TRANSFER_READ_MANIFEST: JSON.stringify(manifest), JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(manifest) }), null)
})

test("GAME searches/current and origin filters use the projection while the historical snapshot remains City", () => {
  const p = prepared().candidate, filter = jointCatalogFilter([p], { membershipContext: "GAME", currentClub: benfica.id, parentClub: city.id, search: "Benfica" }, undefined, new Set([p.eaPlayerId]))
  assert(filter.sql.values.includes(p.eaPlayerId)); assert.equal(selectedGameMembership(p, true).club?.id, benfica.id)
  assert.equal(selectedGameMembership(p, false).club?.id, city.id)
})

test("actual cards and profiles label FutScout projection and keep the EA snapshot accessible", () => {
  const f = prepared(), views = jointTransferViews(f.candidate, asOf, "FUTSCOUT_PROJECTED"), player = { ...mapDatabasePlayer(catalogPlayer({ name: "Claudio Echeverri" })), transferContexts: views }
  const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", { "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency } })
  const card = renderToStaticMarkup(createElement(Card, { ...player, club: null }))
  assert.match(card, /Benfica/); assert.match(card, /Emprestado pelo Manchester City/); assert.match(card, /Elenco atualizado pelo FutScout/)
  const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", { "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference: () => null } })
  const html = renderToStaticMarkup(createElement(Header, { player }))
  assert.match(html, /Snapshot EA original/); assert.match(html, /Manchester City/); assert.match(html, /Benfica/)
  assert.match(html, /Projeção FutScout/)
})

test("joint operator preparation rejects pending pairs and retains a single atomic revision for REAL and GAME", () => {
  const f = prepared(), item = { payload: f.candidate, expectedSelection: null, expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: fixtureDate }
  assert(prepareJointRealGameCommit([item], "synthetic-pair").batchHash)
  f.candidate.jointTransfer.futscoutProjection!.eligibility.gamePresence = "UNKNOWN"
  assert.throws(() => prepareJointRealGameCommit([item], "synthetic-pair"))
  assert.equal(confirmedRealChange(undefined, f.candidate, { ...f.movement, evidenceConfirmed: false }).kind, "REVIEW")
})
