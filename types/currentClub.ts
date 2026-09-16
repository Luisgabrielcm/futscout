import type { CurrentClubDecision, NormalizedTransferObservation } from "./transferObservation"

export const CURRENT_CLUB_POLICY = "temporal-current-club-v2" as const
export type ClubEvidence = {
  source: "api-football" | "ea" | "futscout"
  observedAt: string
  effectiveAt: string | null
  teamId: number | null
  kind: "TRANSFER_EVENT" | "ROSTER_SEASON" | "OFFICIAL_LINEUP" | "LOCAL_CURRENT_CLUB" | "EA_CATALOG_CLUB"
  strength: "PRIMARY" | "DATED_CORROBORATION" | "SEASONAL" | "CONTEXT"
  reference: string
}
export type CurrentClubEvaluation = {
  decision: CurrentClubDecision
  reason: string
  candidateTeamId: number | null
  currentClubCandidate: { clubId: string; providerTeamId: number } | null
  effectiveSince: string | null
  evidenceState: "CORROBORATED" | "REVIEW_REQUIRED" | "INSUFFICIENT"
  supportingEvidence: ClubEvidence[]
  contradictingEvidence: ClubEvidence[]
  warnings: string[]
  policyVersion: typeof CURRENT_CLUB_POLICY
  evidenceHash: string
  evaluatedAt: string
  writable: false
}
export type TransferReview = {
  key: string
  playerId: string
  kind: "TEAM_IDENTITY_REVIEW" | "CURRENT_CLUB_REVIEW" | "TRANSFER_REVISION_REVIEW" | "CONFLICT"
  reason: string
  providerTeamId: number | null
  evidenceHash: string
}
export type TransferObservationRecord = {
  id: string; playerId: string; provider: "api-football"; providerPlayerId: number
  providerPlayerNameRaw: string; transferDate: string | null; dateRaw: string | null
  fromProviderTeamId: number | null; fromTeamNameRaw: string | null
  toProviderTeamId: number | null; toTeamNameRaw: string | null; typeRaw: string | null
  payloadVersion: 1; contentHash: string; logicalEventKey: string
  possibleRevisionHashes: string[]; fetchedAt: string; createdAt: string
  sourceGroup: number; sourceOrder: number; sourceIndex: number; warnings: string[]
}
export type ConfirmedTransferPlayer = {
  playerId: string; providerPlayerId: number; identityConfirmed: true; ownershipUnique: true
  eaClubId: string | null; eaTeamId: number | null
  // A separately approved real-life state, never the EA club masquerading as real-life authority.
  realLifeTeamId?: number | null
}
export type TransferHistoryInput = {
  player: ConfirmedTransferPlayer
  events: readonly NormalizedTransferObservation[]
  fetchedAt: string
}
