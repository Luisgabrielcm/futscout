// Offline publication projection of the existing coverage contract. No new approval.
import type { CoverageRecord } from './coverage-contract'

export const PUBLICATION_POLICY_VERSION = 'value-publication-decision-v1'

// Runtime supplies only eligibility metadata, never private datasets or parameters.
export type ValuePublicationInput = Pick<CoverageRecord,
  'playerId' | 'eaId' | 'valueEur' | 'currency' | 'type' | 'method' | 'context' | 'eligibility' | 'publication' | 'rights'> & {
  dataReview?: Pick<NonNullable<CoverageRecord['dataReview']>, 'activityHold' | 'reviewRequired'>
}

export function decideValuePublication(record: ValuePublicationInput) {
  const reasons: string[] = []
  if (record.valueEur === null || !Number.isFinite(record.valueEur) || record.valueEur <= 0 ||
      record.valueEur > Number.MAX_SAFE_INTEGER || record.currency !== 'EUR') reasons.push('NO_VALID_POSITIVE_VALUE')
  if (!record.playerId || !record.eaId) reasons.push('IDENTITY_INCOMPLETE')
  if (record.eligibility === 'ACTIVITY_EVIDENCE_HOLD' || record.dataReview?.activityHold) reasons.push('ACTIVITY_EVIDENCE_HOLD')
  if (record.dataReview?.reviewRequired) reasons.push('DATA_REVIEW_REQUIRED')
  if (record.type === 'PROVIDER') {
    if (record.method !== 'LIVE_FOOTBALL_EXISTING_CURRENT' || !record.publication.existingReaderEligible ||
        record.rights.display !== 'EXISTING_POLICY_ONLY' || record.eligibility !== 'EXISTING_READER_POLICY')
      reasons.push('EXISTING_READER_POLICY_NOT_SATISFIED')
  } else if (record.type === 'FUTSCOUT_ESTIMATE') {
    // This contract has no real approval record. Mechanical support never grants it.
    reasons.push('MODEL_QUALITY_NOT_APPROVED', 'MODEL_PUBLICATION_NOT_APPROVED')
    if (record.rights.parameterCommercialUse === 'UNKNOWN') reasons.push('MODEL_COMMERCIAL_RIGHTS_UNKNOWN')
    if (record.context === 'UNKNOWN') reasons.push('PARTIAL_CONTEXT_NOT_VALIDATED')
    if (record.method === 'B_BOUNDED_DOMAIN_EXTRAPOLATION') reasons.push('EXTRAPOLATION_NOT_VALIDATED')
  } else reasons.push('UNAVAILABLE')
  return {
    policyVersion: PUBLICATION_POLICY_VERSION, playerId: record.playerId, eaId: record.eaId,
    method: record.method, eligible: reasons.length === 0, reasons,
    // The sole public amount; the original record remains private and unchanged.
    marketValue: reasons.length === 0 ? record.valueEur : null,
    marketCurrency: reasons.length === 0 ? 'EUR' as const : null,
    authority: 'EXISTING_DISPLAY_POLICY_ONLY' as const,
    actualPublicationPerformed: false as const,
  }
}

export function decideCoveragePublication(records: CoverageRecord[]) {
  if (new Set(records.map(r => r.playerId)).size !== records.length ||
      new Set(records.map(r => r.eaId)).size !== records.length) throw Error('DUPLICATE_PUBLICATION_IDENTITY')
  const rows = records.map(decideValuePublication)
  const methods: Record<string, { total: number; publishable: number; held: number }> = {}
  const reasons: Record<string, number> = {}
  for (const row of rows) {
    const method = methods[row.method] ??= { total: 0, publishable: 0, held: 0 }
    method.total++; if (row.eligible) method.publishable++; else method.held++
    for (const reason of row.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1
  }
  return { rows, summary: { total: rows.length, publishable: rows.filter(r => r.eligible).length,
    held: rows.filter(r => !r.eligible).length, methods, reasons,
    scope: 'FROZEN_BACKUP_OFFLINE_DECISION_NO_PRODUCTION_CHANGE', actualPublicationPerformed: 0 } }
}
