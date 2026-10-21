// Frozen serialized coverage-v1 boundary. Reading/importing an approved bundle
// must not depend on experimental fitting/inference implementations.
export type CoverageRecord = {
  playerId: string; eaId: string | null; valueEur: number | null; currency: 'EUR'
  type: 'PROVIDER' | 'FUTSCOUT_ESTIMATE' | 'UNAVAILABLE'
  method: string; version: string; modelArtifactHash: string | null; inputHash: string | null
  context: 'COMPLETE' | 'UNKNOWN'; quality: string; qualityApproved: false
  uncertainty: null | { intervals: Record<string, { lower: number; upper: number } | null> | null;
    interpretation: string; targetCohortCoverage: 'UNKNOWN' }
  provenance: Record<string, unknown>; warnings: string[]; abstentionReason: string | null
  eligibility: 'EXISTING_READER_POLICY' | 'PRIVATE_EXPERIMENT_ONLY' | 'ABSTAINED' | 'ACTIVITY_EVIDENCE_HOLD'
  publication: { existingReaderEligible: boolean; modelApproved: false; action: 'NOT_EXECUTED' }
  rights: { providerTraining: 'UNKNOWN'; parameterCommercialUse: 'UNKNOWN'; display: 'EXISTING_POLICY_ONLY' | 'NOT_AUTHORIZED_BY_THIS_RUN' }
  dataReview?: {
    version: 'offline-value-data-review-v1'; manifestHash: string; decisionHash: string; originalRecordHash: string
    previousEligibility: CoverageRecord['eligibility']; previousWarnings: string[]
    issues: string[]; resolution: 'REFERENCE_DEPENDENT' | 'NUMERIC_DIVERGENCE_UNRESOLVED' | 'ACTIVITY_REVIEW'; explanation: string
    evidence: { file: string; sha256: string; url: string }[]
    activity: { status: 'REPORTED_RETIRED' | 'UNKNOWN'; effectiveDate: string | null }
    activityHold: boolean; reviewRequired: boolean; scope: 'OFFLINE_ONLY'; numericValuePreserved: true
  }
}
