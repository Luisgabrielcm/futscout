export type TransferDateState = "VALID" | "FUTURE_TRANSFER" | "INVALID_DATE" | "MISSING_DATE"
export type TransferKindHint = "LOAN_HINT" | "RETURN_FROM_LOAN_HINT" | "UNKNOWN_TRANSFER_KIND"
export type NormalizedTransferObservation = {
  provider: "api-football"
  providerPlayerId: number
  providerPlayerName: string
  transferDate: string | null
  dateRaw: string | null
  dateState: TransferDateState
  fromProviderTeamId: number | null
  fromTeamNameRaw: string | null
  toProviderTeamId: number | null
  toTeamNameRaw: string | null
  typeRaw: string | null
  kindHint: TransferKindHint
  sourceIndex: number
  sourceGroup: number
  sourceOrder: number
  warnings: string[]
}
export type TransferRequestLog = {
  ordinal: number; providerPlayerId: number; endpoint: "/transfers"; method: "GET"
  status: number | null; durationMs: number; validation: string
}
export type TransferObservationResult = {
  provider: "api-football"
  requestedPlayerId: number
  returnedPlayerIdentity: { id: number; namesRaw: string[] } | null
  transfers: NormalizedTransferObservation[]
  chronologicalAsc: NormalizedTransferObservation[]
  chronologicalDesc: NormalizedTransferObservation[]
  validation: "VALID_IDENTITY" | "EMPTY_NO_EVIDENCE"
  warnings: string[]
  requestMetadata: TransferRequestLog & { fetchedAt: string }
}
export type TransferClub = { id: string; name: string; apiFootballId: number | null }
export type TransferTeamResolution = {
  providerTeamId: number | null; rawName: string | null
  status: "RESOLVED" | "UNKNOWN_TEAM" | "CONFLICT"; clubId: string | null
}
export type CurrentClubPlayer = {
  providerPlayerId: number; identityConfirmed: boolean; clubId: string; localTeamId: number
}
export type TransferRosterEvidence = {
  teamId: number; season: number; fetchedAt: string; expiresAt: string; playerIds: number[]
}
export type TransferLineupEvidence = { teamId: number; fixtureDate: string; playerIds: number[] }
export type CurrentClubDecision = "CURRENT_CLUB_CONFIRMED" | "TRANSFER_CANDIDATE" | "LOAN_CANDIDATE" |
  "RETURN_FROM_LOAN_CANDIDATE" | "TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER" | "STALE_LOCAL_CLUB" |
  "ROSTER_MISMATCH" | "INSUFFICIENT_EVIDENCE" | "CONFLICT"
