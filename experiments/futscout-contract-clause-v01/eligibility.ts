import { assessTemporal } from './temporal-v02'
import type { Job } from './planner'
import { sourceGate, type Source } from './source-registry'

export function evaluateEligibility(job: Job, source: Source, evaluationAt: string) {
  const reasons = [...sourceGate(source).reasons]
  if (source.id !== job.sourceId || source.sourceVersion !== job.sourceVersion || source.provider !== job.input.contract.provider)
    reasons.push('SOURCE_CONTEXT_MISMATCH')
  if (job.input.contract.provenance.rights !== 'AUTHORIZED') reasons.push('EVIDENCE_RIGHTS_UNRESOLVED')
  if (job.input.contract.identityConfidence !== 'HIGH') reasons.push('IDENTITY_NOT_HIGH')
  if (job.temporalLink !== 'CONSISTENT') reasons.push(job.temporalLink === 'CLUB_CONFLICT' ? 'CLUB_CONFLICT' : 'TEMPORAL_LINK_UNPROVEN')
  if (job.signals.conflict) reasons.push('CONFLICT_REQUIRES_REVIEW')
  let temporal: ReturnType<typeof assessTemporal> | null = null
  try { temporal = assessTemporal(job.input, job.expected, evaluationAt) }
  catch { reasons.push('INVALID_TEMPORAL_INPUT') } // No raw payload/error logging.
  if (temporal && temporal.assessment !== 'CURRENT_CORROBORATED') reasons.push(...temporal.abstentionReasons, temporal.assessment)
  return { reviewEligible: reasons.length === 0, reasons: [...new Set(reasons)], temporal,
    currentEligible: false as const, publicationAllowed: false as const, persistenceEligible: false as const }
}
