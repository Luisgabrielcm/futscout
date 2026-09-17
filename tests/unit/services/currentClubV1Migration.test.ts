import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { CURRENT_CLUB_V1_MIGRATION_ALLOWLIST, currentClubV1SnapshotHash, mapLegacyCurrentClubState,
  persistCurrentClubV1Migration, planCurrentClubV1Migration, type CurrentClubV1MigrationAudit,
  type CurrentClubV1MigrationSnapshot, type CurrentClubV1MigrationStore, type LegacyCurrentClubSource } from
  "../../../services/currentClubV1Migration"
import type { CurrentClubProposal } from "../../../types/currentClubV2"

const clubs = {
  529: "cmt94sq79001l5guc4g4zj7y3",
  541: "cmt7hnsah0004z0ucqy6yoeqz",
  50: "cmt94sibe001a5guc60z2rphl",
} as const
const destinations = [
  { team: 998, club: null, effective: null, decision: "TEAM_IDENTITY_UNRESOLVED", reason: "UNKNOWN_DESTINATION_TEAM",
    evidenceState: "REVIEW_REQUIRED", warning: false },
  { team: 529, club: clubs[529], effective: "2026-08-17", decision: "TRANSFER_CANDIDATE",
    reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", evidenceState: "CORROBORATED", warning: false },
  { team: 541, club: clubs[541], effective: "2026-06-30", decision: "TRANSFER_CANDIDATE",
    reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", evidenceState: "CORROBORATED", warning: false },
  { team: 541, club: clubs[541], effective: "2026-07-01", decision: "TRANSFER_CANDIDATE",
    reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", evidenceState: "CORROBORATED", warning: false },
  { team: 541, club: clubs[541], effective: "2026-06-30", decision: "TRANSFER_CANDIDATE",
    reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", evidenceState: "CORROBORATED", warning: false },
  { team: 50, club: clubs[50], effective: "2026-08-31", decision: "TRANSFER_CANDIDATE",
    reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", evidenceState: "CORROBORATED", warning: true },
] as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

function source(index: number): LegacyCurrentClubSource {
  const player = CURRENT_CLUB_V1_MIGRATION_ALLOWLIST[index], destination = destinations[index]
  const evaluatedAt = "2026-09-16T14:53:33.276Z", evidenceHash = hash(`evidence-${index}`)
  const warnings = destination.warning ? ["SEASONAL_ORIGIN_ROSTER_OUTWEIGHED_BY_LATER_LINEUP"] : []
  const contradiction = destination.warning ? [{ source: "api-football" as const, kind: "ROSTER_SEASON" as const,
    strength: "SEASONAL" as const, observedAt: evaluatedAt, effectiveAt: null, teamId: 49, reference: "49:2026" }] : []
  const evidence = { decision: destination.decision, reason: destination.reason, candidateTeamId: destination.club ? destination.team : null,
    currentClubCandidate: destination.club ? { clubId: destination.club, providerTeamId: destination.team } : null,
    effectiveSince: destination.effective, evidenceState: destination.evidenceState,
    supportingEvidence: [{ source: "api-football" as const, kind: "TRANSFER_EVENT" as const, strength: "PRIMARY" as const,
      observedAt: evaluatedAt, effectiveAt: destination.effective, teamId: destination.team, reference: hash(`transfer-${index}`) }],
    contradictingEvidence: contradiction, warnings, policyVersion: "temporal-current-club-v2" as const,
    evidenceHash, evaluatedAt, writable: false as const }
  return { player: { id: player.playerId, name: player.name, providerPlayerId: player.providerPlayerId },
    state: { playerId: player.playerId, clubId: destination.club, providerTeamId: destination.team,
      effectiveSince: destination.effective ? `${destination.effective}T00:00:00.000Z` : null,
      decision: destination.decision, evidenceHash, policyVersion: "temporal-current-club-v2", evidence,
      evaluatedAt, status: "PROPOSED" },
    observations: [{ playerId: player.playerId, providerPlayerId: player.providerPlayerId,
      contentHash: hash(`observation-${index}-a`), toProviderTeamId: destination.team,
      transferDate: destination.effective ? `${destination.effective}T00:00:00.000Z` : "2026-08-03T00:00:00.000Z" },
    { playerId: player.playerId, providerPlayerId: player.providerPlayerId,
      contentHash: hash(`observation-${index}-b`), toProviderTeamId: 1, transferDate: "2020-01-01T00:00:00.000Z" }] }
}

const snapshot = (proposals: CurrentClubProposal[] = []): CurrentClubV1MigrationSnapshot => ({
  sources: CURRENT_CLUB_V1_MIGRATION_ALLOWLIST.map((_, index) => source(index)), proposals, approvedCount: 0,
})

test("six legacy states map deterministically to four clean proposals and two reviews", () => {
  const plan = planCurrentClubV1Migration(snapshot())
  assert.deepEqual(plan.rows.map(row => [row.playerName, row.action, row.proposal?.status]), [
    ["Mohamed Salah", "REVIEW", "REVIEW"], ["Rodri", "CREATE", "PROPOSED"],
    ["Ibrahima Konaté", "CREATE", "PROPOSED"], ["Marc Cucurella", "CREATE", "PROPOSED"],
    ["Bernardo Silva", "CREATE", "PROPOSED"], ["Enzo Fernández", "REVIEW", "REVIEW"],
  ])
  assert.equal(plan.creates, 6); assert.equal(plan.reviews, 2); assert.equal(plan.blocked, 0); assert.equal(plan.conflicts, 0)
})

test("Salah retains provider team 998 without inventing a local Club", () => {
  const proposal = mapLegacyCurrentClubState(source(0))
  assert.equal(proposal.proposedProviderTeamId, 998); assert.equal(proposal.proposedClubId, null)
  assert.equal(proposal.status, "REVIEW"); assert.equal(proposal.decision, "TEAM_IDENTITY_UNRESOLVED")
  assert.equal(proposal.statusReason, "UNKNOWN_DESTINATION_TEAM")
})

test("Enzo retains warning and contrary evidence and cannot become PROPOSED", () => {
  const proposal = mapLegacyCurrentClubState(source(5))
  assert.equal(proposal.proposedProviderTeamId, 50); assert.equal(proposal.proposedClubId, clubs[50])
  assert.equal(proposal.status, "REVIEW"); assert.equal(proposal.warnings.length, 1)
  assert.equal(proposal.contradictingEvidence.length, 1)
})

test("mapping preserves identity, destination, evidence, observations and V1 timestamp", () => {
  for (let index = 0; index < 6; index++) {
    const input = source(index), proposal = mapLegacyCurrentClubState(input)
    assert.equal(proposal.playerId, input.player.id); assert.equal(proposal.providerPlayerId, input.player.providerPlayerId)
    assert.equal(proposal.sourceLegacyStateId, input.state.playerId); assert.equal(proposal.proposedClubId, input.state.clubId)
    assert.equal(proposal.proposedProviderTeamId, input.state.providerTeamId); assert.equal(proposal.evidenceHash, input.state.evidenceHash)
    assert.equal(proposal.evaluatedAt, input.state.evaluatedAt); assert.equal(proposal.createdAt, input.state.evaluatedAt)
    assert.deepEqual(proposal.observationHashes, input.observations.map(item => item.contentHash).sort())
  }
})

for (const scenario of ["evidence", "player", "destination", "observation"] as const) test(`${scenario} mismatch blocks mapping`, () => {
  const original = source(1)
  const input: LegacyCurrentClubSource = scenario === "evidence"
    ? { ...original, state: { ...original.state, evidenceHash: hash("different") } }
    : scenario === "player" ? { ...original, player: { ...original.player, providerPlayerId: 999 } }
      : scenario === "destination" ? { ...original, state: { ...original.state, providerTeamId: 541 } }
        : { ...original, observations: original.observations.map(item => ({ ...item, toProviderTeamId: 1 })) }
  assert.throws(() => mapLegacyCurrentClubState(input), /MISMATCH/)
})

test("closed cohort and empty ApprovedCurrentClub are mandatory", () => {
  const baseline = snapshot()
  const extra = { ...baseline, sources: [...baseline.sources, { ...source(0), player: { ...source(0).player, id: "outsider" } }] }
  assert.ok(planCurrentClubV1Migration(extra).rows.every(row => row.action === "BLOCKED"))
  const approved = { ...baseline, approvedCount: 1 }
  assert.ok(planCurrentClubV1Migration(approved).rows.every(row => row.action === "BLOCKED" && row.reason === "APPROVED_STATE_NOT_EMPTY"))
})

test("exact legacy proposal is a no-op; divergent duplicate is a conflict", () => {
  const proposals = snapshot().sources.map(mapLegacyCurrentClubState)
  const repeat = planCurrentClubV1Migration(snapshot(proposals))
  assert.equal(repeat.noOps, 6); assert.ok(repeat.rows.every(row => row.action === "NO_OP"))
  proposals[0] = { ...proposals[0], decision: "FORGED" }
  const conflict = planCurrentClubV1Migration(snapshot(proposals))
  assert.equal(conflict.rows[0].action, "CONFLICT"); assert.equal(conflict.rows[0].wouldCreate, false)
})

type FakeOptions = { failAt?: number; unknownCommit?: boolean; commitConflict?: boolean
  protectedDrift?: boolean; transactionDrift?: boolean }
function fakeStore(options: FakeOptions = {}) {
  let state = { sources: structuredClone(snapshot().sources) as LegacyCurrentClubSource[],
    proposals: [] as CurrentClubProposal[], approvedCount: 0 }, transactions = 0, creates = 0, audits = 0
  const protectedTables = { Player: { count: "16000", hash: "players" }, Club: { count: "582", hash: "clubs" },
    PlayerTransferObservation: { count: "31", hash: "observations" }, PlayerCurrentClubState: { count: "6", hash: "legacy" },
    PlayerApprovedCurrentClub: { count: "0", hash: "approved" }, PlayerTransfer: { count: "0", hash: "transfers" },
    BrandAssetIdentity: { count: "0", hash: "brand-identities" }, BrandAsset: { count: "0", hash: "brand-assets" } }
  const audit = (): CurrentClubV1MigrationAudit => {
    audits++
    const protectedState = structuredClone(protectedTables)
    if (options.protectedDrift && audits > 1) protectedState.Player.hash = "changed"
    return { protected: protectedState, proposals: { count: String(state.proposals.length), hash: hash(JSON.stringify(state.proposals)) } }
  }
  const store: CurrentClubV1MigrationStore = { audit: async () => audit(), read: async () => structuredClone(state),
    async transaction(work) {
      transactions++
      const draft = structuredClone(state)
      if (options.transactionDrift) draft.sources[0] = { ...draft.sources[0],
        state: { ...draft.sources[0].state, evidenceHash: hash("concurrent") } }
      const result = await work({ read: async () => structuredClone(draft), async create(proposal) {
        creates++
        if (options.failAt === creates) throw new Error("FAKE_INSERT_FAILURE")
        draft.proposals.push(structuredClone(proposal))
      } })
      if (options.commitConflict) throw Object.assign(new Error("serialization"), { code: "P2034" })
      state = draft
      if (options.unknownCommit) throw Object.assign(new Error("hidden transport failure"), { code: "ECONNRESET" })
      return result
    } }
  return { store, state: () => structuredClone(state), transactions: () => transactions, creates: () => creates }
}

test("future guarded write creates six atomically and second execution is idempotent", async () => {
  const fake = fakeStore(), plan = planCurrentClubV1Migration(await fake.store.read())
  const first = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(first.status, "CREATED"); assert.equal(first.created, 6); assert.equal(first.retries, 0)
  assert.equal(fake.state().proposals.length, 6); assert.equal(fake.state().approvedCount, 0); assert.equal(fake.state().sources.length, 6)
  const secondPlan = planCurrentClubV1Migration(await fake.store.read())
  const second = await persistCurrentClubV1Migration(fake.store, secondPlan.snapshotHash, secondPlan.summaryHash)
  assert.equal(second.status, "NO_OP"); assert.equal(second.created, 0); assert.equal(fake.state().proposals.length, 6)
})

test("insert failure rolls the entire six-player batch back with zero retry", async () => {
  const fake = fakeStore({ failAt: 3 }), before = fake.state(), plan = planCurrentClubV1Migration(before)
  const result = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(result.status, "ROLLED_BACK"); assert.equal(result.retries, 0); assert.deepEqual(fake.state(), before)
  assert.equal(fake.transactions(), 1); assert.equal(fake.creates(), 3)
})

test("CAS rejects concurrent source drift before any proposal is created", async () => {
  const fake = fakeStore({ transactionDrift: true }), plan = planCurrentClubV1Migration(await fake.store.read())
  const result = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(result.status, "STATE_MISMATCH"); assert.equal(result.transactionState, "ROLLED_BACK")
  assert.equal(fake.state().proposals.length, 0); assert.equal(fake.creates(), 0)
})

test("unknown commit acknowledgement is indeterminate and never retried", async () => {
  const fake = fakeStore({ unknownCommit: true }), plan = planCurrentClubV1Migration(await fake.store.read())
  const result = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(result.status, "INDETERMINATE_COMMIT"); assert.equal(result.transactionState, "COMMIT_INDETERMINATE")
  assert.equal(result.retries, 0); assert.equal(fake.transactions(), 1); assert.equal(fake.state().proposals.length, 6)
})

test("known Serializable commit conflict is a confirmed rollback, never indeterminate or retried", async () => {
  const fake = fakeStore({ commitConflict: true }), before = fake.state(), plan = planCurrentClubV1Migration(before)
  const result = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(result.status, "CONCURRENT_MODIFICATION"); assert.equal(result.transactionState, "ROLLED_BACK")
  assert.equal(result.retries, 0); assert.deepEqual(fake.state(), before); assert.equal(fake.transactions(), 1)
})

test("AFTER audit detects protected drift without claiming the confirmed proposal commit rolled back", async () => {
  const fake = fakeStore({ protectedDrift: true }), plan = planCurrentClubV1Migration(await fake.store.read())
  const result = await persistCurrentClubV1Migration(fake.store, plan.snapshotHash, plan.summaryHash)
  assert.equal(result.status, "AUDIT_MISMATCH"); assert.equal(result.transactionState, "COMMIT_CONFIRMED")
  assert.equal(fake.state().proposals.length, 6)
})

test("Prisma adapter can mutate only Proposal; Phase A runner is dry-run-only and blocks HTTP", () => {
  const adapter = readFileSync("services/prismaCurrentClubV1MigrationStore.ts", "utf8")
  assert.match(adapter, /isolationLevel:\s*"Serializable"/)
  assert.match(adapter, /playerCurrentClubProposal\.create/)
  assert.doesNotMatch(adapter, /\.(?:player|club|playerCurrentClubState|playerApprovedCurrentClub|playerTransferObservation|brandAsset)\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/)
  const runner = readFileSync("scripts/migrateCurrentClubV1ToV2.ts", "utf8")
  assert.match(runner, /--dry-run/); assert.doesNotMatch(runner, /--write/); assert.match(runner, /HTTP_FORBIDDEN/)
  assert.doesNotMatch(runner, /persistCurrentClubV1Migration/)
})

test("snapshot hash covers preserved V1, observations and ApprovedCurrentClub cardinality", () => {
  const baseline = snapshot(), initial = currentClubV1SnapshotHash(baseline)
  const changedState = { ...baseline, sources: baseline.sources.map((item, index) => index === 0
    ? { ...item, state: { ...item.state, decision: "CHANGED" } } : item) }
  const changedObservation = { ...baseline, sources: baseline.sources.map((item, index) => index === 0
    ? { ...item, observations: [{ ...item.observations[0], contentHash: hash("changed") }, ...item.observations.slice(1)] } : item) }
  const changedApproved = { ...structuredClone(baseline), approvedCount: 1 }
  assert.notEqual(currentClubV1SnapshotHash(changedState), initial)
  assert.notEqual(currentClubV1SnapshotHash(changedObservation), initial)
  assert.notEqual(currentClubV1SnapshotHash(changedApproved), initial)
  const reordered = { ...baseline, sources: [...baseline.sources].reverse().map(item => ({ ...item,
    observations: [...item.observations].reverse() })) }
  assert.equal(currentClubV1SnapshotHash(reordered), initial)
})
