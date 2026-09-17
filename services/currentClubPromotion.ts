import { isDeepStrictEqual } from "node:util"
import { simulateCurrentClubPromotion, type PromotionExpectation } from "../lib/currentClubModelV2"
import { transferEvidenceHash } from "../lib/transferHistory"
import type { ApprovedCurrentClub, CurrentClubAggregate, CurrentClubProposal } from "../types/currentClubV2"
import { currentClubSnapshotHash } from "./currentClubProposalV2"

export const CURRENT_CLUB_PROMOTION_ALLOWLIST = [
  { order: 1, playerId: "cmt954zui000y14ucsq41525y", playerName: "Rodri", providerPlayerId: 44,
    proposalId: "ccp_f603f15b034f4c5e5ad2836b5cc5c7b79f0b1840cefd0fa5a1c9549972caf75e",
    destinationClubId: "cmt94sq79001l5guc4g4zj7y3", destinationProviderTeamId: 529 },
  { order: 2, playerId: "cmt99dftr001qvsucoleqh6z0", playerName: "Ibrahima Konaté", providerPlayerId: 1145,
    proposalId: "ccp_88c098e686361c0006d25e7c50d93617cebdeac6b7d9c3f8073bb654051faffc",
    destinationClubId: "cmt7hnsah0004z0ucqy6yoeqz", destinationProviderTeamId: 541 },
  { order: 3, playerId: "cmt99m82g001hugucwa5q4qqz", playerName: "Marc Cucurella", providerPlayerId: 47380,
    proposalId: "ccp_83e9ab35b1c604aa85227f495eafe7427813d3e3fc56d06a1855101834c0a95c",
    destinationClubId: "cmt7hnsah0004z0ucqy6yoeqz", destinationProviderTeamId: 541 },
  { order: 4, playerId: "cmt99nkx9004euguczxq553wo", playerName: "Bernardo Silva", providerPlayerId: 636,
    proposalId: "ccp_309f7b14f76d4c5d1bd388c210807c4964e728e8b37c982f89915f58422a8ce4",
    destinationClubId: "cmt7hnsah0004z0ucqy6yoeqz", destinationProviderTeamId: 541 },
] as const

export const CURRENT_CLUB_PROMOTION_EXCLUDED = [
  { playerId: "cmt92ovep0002hwucv4tw8ioi", playerName: "Mohamed Salah" },
  { playerId: "cmt99mh4l0023ugucamjeah3u", playerName: "Enzo Fernández" },
] as const

export type CurrentClubPromotionObservation = Readonly<{
  playerId: string
  providerPlayerId: number
  contentHash: string
  toProviderTeamId: number | null
  transferDate: string | null
}>

export type CurrentClubPromotionSource = Readonly<{
  player: Readonly<{ id: string; name: string; providerPlayerId: number | null; eaClubId: string | null; updatedAt: string }>
  aggregate: CurrentClubAggregate
  destinationClubs: readonly Readonly<{ id: string; providerTeamId: number | null }>[]
  observations: readonly CurrentClubPromotionObservation[]
}>

export type CurrentClubPromotionAction = "AUTO_UPDATE_READY" | "REVIEW_REQUIRED" | "CONFLICT" |
  "ALREADY_CURRENT" | "STALE_EVIDENCE"

export type CurrentClubPromotionPlan = Readonly<{
  playerId: string
  playerName: string
  sourceHash: string
  action: CurrentClubPromotionAction
  reason: string
  proposal: CurrentClubProposal | null
  expectation: PromotionExpectation | null
  nextApproved: ApprovedCurrentClub | null
  nextProposal: CurrentClubProposal | null
}>

const iso = (value: string | null) => value === null || !Number.isFinite(Date.parse(value)) ? null : new Date(value).toISOString()
const sorted = (values: readonly string[]) => [...values].sort()
const active = (proposal: CurrentClubProposal) => ["PROPOSED", "REVIEW", "CONFLICT"].includes(proposal.status)

export function currentClubPromotionSourceHash(source: CurrentClubPromotionSource) {
  return transferEvidenceHash({
    player: source.player,
    aggregate: { ...source.aggregate, proposals: [...source.aggregate.proposals].sort((a, b) => a.revision - b.revision) },
    destinationClubs: [...source.destinationClubs].sort((a, b) => a.id.localeCompare(b.id)),
    observations: [...source.observations].sort((a, b) => a.contentHash.localeCompare(b.contentHash)),
  })
}

