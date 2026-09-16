import type { CurrentClubEvaluation } from "./currentClub"

export type ProposalStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "SUPERSEDED" | "REVIEW" | "CONFLICT"
export type ApprovedCurrentClub = {
  playerId: string; approvedClubId: string | null; approvedProviderTeamId: number | null
  effectiveSince: string | null; evidenceHash: string; approvedAt: string
  source: string; decision: string; metadata: Record<string, unknown>
  version: number; createdAt: string; updatedAt: string; sourceProposalId: string
}
export type CurrentClubProposal = {
  id: string; playerId: string; providerPlayerId: number; revision: number; version: number
  baseApprovedVersion: number; proposedClubId: string | null; proposedProviderTeamId: number | null
  effectiveSince: string | null; decision: string; evidenceHash: string; observationHashes: string[]
  policyVersion: string; replacementPolicy: string; evidence: CurrentClubEvaluation
  warnings: string[]; supportingEvidence: CurrentClubEvaluation["supportingEvidence"]
  contradictingEvidence: CurrentClubEvaluation["contradictingEvidence"]
  status: ProposalStatus; statusReason: string; evaluatedAt: string; createdAt: string; updatedAt: string
  supersededById: string | null; sourceLegacyStateId: string | null
}
export type CurrentClubAggregate = {
  playerId: string; approved: ApprovedCurrentClub | null; proposals: CurrentClubProposal[]
}
