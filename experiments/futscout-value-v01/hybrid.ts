// Offline policy simulation ONLY. Never imports a service/writer or selects a DB current.
import { infer, type Artifact, type Inputs } from './engine'

export type ObservedCurrent = null | {
  provider: string; field: string; context: string; presence: 'VALUE' | 'NULL' | 'ABSENT'
  amount: number | null; currency: string | null; status: string; identityConfidence: string
  matchState: string; observationId: string; observedAt: string
}
// Hypothetical approval supplied by synthetic tests; no real approval record exists.
export type ScenarioApproval = {
  state: 'APPROVED' | 'EXPERIMENTAL'; modelVersion: string; artifactHash: string
  rights: 'CONFIRMED' | 'UNKNOWN'; evaluationEvidence: string | null; domainVersion: string | null
}
export function simulateHybridPolicy(args: {
  current: ObservedCurrent; model: Artifact | null; inputs: Inputs | null
  approval: ScenarioApproval | null; withinValidatedDomain: boolean
}) {
  const { current, model, inputs, approval } = args
  const base = { mode: 'OFFLINE_POLICY_SIMULATION' as const, publicationAllowed: false, createsCurrent: false }
  const observationState = current === null ? 'NO_CURRENT' : current.presence === 'NULL' ? 'EXPLICIT_NULL' : current.presence === 'ABSENT' ? 'EXPLICIT_ABSENT' : current.amount === 0 ? 'EXPLICIT_ZERO' : 'VALUE'
  const absent = (reason: string) => ({ ...base, observationState, source: 'NONE', kind: 'ABSENT', amount: null, currency: null, reason, modelVersion: null, artifactHash: null, observationId: current?.observationId ?? null })
  if (current !== null) {
    const eligibleIdentity = current.provider === 'LIVE_FOOTBALL' && current.field === 'MARKET_VALUE' && current.context === 'REAL_WORLD' && current.identityConfidence === 'HIGH' && current.matchState === 'MATCHED'
    if (!eligibleIdentity) return absent('INELIGIBLE_OBSERVATION')
    if (current.presence === 'VALUE') {
      if (current.status !== 'VALID' || current.currency !== 'EUR' || current.amount === null || !Number.isFinite(current.amount) || current.amount < 0 || current.amount > Number.MAX_SAFE_INTEGER) return absent('INVALID_OBSERVED_VALUE')
      // Observations (including explicit zero) win before touching model/inputs/approval.
      return { ...base, observationState, source: 'LIVE_FOOTBALL', kind: 'OBSERVED', amount: current.amount, currency: current.currency,
        reason: current.amount === 0 ? 'OBSERVED_ZERO_PRESERVED' : 'OBSERVED_POSITIVE_PRESERVED', modelVersion: null, artifactHash: null,
        observationId: current.observationId, observedAt: current.observedAt }
    }
    if (current.presence !== 'NULL' || current.amount !== null || current.status !== 'MISSING') return absent('INELIGIBLE_MISSING_OBSERVATION')
  }
  if (!model || !approval || approval.state !== 'APPROVED') return absent('MODEL_NOT_APPROVED')
  if (approval.rights !== 'CONFIRMED') return absent('MODEL_RIGHTS_PENDING')
  if (approval.modelVersion !== model.modelVersion || approval.artifactHash !== model.artifactHash) return absent('APPROVAL_ARTIFACT_MISMATCH')
  if (!approval.evaluationEvidence || !approval.domainVersion || !args.withinValidatedDomain) return absent('DOMAIN_NOT_VALIDATED')
  if (!inputs) return absent('INVALID_INPUT')
  try {
    const prediction = infer(model, inputs)
    if (prediction.prediction === null) return absent(prediction.abstentionReason!)
    return { ...base, observationState, source: 'FUTSCOUT', kind: 'MODEL_ESTIMATE', amount: prediction.prediction, currency: 'EUR', reason: 'APPROVED_SCENARIO_ONLY',
      modelVersion: prediction.modelVersion, artifactHash: prediction.artifactHash, inputHash: prediction.inputHash,
      domainVersion: approval.domainVersion, evaluationEvidence: approval.evaluationEvidence,
      uncertainty: prediction.predictionInterval, identityConfidence: prediction.identityConfidence, observationId: current?.observationId ?? null }
  } catch { return absent('INVALID_MODEL_ARTIFACT') }
}