const result = (source: CurrentClubPromotionSource, action: CurrentClubPromotionAction, reason: string,
  proposal: CurrentClubProposal | null = null, expectation: PromotionExpectation | null = null,
  nextApproved: ApprovedCurrentClub | null = null, nextProposal: CurrentClubProposal | null = null): CurrentClubPromotionPlan => ({
  playerId: source.player.id, playerName: source.player.name, sourceHash: currentClubPromotionSourceHash(source),
  action, reason, proposal, expectation, nextApproved, nextProposal,
})

export function planCurrentClubPromotion(source: CurrentClubPromotionSource, now: Date): CurrentClubPromotionPlan {
  const { player, aggregate } = source
  if (aggregate.playerId !== player.id || aggregate.proposals.some(item => item.playerId !== player.id) ||
      (aggregate.approved !== null && aggregate.approved.playerId !== player.id)) {
    return result(source, "CONFLICT", "PLAYER_AGGREGATE_MISMATCH")
  }
  const proposals = aggregate.proposals.filter(item => item.providerPlayerId === player.providerPlayerId)
  const proposal = proposals.find(item => item.status === "PROPOSED") ?? proposals.find(item => item.status === "APPROVED") ??
    proposals.find(item => item.status === "REVIEW") ?? null
  if (!proposal || player.providerPlayerId === null || proposal.providerPlayerId !== player.providerPlayerId) {
    return result(source, "CONFLICT", "PLAYER_PROVIDER_IDENTITY_MISMATCH", proposal)
  }
  if (!["PROPOSED", "APPROVED"].includes(proposal.status)) {
    return result(source, "REVIEW_REQUIRED", "PROPOSAL_NOT_PROPOSED", proposal)
  }

  const allowed = CURRENT_CLUB_PROMOTION_ALLOWLIST.find(item => item.playerId === player.id)
  if (!allowed || allowed.playerName !== player.name || allowed.providerPlayerId !== player.providerPlayerId ||
      allowed.proposalId !== proposal.id || allowed.destinationClubId !== proposal.proposedClubId ||
      allowed.destinationProviderTeamId !== proposal.proposedProviderTeamId) {
    return result(source, "CONFLICT", "PILOT_ALLOWLIST_MISMATCH", proposal)
  }
  if (proposal.status === "APPROVED" && aggregate.approved?.sourceProposalId === proposal.id &&
      aggregate.approved.approvedClubId === proposal.proposedClubId &&
      aggregate.approved.approvedProviderTeamId === proposal.proposedProviderTeamId &&
      aggregate.approved.evidenceHash === proposal.evidenceHash) {
    return result(source, "ALREADY_CURRENT", "PROPOSAL_ALREADY_APPROVED", proposal)
  }
  if (proposal.status !== "PROPOSED") return result(source, "CONFLICT", "APPROVED_STATE_MISMATCH", proposal)
  const destination = source.destinationClubs.filter(item => item.id === proposal.proposedClubId)
  if (destination.length !== 1 || destination[0].providerTeamId !== proposal.proposedProviderTeamId) {
    return result(source, "CONFLICT", "DESTINATION_PROVIDER_IDENTITY_MISMATCH", proposal)
  }
  if (!Number.isFinite(now.getTime()) || iso(proposal.effectiveSince) === null || iso(proposal.evaluatedAt) === null ||
      Date.parse(proposal.effectiveSince!) > now.getTime() || Date.parse(proposal.evaluatedAt) > now.getTime()) {
    return result(source, "STALE_EVIDENCE", "PROMOTION_CLOCK_OR_EFFECTIVE_DATE_INVALID", proposal)
  }
  if (proposal.warnings.length || proposal.contradictingEvidence.length || proposal.evidence.warnings.length ||
      proposal.evidence.contradictingEvidence.length || proposal.evidence.evidenceState !== "CORROBORATED" ||
      proposal.evidence.currentClubCandidate?.clubId !== proposal.proposedClubId ||
      proposal.evidence.currentClubCandidate?.providerTeamId !== proposal.proposedProviderTeamId) {
    return result(source, "REVIEW_REQUIRED", "PROPOSAL_EVIDENCE_REQUIRES_REVIEW", proposal)
  }
  if (proposal.evidenceHash !== proposal.evidence.evidenceHash || proposal.decision !== proposal.evidence.decision ||
      iso(proposal.effectiveSince) !== iso(proposal.evidence.effectiveSince) ||
      !isDeepStrictEqual(proposal.warnings, proposal.evidence.warnings) ||
      !isDeepStrictEqual(proposal.supportingEvidence, proposal.evidence.supportingEvidence) ||
      !isDeepStrictEqual(proposal.contradictingEvidence, proposal.evidence.contradictingEvidence)) {
    return result(source, "STALE_EVIDENCE", "PROPOSAL_EVIDENCE_HASH_OR_FACTS_CHANGED", proposal)
  }
  const observationHashes = source.observations.map(item => item.contentHash)
  if (source.observations.some(item => item.playerId !== player.id || item.providerPlayerId !== player.providerPlayerId ||
      !/^[a-f0-9]{64}$/.test(item.contentHash)) || new Set(observationHashes).size !== observationHashes.length ||
      !isDeepStrictEqual(sorted(observationHashes), sorted(proposal.observationHashes))) {
    return result(source, "STALE_EVIDENCE", "TRANSFER_OBSERVATIONS_CHANGED", proposal)
  }
  if (!source.observations.some(item => item.toProviderTeamId === proposal.proposedProviderTeamId &&
      iso(item.transferDate)?.slice(0, 10) === iso(proposal.effectiveSince)?.slice(0, 10))) {
    return result(source, "STALE_EVIDENCE", "DESTINATION_OBSERVATION_MISSING", proposal)
  }
  if (aggregate.proposals.some(item => item.id !== proposal.id && active(item)) ||
      proposal.baseApprovedVersion !== (aggregate.approved?.version ?? 0)) {
    return result(source, "CONFLICT", "ACTIVE_PROPOSAL_OR_APPROVED_VERSION_CHANGED", proposal)
  }
  const expectation: PromotionExpectation = {
    snapshotHash: currentClubSnapshotHash(aggregate), proposalId: proposal.id, proposalVersion: proposal.version,
    playerId: player.id, providerPlayerId: player.providerPlayerId, destinationClubId: proposal.proposedClubId!,
    destinationProviderTeamId: proposal.proposedProviderTeamId!, evidenceHash: proposal.evidenceHash,
    approvedVersion: aggregate.approved?.version ?? 0, approvedClubId: aggregate.approved?.approvedClubId ?? null,
    proposalUpdatedAt: proposal.updatedAt,
  }
  try {
    const promoted = simulateCurrentClubPromotion(aggregate, expectation, now)
    const nextProposal = promoted.state.proposals.find(item => item.id === proposal.id)!
    return result(source, "AUTO_UPDATE_READY", "VALIDATED_FOR_EXPLICIT_PROMOTION", proposal, expectation,
      promoted.state.approved, nextProposal)
  } catch (error) {
    const reason = error instanceof Error && error.message === "CONCURRENT_MODIFICATION"
      ? "CONCURRENT_MODIFICATION" : "PROMOTION_REQUIRES_REVIEW"
    return result(source, reason === "CONCURRENT_MODIFICATION" ? "CONFLICT" : "REVIEW_REQUIRED", reason, proposal)
  }
}

