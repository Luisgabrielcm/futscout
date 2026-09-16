import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { auditedObservation, auditedPlayers, auditedTransfers } from "../../fixtures/auditedTransfers"
import { currentClubSnapshotHash, persistCurrentClubProposal, planCurrentClubProposal, type ProposalStore } from "../../../services/currentClubProposalV2"
import { getPlayerEaClub, getPlayerRealCurrentClub, proposalFactsHash, rejectCurrentClubProposal, simulateCurrentClubPromotion, type PromotionExpectation } from "../../../lib/currentClubModelV2"
import type { ApprovedCurrentClub, CurrentClubAggregate } from "../../../types/currentClubV2"

const now = new Date(auditedTransfers.now)
const context = () => structuredClone({ clubs: auditedTransfers.clubs, rosters: auditedTransfers.rosters, lineups: auditedTransfers.lineups })
const player = auditedPlayers.find(p => p.providerPlayerId === 44)!
const empty = (playerId = player.playerId): CurrentClubAggregate => ({ playerId, approved: null, proposals: [] })
const initialApproved = (): ApprovedCurrentClub => ({ playerId: player.playerId, approvedClubId: "real-A", approvedProviderTeamId: 999,
  effectiveSince: "2026-01-01", evidenceHash: "fixture-previous-proof", approvedAt: "2026-01-02T00:00:00Z", source: "fixture-authorized",
  decision: "CURRENT_CLUB_CONFIRMED", metadata: {}, version: 1, createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", sourceProposalId: "fixture-A" })
function proposedB(approved: ApprovedCurrentClub | null = initialApproved()) {
  return planCurrentClubProposal({ ...empty(), approved }, player, auditedObservation(44), context(), now).state
}
function expected(s: CurrentClubAggregate): PromotionExpectation {
  const p = s.proposals.at(-1)!
  return { snapshotHash: currentClubSnapshotHash(s), proposalId: p.id, proposalVersion: p.version, playerId: s.playerId,
    providerPlayerId: p.providerPlayerId, destinationClubId: p.proposedClubId!, destinationProviderTeamId: p.proposedProviderTeamId!,
    evidenceHash: p.evidenceHash, approvedVersion: s.approved?.version ?? 0, approvedClubId: s.approved?.approvedClubId ?? null, proposalUpdatedAt: p.updatedAt }
}
function nextProposal(state: CurrentClubAggregate, date = "2026-09-16", destination = 541) {
  const clock = new Date("2026-09-16T23:10:00Z"), c = context(), observation = auditedObservation(44)
  observation.transfers.push({ ...observation.transfers.at(-1)!, dateRaw: date, transferDate: date,
    fromProviderTeamId: 529, toProviderTeamId: destination, toTeamNameRaw: "Next club", sourceIndex: 3, sourceOrder: 3 })
  c.rosters = c.rosters.filter(r => r.teamId !== 529)
  c.rosters.find(r => r.teamId === destination)!.playerIds.push(44)
  const roster = c.rosters.find(r => r.teamId === destination)!
  roster.fetchedAt = "2026-09-16T20:00:00Z"; roster.expiresAt = "2026-09-23T20:00:00Z"
  return planCurrentClubProposal(state, player, observation, c, clock)
}

test("model simultaneously represents EA X, approved A, pending B without mutating inputs", () => {
  const before = { ...empty(), approved: initialApproved() }, frozen = structuredClone(before), ea = player.eaClubId
  const plan = planCurrentClubProposal(before, player, auditedObservation(44), context(), now)
  assert.deepEqual(before, frozen); assert.equal(player.eaClubId, ea)
  assert.equal(plan.state.approved?.approvedClubId, "real-A")
  assert.equal(plan.proposal.proposedProviderTeamId, 529); assert.equal(plan.proposal.status, "PROPOSED")
  assert.equal(plan.proposal.baseApprovedVersion, 1)
})
test("simulation promotes B atomically, keeps EA X, repeats as no-op with identical timestamps/history", () => {
  const s = proposedB(), e = expected(s), before = structuredClone(s), ea = player.eaClubId
  const r = simulateCurrentClubPromotion(s, e, now)
  assert.equal(r.result, "PROMOTED"); assert.deepEqual(s, before); assert.equal(player.eaClubId, ea)
  assert.equal(r.state.approved?.approvedProviderTeamId, 529); assert.equal(r.state.proposals[0].status, "APPROVED")
  assert.equal(r.state.approved?.version, 2); assert.equal(r.state.approved?.sourceProposalId, s.proposals[0].id)
  const repeat = simulateCurrentClubPromotion(r.state, e, new Date(now.getTime() + 5000))
  assert.equal(repeat.result, "ALREADY_CURRENT"); assert.deepEqual(repeat.state, r.state)
})
test("approved B survives new C and subsequent rejection; proposal history preserved", () => {
  const s = proposedB(), approvedB = simulateCurrentClubPromotion(s, expected(s), now).state
  const c = nextProposal(approvedB)
  assert.equal(c.proposal.status, "PROPOSED"); assert.equal(c.proposal.proposedProviderTeamId, 541)
  assert.deepEqual(c.state.approved, approvedB.approved); assert.equal(c.state.proposals[0].status, "APPROVED")
  const rejected = rejectCurrentClubProposal(c.state, c.proposal.id, currentClubSnapshotHash(c.state), new Date(c.proposal.updatedAt))
  assert.equal(rejected.proposals[1].status, "REJECTED"); assert.deepEqual(rejected.approved, approvedB.approved)
})
test("strictly later corroborated proposal supersedes B, preserving its immutable evidence and approved A", () => {
  const s = proposedB(), facts = proposalFactsHash(s.proposals[0]), c = nextProposal(s)
  assert.equal(c.proposal.status, "PROPOSED"); assert.equal(c.state.proposals[0].status, "SUPERSEDED")
  assert.equal(c.state.proposals[0].supersededById, c.proposal.id)
  assert.equal(proposalFactsHash(c.state.proposals[0]), facts); assert.deepEqual(c.state.approved, s.approved)
})
test("same date different destination records conflict and blocks both automatic proposals", () => {
  const s = proposedB(), c = nextProposal(s, "2026-08-17")
  assert.equal(c.proposal.status, "CONFLICT"); assert.equal(c.state.proposals[0].status, "CONFLICT")
  assert.deepEqual(c.state.approved, s.approved)
  assert.throws(() => simulateCurrentClubPromotion(c.state, expected(c.state), new Date(c.proposal.updatedAt)), /REVIEW/)
})
test("later evaluation without strictly later event is REVIEW, not silent overwrite", () => {
  const s = proposedB(), c = planCurrentClubProposal(s, player, auditedObservation(44), context(), new Date(now.getTime() + 1000))
  assert.equal(c.proposal.status, "REVIEW"); assert.equal(c.state.proposals[0].status, "REVIEW")
  assert.deepEqual(c.state.approved, s.approved)
})
test("exact evaluation is no-op and never reopens terminal rejected proposal", () => {
  const s = proposedB(), p = s.proposals[0], rejected = rejectCurrentClubProposal(s, p.id, currentClubSnapshotHash(s), now)
  const repeat = planCurrentClubProposal(rejected, player, auditedObservation(44), context(), now)
  assert.equal(repeat.kind, "NO_OP"); assert.deepEqual(repeat.state, rejected)
})
test("unknown real club is null, never inferred from caller realLifeTeamId or EA", () => {
  const r = planCurrentClubProposal(empty(), { ...player, realLifeTeamId: 529 }, auditedObservation(44), context(), now)
  assert.equal(r.state.approved, null); assert.equal(r.proposal.baseApprovedVersion, 0)
  assert.equal(r.evaluation.decision.decision, "TRANSFER_CANDIDATE")
})
for (const id of [44, 1145, 47380, 636, 306, 5996]) test(`audited fixture ${id}: proposal never creates approved state or changes observation facts`, () => {
  const p = auditedPlayers.find(p => p.providerPlayerId === id)!, observation = auditedObservation(id), before = structuredClone(observation)
  const r = planCurrentClubProposal(empty(p.playerId), p, observation, context(), now)
  assert.equal(r.state.approved, null); assert.deepEqual(observation, before)
  assert.equal(r.proposal.status, [306, 5996].includes(id) ? "REVIEW" : "PROPOSED")
  assert.equal(r.proposal.observationHashes.length, observation.transfers.length)
  if (id === 306) { assert.equal(r.proposal.proposedClubId, null); assert.equal(r.proposal.proposedProviderTeamId, 998); assert.equal(r.proposal.decision, "TEAM_IDENTITY_UNRESOLVED") }
  if (id === 5996) { assert.ok(r.proposal.warnings.length); assert.ok(r.proposal.contradictingEvidence.length) }
  if (id === 47380) assert.equal(observation.transfers.at(-1)?.typeRaw, "€ 55M")
})
test("six fixtures preserve all 31 immutable observations and revision metadata", () => {
  let count = 0
  for (const p of auditedPlayers) {
    const r = planCurrentClubProposal(empty(p.playerId), p, auditedObservation(p.providerPlayerId), context(), now)
    count += r.evaluation.historyPlan.append.length
    if (p.providerPlayerId === 306) assert.ok(r.evaluation.historyPlan.append.some(r => r.possibleRevisionHashes.length))
  }
  assert.equal(count, 31)
})
for (const field of ["snapshotHash", "proposalId", "playerId", "destinationClubId", "evidenceHash", "proposalUpdatedAt", "approvedClubId"] as const) {
  test(`promotion simulation rejects changed ${field}`, () => {
    const s = proposedB(), e = expected(s); e[field] = "changed"
    assert.throws(() => simulateCurrentClubPromotion(s, e, now), /CONCURRENT_MODIFICATION/)
  })
}
for (const field of ["providerPlayerId", "destinationProviderTeamId", "proposalVersion", "approvedVersion"] as const) {
  test(`promotion simulation rejects changed ${field}`, () => {
    const s = proposedB(), e = expected(s); e[field]++
    assert.throws(() => simulateCurrentClubPromotion(s, e, now), /CONCURRENT_MODIFICATION/)
  })
}
test("future event stays non-promotable; changed approved state and stale clock rejected", () => {
  const s = proposedB(), e = expected(s); s.approved!.version++
  assert.throws(() => simulateCurrentClubPromotion(s, e, now), /CONCURRENT_MODIFICATION/)
  assert.throws(() => planCurrentClubProposal(s, player, auditedObservation(44), context(), new Date("2026-01-01")), /STALE/)
  const observation = auditedObservation(44); observation.transfers.at(-1)!.dateRaw = "2099-01-01"
  const r = planCurrentClubProposal(empty(), player, observation, context(), now)
  assert.notEqual(r.proposal.status, "PROPOSED")
})
test("real helper never displays candidate as approved; EA fallback must be explicit and labeled", () => {
  const ea = { id: "X", name: "EA X", slug: "x" }, real = { id: "real-A", name: "Real A", slug: "a" }
  assert.equal(getPlayerEaClub(ea), ea)
  assert.deepEqual(getPlayerRealCurrentClub(null, [real], ea), { club: null, source: "UNKNOWN", isFallback: false })
  assert.deepEqual(getPlayerRealCurrentClub(null, [real], ea, "EA_CATALOG_LABELED"), { club: ea, source: "EA_CATALOG_FALLBACK", isFallback: true })
  assert.deepEqual(getPlayerRealCurrentClub(initialApproved(), [real], ea), { club: real, source: "APPROVED_REAL", isFallback: false })
  assert.equal(getPlayerRealCurrentClub(initialApproved(), [], ea, "EA_CATALOG_LABELED").club, null)
})

function fakeStore(options: { zero?: boolean; fail?: boolean } = {}) {
  let state = { ...empty(), approved: initialApproved() }, writes = 0
  const store: ProposalStore = { async transaction(work) {
    let draft = structuredClone(state)
    const result = await work({ read: async () => structuredClone(draft), replaceProposals: async (id, hash, proposals) => {
      assert.equal(id, draft.playerId); assert.equal(hash, currentClubSnapshotHash(draft)); writes++
      if (options.zero) return 0
      draft = { ...draft, proposals: structuredClone(proposals) }
      if (options.fail) throw new Error("FAKE_ROLLBACK")
      return 1
    } })
    state = draft; return result
  } }
  return { store, state: () => structuredClone(state), writes: () => writes }
}
test("proposal persistence port appends, is idempotent and has no approved-state write capability", async () => {
  const f = fakeStore(), before = f.state().approved
  const run = () => persistCurrentClubProposal(f.store, currentClubSnapshotHash(f.state()), player, auditedObservation(44), context(), now)
  await run(); const second = await run()
  assert.equal(second.kind, "NO_OP"); assert.equal(f.writes(), 1); assert.deepEqual(f.state().approved, before)
})
for (const options of [{ zero: true }, { fail: true }]) test(`proposal CAS rollback ${JSON.stringify(options)}`, async () => {
  const f = fakeStore(options), before = f.state()
  await assert.rejects(persistCurrentClubProposal(f.store, currentClubSnapshotHash(before), player, auditedObservation(44), context(), now))
  assert.deepEqual(f.state(), before); assert.equal(f.writes(), 1)
})
test("proposal persistence rejects concurrent approved/proposal changes before writing", async () => {
  const f = fakeStore()
  await assert.rejects(persistCurrentClubProposal(f.store, "old-hash", player, auditedObservation(44), context(), now), /CONCURRENT/)
  assert.equal(f.writes(), 0)
})
test("migration only creates V2 structures; legacy tables/triggers untouched and no data backfill", () => {
  const sql = readFileSync("prisma/migrations/20260917000000_current_club_model_v2/migration.sql", "utf8")
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|INSERT\s+INTO|UPDATE\s+\"|DELETE\s+FROM|RENAME)\b/i)
  assert.deepEqual([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]), ["PlayerCurrentClubProposal", "PlayerApprovedCurrentClub"])
  for (const m of sql.matchAll(/ALTER TABLE "([^"]+)"/g)) assert.ok(["PlayerCurrentClubProposal", "PlayerApprovedCurrentClub"].includes(m[1]))
  assert.match(sql, /FOREIGN KEY \("sourceProposalId", "playerId"\)/)
  const oldSql = readFileSync("prisma/migrations/20260916000000_transfer_observations_current_club/migration.sql", "utf8")
  assert.match(oldSql, /BEFORE UPDATE OR DELETE/); assert.match(oldSql, /BEFORE TRUNCATE/)
})
