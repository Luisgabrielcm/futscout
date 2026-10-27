// Offline publication projection of the existing coverage contract. No new approval.
import type { CoverageRecord } from './coverage-contract'
import { SUPPLIER_NOTICE_POLICY, approvedEstimateMethod } from '../../lib/economicData/estimatePublication'

export const PUBLICATION_POLICY_VERSION = 'value-publication-decision-v1'
export const EXPERIMENTAL_PUBLICATION_POLICY = 'value-experimental-publication-v1' as const
export const EXPERIMENTAL_PRODUCT_DECISION = Object.freeze({
  evidenceRef: 'director/FUTSCOUT_VALUE_EXPERIMENTAL_PUBLICATION_POLICY_01',
  precisionRiskAccepted: true, statisticalValidation: false,
  thirdPartyRightsGranted: false,
})
export type ValuePublicationPolicy = typeof PUBLICATION_POLICY_VERSION | typeof EXPERIMENTAL_PUBLICATION_POLICY | typeof SUPPLIER_NOTICE_POLICY

// Runtime supplies only eligibility metadata, never private datasets or parameters.
export type ValuePublicationInput = Pick<CoverageRecord,
  'playerId' | 'eaId' | 'valueEur' | 'currency' | 'type' | 'method' | 'context' | 'eligibility' | 'publication' | 'rights'> & {
  dataReview?: Pick<NonNullable<CoverageRecord['dataReview']>, 'activityHold' | 'reviewRequired'>
  estimateContentHash?: string
}

export function decideValuePublication(record: ValuePublicationInput, policy: ValuePublicationPolicy = PUBLICATION_POLICY_VERSION) {
  if (![PUBLICATION_POLICY_VERSION, EXPERIMENTAL_PUBLICATION_POLICY, SUPPLIER_NOTICE_POLICY].includes(policy)) throw Error('UNKNOWN_PUBLICATION_POLICY')
  const experimental = policy !== PUBLICATION_POLICY_VERSION
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
    if (!experimental) {
      reasons.push('MODEL_QUALITY_NOT_APPROVED', 'MODEL_PUBLICATION_NOT_APPROVED')
      if (record.context === 'UNKNOWN') reasons.push('PARTIAL_CONTEXT_NOT_VALIDATED')
      if (record.method === 'B_BOUNDED_DOMAIN_EXTRAPOLATION') reasons.push('EXTRAPOLATION_NOT_VALIDATED')
    } else {
      if (!['D1_FULL_CONTEXT', 'B_PARTIAL_CONTEXT', 'B_BOUNDED_DOMAIN_EXTRAPOLATION'].includes(record.method))
        reasons.push('METHOD_OUTSIDE_EXPERIMENTAL_DECISION')
      if (record.eligibility !== 'PRIVATE_EXPERIMENT_ONLY') reasons.push('ESTIMATE_INDIVIDUAL_ELIGIBILITY_NOT_SATISFIED')
    }
    // No reviewed contractual grant exists. Ignore caller-supplied approval
    // flags: neither the owner decision nor metadata can manufacture a licence.
    if (policy !== SUPPLIER_NOTICE_POLICY) reasons.push('MODEL_COMMERCIAL_RIGHTS_UNKNOWN')
    else if (approvedEstimateMethod(record.estimateContentHash) !== record.method) reasons.push('OUTSIDE_SUPPLIER_PUBLICATION_SCOPE')
  } else reasons.push('UNAVAILABLE')
  return {
    policyVersion: policy, playerId: record.playerId, eaId: record.eaId,
    method: record.method, eligible: reasons.length === 0, reasons,
    // The sole public amount; the original record remains private and unchanged.
    marketValue: reasons.length === 0 ? record.valueEur : null,
    marketCurrency: reasons.length === 0 ? 'EUR' as const : null,
    authority: 'EXISTING_DISPLAY_POLICY_ONLY' as const,
    actualPublicationPerformed: false as const,
  }
}

export function decideCoveragePublication(records: CoverageRecord[], policy: ValuePublicationPolicy = PUBLICATION_POLICY_VERSION) {
  if (new Set(records.map(r => r.playerId)).size !== records.length ||
      new Set(records.map(r => r.eaId)).size !== records.length) throw Error('DUPLICATE_PUBLICATION_IDENTITY')
  const rows = records.map(record => decideValuePublication(record, policy))
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
