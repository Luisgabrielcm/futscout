import assert from "node:assert/strict"
import test from "node:test"
import { auditedObservation, auditedPlayers, auditedTransfers } from "../../fixtures/auditedTransfers"
import { evaluateTransferHistory } from "../../../services/transferHistoryBatch"
import { evaluateCurrentClubEvidence } from "../../../services/currentClubEvidence"
import { reviewTransferTeamIdentity } from "../../../services/transferTeamIdentityReview"
import { separatePlayerClubDimensions, transferTimeline } from "../../../lib/currentClubPresentation"

const now = new Date(auditedTransfers.now)
const context = () => structuredClone({ clubs: auditedTransfers.clubs, rosters: auditedTransfers.rosters, lineups: auditedTransfers.lineups })
const player = (id: number) => auditedPlayers.find(p => p.providerPlayerId === id)!
for (const id of [44, 1145, 47380, 636]) test(`audited ${id}: positive transfer, exact destination and roster yield rich candidate, never writable`, () => {
  const r = evaluateTransferHistory(player(id), auditedObservation(id), context(), now)
  assert.equal(r.decision.decision, "TRANSFER_CANDIDATE")
  assert.equal(r.decision.evidenceState, "CORROBORATED"); assert.ok(r.decision.effectiveSince)
  assert.ok(r.decision.currentClubCandidate); assert.ok(r.decision.supportingEvidence.some(e => e.kind === "TRANSFER_EVENT"))
  assert.equal(r.decision.writable, false); assert.equal(r.proposedUpdate?.target, "PlayerCurrentClubState")
  assert.equal(r.proposedUpdate?.requiresSeparateAuthorization, true)
})
test("audited Salah: unknown 998 stays unresolved; same-name Club is not identity; revisions retained", () => {
  const r = evaluateTransferHistory(player(306), auditedObservation(306), context(), now)
  assert.equal(r.decision.decision, "TEAM_IDENTITY_UNRESOLVED"); assert.equal(r.proposedUpdate, null)
  assert.ok(r.reviews.some(r => r.kind === "TEAM_IDENTITY_REVIEW" && r.providerTeamId === 998))
  assert.ok(r.reviews.some(r => r.kind === "TRANSFER_REVISION_REVIEW"))
  assert.equal(r.events.length, 9); assert.equal(r.events[8].typeRaw, "Free agent")
})
test("generic future resolution + destination roster unlocks Salah without a production exception", () => {
  const c = context(); c.clubs.find(c => c.name === "Trabzonspor")!.apiFootballId = 998
  c.rosters.push({ ...c.rosters[0], teamId: 998, playerIds: [306] })
  const r = evaluateTransferHistory(player(306), auditedObservation(306), c, now)
  assert.equal(r.decision.decision, "TRANSFER_CANDIDATE"); assert.equal(r.decision.candidateTeamId, 998)
  assert.equal(r.events[8].typeRaw, "Free agent"); assert.equal("marketValue" in r.proposedUpdate!, false)
})
test("Enzo generic temporal policy retains Chelsea seasonal contradiction but later City lineup outweighs it", () => {
  const r = evaluateTransferHistory(player(5996), auditedObservation(5996), context(), now)
  assert.equal(r.decision.decision, "TRANSFER_CANDIDATE"); assert.equal(r.decision.candidateTeamId, 50)
  assert.ok(r.decision.warnings.includes("SEASONAL_ORIGIN_ROSTER_OUTWEIGHED_BY_LATER_LINEUP"))
  assert.ok(r.decision.contradictingEvidence.some(e => e.teamId === 49 && e.kind === "ROSTER_SEASON" && e.effectiveAt === null))
  assert.ok(r.decision.supportingEvidence.some(e => e.teamId === 50 && e.kind === "OFFICIAL_LINEUP"))
})
for (const when of [null, "2026-08-30T19:00:00Z", "2026-08-31T19:00:00Z"]) test(`Enzo without strictly later destination lineup (${when}) stays conflict`, () => {
  const c = context(); c.lineups = when ? [{ teamId: 50, fixtureDate: when, playerIds: [5996] }] : []
  assert.equal(evaluateTransferHistory(player(5996), auditedObservation(5996), c, now).decision.decision, "CONFLICT")
})
test("later contradictory lineup or third-club roster cannot be outweighed", () => {
  const c = context(); c.lineups.push({ teamId: 49, fixtureDate: "2026-09-12T19:00:00Z", playerIds: [5996] })
  assert.equal(evaluateTransferHistory(player(5996), auditedObservation(5996), c, now).decision.reason, "CONTEMPORANEOUS_LINEUP_DISAGREES")
  c.lineups.pop(); c.rosters.push({ ...c.rosters[0], teamId: 541, playerIds: [5996] })
  assert.equal(evaluateTransferHistory(player(5996), auditedObservation(5996), c, now).decision.reason, "CONTEMPORANEOUS_ROSTER_DISAGREES")
})
test("historical source lineup before transfer is not a contradiction; Bernardo needs no lineup", () => {
  const c = context(); c.lineups = [{ teamId: 50, fixtureDate: "2026-06-29T19:00:00Z", playerIds: [636] }]
  const r = evaluateTransferHistory(player(636), auditedObservation(636), c, now)
  assert.equal(r.decision.decision, "TRANSFER_CANDIDATE"); assert.deepEqual(r.decision.contradictingEvidence, [])
})
test("resolved event with later destination lineup can corroborate when no destination roster exists", () => {
  const c = context(); c.rosters = c.rosters.filter(r => r.teamId !== 529)
  assert.equal(evaluateTransferHistory(player(44), auditedObservation(44), c, now).decision.decision, "TRANSFER_CANDIDATE")
})
test("current real-life dimension can confirm B independently of EA A", () => {
  const r = evaluateTransferHistory({ ...player(44), realLifeTeamId: 529 }, auditedObservation(44), context(), now)
  assert.equal(r.decision.decision, "CURRENT_CLUB_CONFIRMED")
  assert.ok(r.decision.supportingEvidence.some(e => e.kind === "EA_CATALOG_CLUB" && e.teamId === 50))
  assert.ok(r.decision.supportingEvidence.some(e => e.kind === "LOCAL_CURRENT_CLUB" && e.teamId === 529))
})
test("dates and loan hints are recalculated from raw source, not a forged derived field", () => {
  const observation = auditedObservation(636); observation.transfers[3].transferDate = "2099-01-01"; observation.transfers[3].kindHint = "LOAN_HINT"
  assert.equal(evaluateTransferHistory(player(636), observation, context(), now).decision.decision, "TRANSFER_CANDIDATE")
  observation.transfers[3].dateRaw = "2099-01-01"
  assert.notEqual(evaluateTransferHistory(player(636), observation, context(), now).decision.candidateTeamId, 541)
})
test("team identity requires independently corroborated country/league/season, never name alone", () => {
  const source = { id: 998, name: "Trabzonspor", country: null as string | null, leagueId: null as number | null, season: null as number | null, firstTeamMen: true }
  const local = { id: "local", name: "Trabzonspor", apiFootballId: null, country: "Turkey", providerLeagueId: 203, season: 2026, firstTeamMen: true }
  assert.equal(reviewTransferTeamIdentity(source, [local], []).decision, "TEAM_IDENTITY_REVIEW")
  const corroborated = { ...source, country: "Turkey", leagueId: 203, season: 2026 }
  assert.equal(reviewTransferTeamIdentity(corroborated, [local], []).decision, "AUTO_MATCH_CANDIDATE")
  assert.equal(reviewTransferTeamIdentity(corroborated, [local], []).writable, false)
  assert.equal(reviewTransferTeamIdentity(corroborated, [local, { ...local, id: "other" }], []).decision, "TEAM_IDENTITY_REVIEW")
  assert.equal(reviewTransferTeamIdentity({ ...corroborated, firstTeamMen: false }, [local], []).decision, "TEAM_IDENTITY_REVIEW")
})
test("team provider ownership conflicts always block proposals", () => {
  const t = { id: 50, name: "City", country: null, leagueId: null, season: null, firstTeamMen: true }
  assert.equal(reviewTransferTeamIdentity(t, [], [{ id: "a", name: "A", apiFootballId: 50 }, { id: "b", name: "B", apiFootballId: 50 }]).decision, "CONFLICT")
})
for (const locale of ["pt", "en"] as const) test(`future ${locale} presentation links exact clubs, preserves unknown raw fallback and keeps proposal separate`, () => {
  const clubs = auditedTransfers.clubs.map(c => ({ ...c, slug: "club-" + c.id }))
  const timeline = transferTimeline(auditedObservation(306).transfers, clubs, locale)
  assert.equal(timeline[0].to.href, null); assert.equal(timeline[0].to.label, "Trabzonspor")
  assert.ok(timeline[0].from.href?.startsWith(`/${locale}/clubes/`)); assert.equal(timeline[0].typeRaw, "Free agent")
  const r = evaluateTransferHistory(player(44), auditedObservation(44), context(), now)
  const ea = clubs.find(c => c.apiFootballId === 50)!
  const dto = separatePlayerClubDimensions(ea, r.decision, clubs)
  assert.equal(dto.eaCatalogClub, ea); assert.equal(dto.realLifeClub, null); assert.ok(dto.proposedRealLifeClub)
})
test("invalid clock and unconfirmed identity never produce authority", () => {
  const input = { localPlayer: { providerPlayerId: 1, identityConfirmed: false, clubId: "a", localTeamId: 1 }, transferObservations: [], validRosters: [], officialLineups: [], resolvedTeams: [], now: new Date(NaN) }
  assert.equal(evaluateCurrentClubEvidence(input).decision, "INSUFFICIENT_EVIDENCE")
})
