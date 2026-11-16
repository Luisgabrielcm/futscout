/** Game simulation only. Never a PublishedWage, real-world market value or contract. */
export type GenericEconomicRecord = Readonly<{
  eaId: string; playerId: string; clubId: string; clubEaId: string
  expectedPlayerHash: string; expectedClubHash: string; sourceRecordHash: string
  identityClassification: "UNKNOWN"; status: "ESTIMATED"; confidence: "LOW"
  weeklyWageEur: number; marketValueEur: number
  contractReference: Readonly<{
    endYear: number; precision: "YEAR"; sourceFileSha256: string; sourceCommit: string
    effectiveRosterDate: null; realContractConfirmed: false
  }>
  simulation: Readonly<{
    durationYears: number; releaseClauseEur: number
    actualClauseStatus: "UNKNOWN"; actualClauseEur: null
  }>
}>

export type GenericEconomicView = Readonly<{
  eaId: string; status: "ESTIMATED"; confidence: "LOW"; identityClassification: "UNKNOWN"
  weeklyWageEur: number; marketValueEur: number; asOf: string
  contractReference: GenericEconomicRecord["contractReference"]
  simulation: GenericEconomicRecord["simulation"]
  batchHash: string; sourceRecordHash: string; simulationModel: string; salaryModel: string
}>

/** Supplied through private release configuration; never checked into the public repository. */
export type GenericEconomicArtifact = Readonly<{
  version: "generic-economic-projection-v1"; sourceBatchHash: string; asOf: string; sourceVersion: string
  simulationModel: string; salaryModel: string; marketModel: string
  publicDisplayRightsApproval: null; excludedEaIds: readonly string[]; rows: readonly GenericEconomicRecord[]
}>

/** Operational evidence references do not certify supplier rights. */
export type GenericEconomicApproval = Readonly<{
  version: "generic-economic-public-approval-v1"; sourceBatchHash: string; projectionHash: string
  modelPublicReuseReviewSha256: string | null; publicActivationDecisionSha256: string | null
  supplierConsentStatus: "MODEL_B_CONSENT_GAP"; supplierConsentVerified: false
}>

export type GenericEconomicRelease = Readonly<{
  version: "generic-economic-private-release-v1"
  artifact: GenericEconomicArtifact; approval: GenericEconomicApproval
}>
