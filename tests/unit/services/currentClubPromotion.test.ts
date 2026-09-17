import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { transferEvidenceHash } from "../../../lib/transferHistory"
import { CURRENT_CLUB_PROMOTION_ALLOWLIST, currentClubPromotionSourceHash, persistCurrentClubPromotion,
  persistCurrentClubPromotionBatch, planCurrentClubPromotion, type CurrentClubPromotionAudit,
  type CurrentClubPromotionSource, type CurrentClubPromotionStore } from "../../../services/currentClubPromotion"
import type { ApprovedCurrentClub, CurrentClubProposal } from "../../../types/currentClubV2"
import type { PromotionExpectation } from "../../../lib/currentClubModelV2"

const clock = new Date("2026-09-17T12:00:00.000Z")
const eaClubs = ["ea-manchester-city", "ea-liverpool", "ea-chelsea", "ea-manchester-city"]
const effective = ["2026-08-17T00:00:00.000Z", "2026-06-30T00:00:00.000Z",
  "2026-07-01T00:00:00.000Z", "2026-06-30T00:00:00.000Z"]

function readySource(index: number): CurrentClubPromotionSource {
  const allowed = CURRENT_CLUB_PROMOTION_ALLOWLIST[index]
  const observationHash = String(index + 1).repeat(64)
  const evidenceHash = String(index + 5).repeat(64)
  const supportingEvidence = [{ source: "api-football" as const, kind: "TRANSFER_EVENT" as const,
    strength: "PRIMARY" as const, observedAt: "2026-09-16T14:53:33.276Z", effectiveAt: effective[index],
    teamId: allowed.destinationProviderTeamId, reference: observationHash }]
  const evidence = { decision: "TRANSFER_CANDIDATE" as const, reason: "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION",
    candidateTeamId: allowed.destinationProviderTeamId,
    currentClubCandidate: { clubId: allowed.destinationClubId, providerTeamId: allowed.destinationProviderTeamId },
    effectiveSince: effective[index], evidenceState: "CORROBORATED" as const, supportingEvidence,
    contradictingEvidence: [], warnings: [], policyVersion: "temporal-current-club-v2" as const,
    evidenceHash, evaluatedAt: "2026-09-16T14:53:33.276Z", writable: false as const }
  const proposal: CurrentClubProposal = {
    id: allowed.proposalId, playerId: allowed.playerId, providerPlayerId: allowed.providerPlayerId,
    revision: 1, version: 1, baseApprovedVersion: 0, proposedClubId: allowed.destinationClubId,
    proposedProviderTeamId: allowed.destinationProviderTeamId, effectiveSince: effective[index],
    decision: evidence.decision, evidenceHash, observationHashes: [observationHash], policyVersion: evidence.policyVersion,
    replacementPolicy: "current-club-v1-to-v2.1", evidence, warnings: [], supportingEvidence,
    contradictingEvidence: [], status: "PROPOSED", statusReason: evidence.reason,
    evaluatedAt: evidence.evaluatedAt, createdAt: evidence.evaluatedAt, updatedAt: evidence.evaluatedAt,
    supersededById: null, sourceLegacyStateId: allowed.playerId,
  }
  return {
    player: { id: allowed.playerId, name: allowed.playerName, providerPlayerId: allowed.providerPlayerId,
      eaClubId: eaClubs[index], updatedAt: "2026-09-04T00:00:00.000Z" },
    aggregate: { playerId: allowed.playerId, approved: null, proposals: [proposal] },
    destinationClubs: [{ id: allowed.destinationClubId, providerTeamId: allowed.destinationProviderTeamId }],
    observations: [{ playerId: allowed.playerId, providerPlayerId: allowed.providerPlayerId,
      contentHash: observationHash, toProviderTeamId: allowed.destinationProviderTeamId, transferDate: effective[index] }],
  }
}