export type CurrentClubPromotionAudit = Readonly<{
  protected: Readonly<Record<"Player" | "Club" | "PlayerTransferObservation" | "PlayerCurrentClubState" |
    "PlayerTransfer" | "BrandAssetIdentity" | "BrandAsset", Readonly<{ count: string; hash: string }>>>
  proposals: Readonly<{ count: string; hash: string }>
  approved: Readonly<{ count: string; hash: string }>
}>

export type CurrentClubPromotionStore = {
  audit(): Promise<CurrentClubPromotionAudit>
  read(playerId: string): Promise<CurrentClubPromotionSource>
  transaction<T>(work: (tx: {
    read(playerId: string): Promise<CurrentClubPromotionSource>
    promote(expected: PromotionExpectation, nextApproved: ApprovedCurrentClub, nextProposal: CurrentClubProposal): Promise<void>
  }) => Promise<T>): Promise<T>
}

export type CurrentClubPromotionWriteResult = Readonly<{
  playerId: string
  status: "PROMOTED" | "ALREADY_CURRENT" | "NOT_READY" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" |
    "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"
  action: CurrentClubPromotionAction
  writes: number
  retries: 0
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  reason: string
}>

const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null

export async function persistCurrentClubPromotion(store: CurrentClubPromotionStore, playerId: string,
  expectedSourceHash: string, now: Date): Promise<CurrentClubPromotionWriteResult> {
  const before = await store.audit()
  let callbackReturned = false
  let action: CurrentClubPromotionAction = "CONFLICT"
  try {
    const committed = await store.transaction(async tx => {
      const source = await tx.read(playerId)
      const plan = planCurrentClubPromotion(source, now)
      action = plan.action
      if (plan.sourceHash !== expectedSourceHash) throw new Error("CONCURRENT_MODIFICATION")
      if (plan.action === "ALREADY_CURRENT") { callbackReturned = true; return { writes: 0, approvedCountDelta: 0 } }
      if (plan.action !== "AUTO_UPDATE_READY" || !plan.expectation || !plan.nextApproved || !plan.nextProposal) {
        throw new Error("PROMOTION_NOT_READY")
      }
      await tx.promote(plan.expectation, plan.nextApproved, plan.nextProposal)
      const readBack = planCurrentClubPromotion(await tx.read(playerId), now)
      if (readBack.action !== "ALREADY_CURRENT") throw new Error("PROMOTION_READ_BACK_MISMATCH")
      callbackReturned = true
      return { writes: 1, approvedCountDelta: plan.expectation.approvedVersion === 0 ? 1 : 0 }
    })
    let after: CurrentClubPromotionAudit
    try { after = await store.audit() } catch {
      return { playerId, status: "AUDIT_MISMATCH", action, writes: committed.writes, retries: 0,
        transactionState: "COMMIT_CONFIRMED", reason: "AFTER_AUDIT_FAILED" }
    }
    if (!isDeepStrictEqual(before.protected, after.protected) ||
        Number(after.approved.count) - Number(before.approved.count) !== committed.approvedCountDelta ||
        Number(after.proposals.count) !== Number(before.proposals.count)) {
      return { playerId, status: "AUDIT_MISMATCH", action, writes: committed.writes, retries: 0,
        transactionState: "COMMIT_CONFIRMED", reason: "AFTER_AUDIT_MISMATCH" }
    }
    return { playerId, status: committed.writes ? "PROMOTED" : "ALREADY_CURRENT", action,
      writes: committed.writes, retries: 0, transactionState: "COMMIT_CONFIRMED",
      reason: committed.writes ? "PROMOTION_COMMITTED" : "IDEMPOTENT_NO_OP" }
  } catch (error) {
    const code = errorCode(error)
    const concurrent = ["P2002", "P2034", "23505", "40001", "40P01"].includes(code ?? "") ||
      (error instanceof Error && error.message === "CONCURRENT_MODIFICATION")
    if (callbackReturned && !concurrent) return { playerId, status: "INDETERMINATE_COMMIT", action, writes: 0, retries: 0,
      transactionState: "COMMIT_INDETERMINATE", reason: "COMMIT_ACKNOWLEDGEMENT_UNKNOWN" }
    if (concurrent) return { playerId, status: "CONCURRENT_MODIFICATION", action, writes: 0, retries: 0,
      transactionState: "ROLLED_BACK", reason: "CONCURRENT_MODIFICATION" }
    const notReady = error instanceof Error && error.message === "PROMOTION_NOT_READY"
    return { playerId, status: notReady ? "NOT_READY" : "ROLLED_BACK", action, writes: 0, retries: 0,
      transactionState: "ROLLED_BACK", reason: notReady ? "PROMOTION_NOT_READY" : "TRANSACTION_FAILED" }
  }
}

