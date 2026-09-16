import { transferEvidenceHash } from "./transferHistory"
import { currentClubSnapshotHash } from "../services/currentClubProposalV2"
import type { ApprovedCurrentClub, CurrentClubAggregate, CurrentClubProposal } from "../types/currentClubV2"

// Model simulation ONLY. Not a writer or authorization gate; cannot perform I/O.
export type PromotionExpectation = {
  snapshotHash: string; proposalId: string; proposalVersion: number; playerId: string; providerPlayerId: number
  destinationClubId: string; destinationProviderTeamId: number; evidenceHash: string
  approvedVersion: number; approvedClubId: string | null; proposalUpdatedAt: string
}
export function simulateCurrentClubPromotion(state: CurrentClubAggregate, expected: PromotionExpectation, now: Date) {
  const p = state.proposals.find(p => p.id === expected.proposalId)
  const identityMatches = p && state.playerId === expected.playerId && p.playerId === expected.playerId && p.providerPlayerId === expected.providerPlayerId &&
    p.proposedClubId === expected.destinationClubId && p.proposedProviderTeamId === expected.destinationProviderTeamId && p.evidenceHash === expected.evidenceHash
  if (!identityMatches) throw new Error("CONCURRENT_MODIFICATION")
  if (p.status === "APPROVED" && state.approved?.sourceProposalId === p.id && state.approved.evidenceHash === p.evidenceHash &&
      state.approved.approvedClubId === p.proposedClubId && state.approved.approvedProviderTeamId === p.proposedProviderTeamId) {
    return { result: "ALREADY_CURRENT" as const, state: structuredClone(state) }
  }
  if (currentClubSnapshotHash(state) !== expected.snapshotHash || p.version !== expected.proposalVersion || p.updatedAt !== expected.proposalUpdatedAt ||
      (state.approved?.version ?? 0) !== expected.approvedVersion || (state.approved?.approvedClubId ?? null) !== expected.approvedClubId ||
      p.baseApprovedVersion !== expected.approvedVersion) throw new Error("CONCURRENT_MODIFICATION")
  if (p.status !== "PROPOSED" || !p.effectiveSince || !Number.isFinite(now.getTime()) || Date.parse(p.evaluatedAt) > now.getTime() ||
      Date.parse(p.effectiveSince) > now.getTime() || !Number.isFinite(Date.parse(p.effectiveSince)) || p.warnings.length || p.contradictingEvidence.length ||
      state.proposals.some(other => other.id !== p.id && ["PROPOSED", "REVIEW", "CONFLICT"].includes(other.status))) throw new Error("PROMOTION_REQUIRES_REVIEW")
  const timestamp = now.toISOString()
  const approved: ApprovedCurrentClub = { playerId: p.playerId, approvedClubId: p.proposedClubId,
    approvedProviderTeamId: p.proposedProviderTeamId, effectiveSince: p.effectiveSince, evidenceHash: p.evidenceHash,
    approvedAt: timestamp, source: "futscout-current-club-policy", decision: p.decision,
    metadata: { previousApproved: structuredClone(state.approved), proposalRevision: p.revision },
    version: expected.approvedVersion + 1, createdAt: state.approved?.createdAt ?? timestamp, updatedAt: timestamp, sourceProposalId: p.id }
  return { result: "PROMOTED" as const, state: { ...structuredClone(state), approved,
    proposals: state.proposals.map(row => row.id === p.id ? { ...structuredClone(row), status: "APPROVED" as const,
      statusReason: "EXPLICIT_PROMOTION", updatedAt: timestamp, version: row.version + 1 } : structuredClone(row)) } }
}

export function rejectCurrentClubProposal(state: CurrentClubAggregate, id: string, snapshotHash: string, now: Date) {
  if (currentClubSnapshotHash(state) !== snapshotHash) throw new Error("CONCURRENT_MODIFICATION")
  const p = state.proposals.find(p => p.id === id)
  if (!p || !["PROPOSED", "REVIEW", "CONFLICT"].includes(p.status) || !Number.isFinite(now.getTime()) || now.getTime() < Date.parse(p.updatedAt)) {
    throw new Error("INVALID_PROPOSAL_TRANSITION")
  }
  return { ...structuredClone(state), proposals: state.proposals.map(row => row.id === id ? { ...structuredClone(row), status: "REJECTED" as const,
    statusReason: "EXPLICIT_REJECTION", version: row.version + 1, updatedAt: now.toISOString() } : structuredClone(row)) }
}

type ClubReference = { id: string; name: string; slug: string }
export function getPlayerEaClub(eaClub: ClubReference | null) { return eaClub }
export function getPlayerRealCurrentClub(approved: ApprovedCurrentClub | null, clubs: readonly ClubReference[], eaClub: ClubReference | null,
  fallback: "NONE" | "EA_CATALOG_LABELED" = "NONE") {
  if (approved) return { club: clubs.find(c => c.id === approved.approvedClubId) ?? null, source: "APPROVED_REAL" as const, isFallback: false }
  return { club: fallback === "EA_CATALOG_LABELED" ? eaClub : null,
    source: fallback === "EA_CATALOG_LABELED" && eaClub ? "EA_CATALOG_FALLBACK" as const : "UNKNOWN" as const, isFallback: fallback === "EA_CATALOG_LABELED" && !!eaClub }
}

export function proposalFactsHash(p: CurrentClubProposal) {
  // Lifecycle changes do not replace the immutable evaluation/facts.
  const { status: _status, statusReason: _reason, version: _version, updatedAt: _updatedAt, supersededById: _supersededById, ...facts } = p
  void _status; void _reason; void _version; void _updatedAt; void _supersededById
  return transferEvidenceHash(facts)
}