function reviewSource(kind: "SALAH" | "ENZO"): CurrentClubPromotionSource {
  const base = readySource(kind === "SALAH" ? 0 : 3)
  const player = kind === "SALAH"
    ? { id: "cmt92ovep0002hwucv4tw8ioi", name: "Mohamed Salah", providerPlayerId: 306,
      eaClubId: "ea-liverpool", updatedAt: base.player.updatedAt }
    : { id: "cmt99mh4l0023ugucamjeah3u", name: "Enzo Fernández", providerPlayerId: 5996,
      eaClubId: "ea-chelsea", updatedAt: base.player.updatedAt }
  const proposal = structuredClone(base.aggregate.proposals[0])
  proposal.id = kind === "SALAH" ? "ccp_salah" : "ccp_enzo"
  proposal.playerId = player.id; proposal.providerPlayerId = player.providerPlayerId; proposal.status = "REVIEW"
  if (kind === "ENZO") { proposal.warnings = ["BLOCKING_WARNING"]; proposal.evidence.warnings = ["BLOCKING_WARNING"] }
  return { ...base, player, aggregate: { playerId: player.id, approved: null, proposals: [proposal] },
    observations: base.observations.map(row => ({ ...row, playerId: player.id, providerPlayerId: player.providerPlayerId })) }
}

const protectedAudit = {
  Player: { count: "16228", hash: "players" }, Club: { count: "582", hash: "clubs" },
  PlayerTransferObservation: { count: "31", hash: "observations" },
  PlayerCurrentClubState: { count: "6", hash: "states" }, PlayerTransfer: { count: "3", hash: "transfers" },
  BrandAssetIdentity: { count: "0", hash: "identities" }, BrandAsset: { count: "0", hash: "assets" },
} as const

function fakeStore(options: { failPlayerId?: string; commitErrorPlayerId?: string; concurrentPlayerId?: string } = {}) {
  let sources = new Map(CURRENT_CLUB_PROMOTION_ALLOWLIST.map((_, index) => {
    const source = readySource(index); return [source.player.id, source] as const
  }))
  let promoteCalls = 0
  const audit = (): CurrentClubPromotionAudit => {
    const values = [...sources.values()]
    return { protected: protectedAudit,
      proposals: { count: String(values.reduce((sum, row) => sum + row.aggregate.proposals.length, 0)),
        hash: transferEvidenceHash(values.map(row => row.aggregate.proposals)) },
      approved: { count: String(values.filter(row => row.aggregate.approved).length),
        hash: transferEvidenceHash(values.map(row => row.aggregate.approved)) } }
  }
  const store: CurrentClubPromotionStore = {
    async audit() { return audit() },
    async read(playerId) {
      const source = sources.get(playerId); if (!source) throw new Error("NOT_FOUND")
      return structuredClone(source)
    },
    async transaction(work) {
      const draft = new Map([...sources].map(([id, source]) => [id, structuredClone(source)]))
      const result = await work({
        async read(playerId) { const source = draft.get(playerId); if (!source) throw new Error("NOT_FOUND"); return structuredClone(source) },
        async promote(expected: PromotionExpectation, nextApproved: ApprovedCurrentClub, nextProposal: CurrentClubProposal) {
          promoteCalls++
          if (options.concurrentPlayerId === expected.playerId) throw Object.assign(new Error("SERIALIZATION"), { code: "P2034" })
          if (options.failPlayerId === expected.playerId) throw new Error("FAKE_ROLLBACK")
          const source = draft.get(expected.playerId); if (!source) throw new Error("NOT_FOUND")
          const proposals = source.aggregate.proposals.map(row => row.id === nextProposal.id ? structuredClone(nextProposal) : row)
          draft.set(expected.playerId, { ...source, aggregate: { ...source.aggregate,
            approved: structuredClone(nextApproved), proposals } })
        },
      })
      sources = draft
      if (options.commitErrorPlayerId && sources.get(options.commitErrorPlayerId)?.aggregate.approved) throw new Error("ACK_UNKNOWN")
      return result
    },
  }
  return { store, source: (id: string) => structuredClone(sources.get(id)!), promoteCalls: () => promoteCalls }
}

test("the four allow-listed proposals are AUTO_UPDATE_READY in deterministic order", () => {
  assert.deepEqual(CURRENT_CLUB_PROMOTION_ALLOWLIST.map(item => item.order), [1, 2, 3, 4])
  for (let index = 0; index < 4; index++) {
    const plan = planCurrentClubPromotion(readySource(index), clock)
    assert.equal(plan.action, "AUTO_UPDATE_READY"); assert.equal(plan.proposal?.id, CURRENT_CLUB_PROMOTION_ALLOWLIST[index].proposalId)
    assert.equal(plan.nextApproved?.approvedClubId, CURRENT_CLUB_PROMOTION_ALLOWLIST[index].destinationClubId)
    assert.equal(plan.nextProposal?.status, "APPROVED")
  }
})