export type CurrentClubPromotionBatchRow = CurrentClubPromotionWriteResult | Readonly<{
  playerId: string; status: "NOT_STARTED"; action: "CONFLICT"; writes: 0; retries: 0
  transactionState: "NOT_STARTED"; reason: "EARLIER_PLAYER_STOPPED_BATCH"
}>

export async function persistCurrentClubPromotionBatch(store: CurrentClubPromotionStore,
  expectedSourceHashes: Readonly<Record<string, string>>, now: Date) {
  const rows: CurrentClubPromotionBatchRow[] = []
  let stopped = false
  for (const allowed of CURRENT_CLUB_PROMOTION_ALLOWLIST) {
    if (stopped) {
      rows.push({ playerId: allowed.playerId, status: "NOT_STARTED", action: "CONFLICT", writes: 0, retries: 0,
        transactionState: "NOT_STARTED", reason: "EARLIER_PLAYER_STOPPED_BATCH" })
      continue
    }
    const expected = expectedSourceHashes[allowed.playerId]
    if (!expected) {
      rows.push({ playerId: allowed.playerId, status: "NOT_STARTED", action: "CONFLICT", writes: 0, retries: 0,
        transactionState: "NOT_STARTED", reason: "EARLIER_PLAYER_STOPPED_BATCH" })
      stopped = true
      continue
    }
    const row = await persistCurrentClubPromotion(store, allowed.playerId, expected, now)
    rows.push(row)
    if (!["PROMOTED", "ALREADY_CURRENT"].includes(row.status)) stopped = true
  }
  return { rows, promoted: rows.filter(row => row.status === "PROMOTED").length,
    alreadyCurrent: rows.filter(row => row.status === "ALREADY_CURRENT").length,
    stopped: rows.some(row => row.status === "NOT_STARTED") }
}
