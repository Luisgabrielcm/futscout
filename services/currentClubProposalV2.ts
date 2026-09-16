import { transferEvidenceHash } from "../lib/transferHistory"
import type { ConfirmedTransferPlayer } from "../types/currentClub"
import type { CurrentClubAggregate, CurrentClubProposal, ProposalStatus } from "../types/currentClubV2"
import type { TransferObservationResult } from "../types/transferObservation"
import { evaluateTransferHistory, type TransferBatchContext } from "./transferHistoryBatch"

export const PROPOSAL_REPLACEMENT_POLICY = "current-club-proposal-v2.1"
const active = (status: ProposalStatus) => ["PROPOSED", "REVIEW", "CONFLICT"].includes(status)

export function currentClubSnapshotHash(state: CurrentClubAggregate) {
  return transferEvidenceHash({ ...state, proposals: [...state.proposals].sort((a, b) => a.revision - b.revision) })
}

// Pure V2 boundary: approved authority is explicit, never inherited from EA or caller hints.
// Existing Phase E/legacy code remains disconnected from this preparation.
export function planCurrentClubProposal(state: CurrentClubAggregate, player: ConfirmedTransferPlayer,
  observation: TransferObservationResult, context: TransferBatchContext, now: Date) {
  if (state.playerId !== player.playerId || (state.approved && state.approved.playerId !== player.playerId) ||
      state.proposals.some(p => p.playerId !== player.playerId || p.providerPlayerId !== player.providerPlayerId)) {
    throw new Error("CURRENT_CLUB_IDENTITY_CONFLICT")
  }
  if (!Number.isFinite(now.getTime()) || [...state.proposals.map(p => p.updatedAt), ...(state.approved ? [state.approved.updatedAt] : [])]
    .some(t => !Number.isFinite(Date.parse(t)) || Date.parse(t) > now.getTime())) throw new Error("STALE_PROPOSAL_CLOCK")
  const evaluation = evaluateTransferHistory({ ...player, realLifeTeamId: state.approved?.approvedProviderTeamId ?? null }, observation, context, now)
  const e = evaluation.decision
  const observationHashes = evaluation.historyPlan.append.map(r => r.contentHash).sort()
  const baseApprovedVersion = state.approved?.version ?? 0
  // Evaluation timestamps participate in evidenceHash; only an identical evaluation is a NO-OP.
  const duplicate = state.proposals.find(p => p.evidenceHash === e.evidenceHash && p.baseApprovedVersion === baseApprovedVersion &&
    transferEvidenceHash(p.observationHashes) === transferEvidenceHash(observationHashes))
  if (duplicate) return { kind: "NO_OP" as const, state: structuredClone(state), proposal: structuredClone(duplicate), evaluation }
  let status: ProposalStatus = e.decision === "CONFLICT" ? "CONFLICT" :
    e.evidenceState === "CORROBORATED" && e.currentClubCandidate && e.effectiveSince && !e.warnings.length &&
    !e.contradictingEvidence.length && !evaluation.historyPlan.append.some(r => r.possibleRevisionHashes.length) ? "PROPOSED" : "REVIEW"
  let statusReason = e.reason
  const previous = state.proposals.filter(p => active(p.status))
  // Only clean, strictly later chronology can supersede an unresolved proposal.
  const canSupersede = status === "PROPOSED" && previous.every(p =>
    p.effectiveSince !== null && e.effectiveSince! > p.effectiveSince && e.evaluatedAt > p.evaluatedAt)
  if (previous.length && !canSupersede) {
    const conflict = previous.some(p => p.effectiveSince === e.effectiveSince && p.proposedProviderTeamId !== e.currentClubCandidate?.providerTeamId)
    status = conflict || status === "CONFLICT" ? "CONFLICT" : "REVIEW"
    statusReason = conflict ? "SAME_DATE_DESTINATION_CONFLICT" : "PROPOSAL_REPLACEMENT_REQUIRES_REVIEW"
  }
  const revision = Math.max(0, ...state.proposals.map(p => p.revision)) + 1
  const id = "ccp_" + transferEvidenceHash({ playerId: player.playerId, revision, evidenceHash: e.evidenceHash, baseApprovedVersion })
  const proposal: CurrentClubProposal = { id, playerId: player.playerId, providerPlayerId: player.providerPlayerId,
    revision, version: 1, baseApprovedVersion, proposedClubId: e.currentClubCandidate?.clubId ?? null,
    proposedProviderTeamId: e.candidateTeamId ?? e.supportingEvidence.find(s => s.kind === "TRANSFER_EVENT")?.teamId ?? null,
    effectiveSince: e.effectiveSince, decision: e.decision, evidenceHash: e.evidenceHash, observationHashes,
    policyVersion: e.policyVersion, replacementPolicy: PROPOSAL_REPLACEMENT_POLICY, evidence: structuredClone(e),
    warnings: [...e.warnings], supportingEvidence: structuredClone(e.supportingEvidence), contradictingEvidence: structuredClone(e.contradictingEvidence),
    status, statusReason, evaluatedAt: e.evaluatedAt, createdAt: e.evaluatedAt, updatedAt: e.evaluatedAt,
    supersededById: null, sourceLegacyStateId: null }
  const proposals = state.proposals.map(p => canSupersede && active(p.status)
    ? { ...structuredClone(p), status: "SUPERSEDED" as const, statusReason: "STRICTLY_LATER_CORROBORATED_PROPOSAL", supersededById: id,
      version: p.version + 1, updatedAt: e.evaluatedAt }
    : structuredClone(p))
  // Preserve both conflicting/review candidates, but block any older automatic candidate too.
  if (previous.length && !canSupersede) for (const p of proposals) if (p.status === "PROPOSED") {
    p.status = status === "CONFLICT" ? "CONFLICT" : "REVIEW"
    p.statusReason = "NEW_EVIDENCE_REQUIRES_REVIEW"; p.version++; p.updatedAt = e.evaluatedAt
  }
  return { kind: "APPENDED" as const, state: { ...structuredClone(state), proposals: [...proposals, proposal] }, proposal, evaluation }
}

// Persistence port intentionally has no approved-state, Player, observation or Club write capability.
// Future Prisma adapter must supply a Serializable transaction and atomic whole-snapshot CAS.
export type ProposalStore = {
  transaction<T>(work: (tx: {
    read(playerId: string): Promise<CurrentClubAggregate>
    replaceProposals(playerId: string, expectedSnapshotHash: string, proposals: CurrentClubProposal[]): Promise<number>
  }) => Promise<T>): Promise<T>
}
export async function persistCurrentClubProposal(store: ProposalStore, expectedSnapshotHash: string,
  player: ConfirmedTransferPlayer, observation: TransferObservationResult, context: TransferBatchContext, now: Date) {
  return store.transaction(async tx => {
    const state = await tx.read(player.playerId)
    if (currentClubSnapshotHash(state) !== expectedSnapshotHash) throw new Error("CONCURRENT_MODIFICATION")
    const plan = planCurrentClubProposal(state, player, observation, context, now)
    if (plan.kind !== "NO_OP" && await tx.replaceProposals(player.playerId, expectedSnapshotHash, plan.state.proposals) !== 1) {
      throw new Error("CONCURRENT_MODIFICATION")
    }
    if (currentClubSnapshotHash(await tx.read(player.playerId)) !== currentClubSnapshotHash(plan.state)) {
      throw new Error("PROPOSAL_READ_BACK_MISMATCH")
    }
    return plan
  })
}