test("Salah and Enzo remain REVIEW_REQUIRED and outside the write pilot", () => {
  for (const kind of ["SALAH", "ENZO"] as const) {
    const plan = planCurrentClubPromotion(reviewSource(kind), clock)
    assert.equal(plan.action, "REVIEW_REQUIRED"); assert.equal(plan.reason, "PROPOSAL_NOT_PROPOSED")
    assert.equal(plan.nextApproved, null)
  }
})

test("EA catalog club and Player timestamp are not changed by planning or persistence", async () => {
  const fake = fakeStore(), id = CURRENT_CLUB_PROMOTION_ALLOWLIST[0].playerId, before = fake.source(id).player
  const hash = currentClubPromotionSourceHash(fake.source(id))
  const result = await persistCurrentClubPromotion(fake.store, id, hash, clock)
  assert.equal(result.status, "PROMOTED"); assert.deepEqual(fake.source(id).player, before)
  assert.equal(fake.source(id).aggregate.approved?.approvedClubId, CURRENT_CLUB_PROMOTION_ALLOWLIST[0].destinationClubId)
})

test("approved state and proposal transition commit atomically and repeat as NO_OP", async () => {
  const fake = fakeStore(), id = CURRENT_CLUB_PROMOTION_ALLOWLIST[0].playerId
  const first = await persistCurrentClubPromotion(fake.store, id, currentClubPromotionSourceHash(fake.source(id)), clock)
  const afterFirst = fake.source(id), second = await persistCurrentClubPromotion(fake.store, id,
    currentClubPromotionSourceHash(afterFirst), new Date(clock.getTime() + 1000))
  assert.equal(first.status, "PROMOTED"); assert.equal(first.writes, 1)
  assert.equal(afterFirst.aggregate.proposals[0].status, "APPROVED"); assert.ok(afterFirst.aggregate.approved)
  assert.equal(second.status, "ALREADY_CURRENT"); assert.equal(second.writes, 0)
  assert.deepEqual(fake.source(id), afterFirst)
})

test("wrong destination, changed evidence, changed proposal and future effective date fail closed", () => {
  const source = readySource(0)
  const wrongDestination = { ...source,
    destinationClubs: source.destinationClubs.map(item => ({ ...item, providerTeamId: 541 })) }
  assert.equal(planCurrentClubPromotion(wrongDestination, clock).action, "CONFLICT")
  const evidenceProposal = structuredClone(source.aggregate.proposals[0])
  evidenceProposal.evidence = { ...evidenceProposal.evidence, evidenceHash: "f".repeat(64) }
  const changedEvidence = { ...source, aggregate: { ...source.aggregate, proposals: [evidenceProposal] } }
  assert.equal(planCurrentClubPromotion(changedEvidence, clock).action, "STALE_EVIDENCE")
  const changedProposal = { ...source, aggregate: { ...source.aggregate,
    proposals: [{ ...source.aggregate.proposals[0], status: "REVIEW" as const }] } }
  assert.equal(planCurrentClubPromotion(changedProposal, clock).action, "REVIEW_REQUIRED")
  const futureProposal = structuredClone(source.aggregate.proposals[0])
  futureProposal.effectiveSince = "2099-01-01T00:00:00.000Z"
  futureProposal.evidence = { ...futureProposal.evidence, effectiveSince: futureProposal.effectiveSince }
  const future = { ...source, aggregate: { ...source.aggregate, proposals: [futureProposal] } }
  assert.equal(planCurrentClubPromotion(future, clock).action, "STALE_EVIDENCE")
})

test("observation additions, removals, destination/date changes and player identity changes are stale or conflict", () => {
  const source = readySource(0)
  const added = { ...source, observations: [...source.observations,
    { ...source.observations[0], contentHash: "a".repeat(64) }] }
  assert.equal(planCurrentClubPromotion(added, clock).action, "STALE_EVIDENCE")
  const removed = { ...source, observations: [] }
  assert.equal(planCurrentClubPromotion(removed, clock).action, "STALE_EVIDENCE")
  const destination = { ...source,
    observations: source.observations.map(item => ({ ...item, toProviderTeamId: 541 })) }
  assert.equal(planCurrentClubPromotion(destination, clock).action, "STALE_EVIDENCE")
  const identity = { ...source, player: { ...source.player, providerPlayerId: 999 } }
  assert.equal(planCurrentClubPromotion(identity, clock).action, "CONFLICT")
})

test("ordinary failure rolls back both sides with zero retry", async () => {
  const id = CURRENT_CLUB_PROMOTION_ALLOWLIST[0].playerId, fake = fakeStore({ failPlayerId: id }), before = fake.source(id)
  const result = await persistCurrentClubPromotion(fake.store, id, currentClubPromotionSourceHash(before), clock)
  assert.equal(result.status, "ROLLED_BACK"); assert.equal(result.retries, 0); assert.deepEqual(fake.source(id), before)
})

test("serializable conflict is classified without retry", async () => {
  const id = CURRENT_CLUB_PROMOTION_ALLOWLIST[0].playerId, fake = fakeStore({ concurrentPlayerId: id })
  const result = await persistCurrentClubPromotion(fake.store, id, currentClubPromotionSourceHash(fake.source(id)), clock)
  assert.equal(result.status, "CONCURRENT_MODIFICATION"); assert.equal(result.retries, 0)
})

test("unknown acknowledgement after callback is commit indeterminate and stops", async () => {
  const id = CURRENT_CLUB_PROMOTION_ALLOWLIST[0].playerId, fake = fakeStore({ commitErrorPlayerId: id })
  const result = await persistCurrentClubPromotion(fake.store, id, currentClubPromotionSourceHash(fake.source(id)), clock)
  assert.equal(result.status, "INDETERMINATE_COMMIT"); assert.equal(result.transactionState, "COMMIT_INDETERMINATE")
})

for (const failureIndex of [0, 1, 3]) test(`batch failure at ${failureIndex + 1} preserves earlier commits and leaves later players NOT_STARTED`, async () => {
  const failedId = CURRENT_CLUB_PROMOTION_ALLOWLIST[failureIndex].playerId
  const fake = fakeStore({ failPlayerId: failedId })
  const hashes = Object.fromEntries(CURRENT_CLUB_PROMOTION_ALLOWLIST.map(item =>
    [item.playerId, currentClubPromotionSourceHash(fake.source(item.playerId))]))
  const result = await persistCurrentClubPromotionBatch(fake.store, hashes, clock)
  assert.equal(result.promoted, failureIndex)
  for (let index = 0; index < failureIndex; index++) assert.ok(fake.source(CURRENT_CLUB_PROMOTION_ALLOWLIST[index].playerId).aggregate.approved)
  assert.equal(result.rows[failureIndex].status, "ROLLED_BACK")
  for (let index = failureIndex + 1; index < 4; index++) assert.equal(result.rows[index].status, "NOT_STARTED")
})

test("partial resume treats previous commits as ALREADY_CURRENT and continues remaining order", async () => {
  const fake = fakeStore(), first = CURRENT_CLUB_PROMOTION_ALLOWLIST[0]
  await persistCurrentClubPromotion(fake.store, first.playerId, currentClubPromotionSourceHash(fake.source(first.playerId)), clock)
  const hashes = Object.fromEntries(CURRENT_CLUB_PROMOTION_ALLOWLIST.map(item =>
    [item.playerId, currentClubPromotionSourceHash(fake.source(item.playerId))]))
  const result = await persistCurrentClubPromotionBatch(fake.store, hashes, new Date(clock.getTime() + 1000))
  assert.equal(result.rows[0].status, "ALREADY_CURRENT"); assert.equal(result.promoted, 3); assert.equal(result.alreadyCurrent, 1)
  assert.equal(result.stopped, false)
})

test("Prisma adapter can mutate only approved state and proposal lifecycle inside Serializable transaction", () => {
  const adapter = readFileSync("services/prismaCurrentClubPromotionStore.ts", "utf8")
  assert.match(adapter, /isolationLevel:\s*"Serializable"/)
  assert.match(adapter, /playerApprovedCurrentClub\.(?:create|updateMany)/)
  assert.match(adapter, /playerCurrentClubProposal\.updateMany/)
  assert.doesNotMatch(adapter, /\.(?:player|club|playerTransferObservation|playerCurrentClubState|playerTransfer|brandAsset)\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/)
})

test("dry-run runner has no writer import, forbids HTTP and requires a clean pinned beta-next HEAD", () => {
  const runner = readFileSync("scripts/dryRunCurrentClubPromotion.ts", "utf8")
  assert.doesNotMatch(runner, /persistCurrentClubPromotion/)
  assert.match(runner, /HTTP_FORBIDDEN/); assert.match(runner, /--dry-run/); assert.match(runner, /beta-next/)
  assert.match(runner, /git\("status", "--porcelain"\)/)
})
