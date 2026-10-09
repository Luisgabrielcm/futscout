// Offline synthetic calculation harness, not a fitted or publishable wage model.
import { createHash } from 'node:crypto'

export const modelVersion = 'futscout-wage-v0.1'
export const inputSchemaVersion = 'futscout-wage-input-v0.1'
export const target = 'EUR/GROSS/BASE/WEEK'
export const salarySportTrainingRights = 'UNKNOWN'
export function hash(value: unknown): string {
  function canonical(x: unknown): unknown {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return x
    if (typeof x === 'number' && Number.isFinite(x)) return x
    if (Array.isArray(x)) return x.map(canonical)
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype)
      return Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]))
    throw new Error('INVALID_HASH_INPUT')
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
export type Salary = {
  amount?: number | null; currency: string; period: 'WEEK' | 'YEAR' | 'UNKNOWN'
  tax: 'GROSS' | 'NET' | 'UNKNOWN'; component: 'BASE' | 'BONUS' | 'TOTAL' | 'UNKNOWN'
  observedAt: string; effectiveAt: string | null; source: string
}
export type FX = { from: string; eurPerUnit: number; date: string; source: string }
const validDate = (x: string) => typeof x === 'string' && Number.isFinite(Date.parse(x))
export function normalizeBase(s: Salary, fx?: FX) {
  const absence = s.amount === undefined ? 'ABSENT' : s.amount === null ? 'NULL' : null
  if (absence) return { amountEURWeekly: null, state: absence, original: s, fx: null }
  if (s.tax !== 'GROSS' || s.component !== 'BASE' || !['YEAR', 'WEEK'].includes(s.period))
    throw new Error('INCOMPARABLE_SALARY')
  if (!s.source || !validDate(s.observedAt) || (s.effectiveAt !== null && !validDate(s.effectiveAt)))
    throw new Error('PROVENANCE_REQUIRED')
  if (!Number.isFinite(s.amount) || s.amount! < 0) throw new Error('INVALID_AMOUNT')
  let rate = 1
  if (s.currency !== 'EUR') {
    if (!/^[A-Z]{3}$/.test(s.currency) || !fx || fx.from !== s.currency || !fx.source ||
        !validDate(fx.date) || !Number.isFinite(fx.eurPerUnit) || fx.eurPerUnit <= 0)
      throw new Error('DATED_FX_REQUIRED')
    rate = fx.eurPerUnit
  }
  const amountEURWeekly = s.amount! * rate / (s.period === 'YEAR' ? 52 : 1)
  if (!Number.isFinite(amountEURWeekly)) throw new Error('NUMERIC_OVERFLOW')
  return { amountEURWeekly, state: amountEURWeekly === 0 ? 'ZERO' : 'VALUE', original: s,
    fx: s.currency === 'EUR' ? null : fx, target }
}
export type Inputs = {
  playerId: string; ovr: number; dateOfBirth: string; referenceAt: string
  position: 'GK' | 'DEF' | 'MID' | 'ATT'; clubId: string; leagueId: string
}
export type Artifact = ReturnType<typeof syntheticArtifact>
export function syntheticArtifact() {
  const payload = {
    modelVersion, inputSchemaVersion, target, trainingSource: 'SYNTHETIC_ONLY',
    coefficients: { intercept: 2, ovr: 0.04, age: 0.01 },
    featureOrder: ['intercept', 'ovr', 'ageYears'],
    applicabilityDomain: { ovr: [60, 90], age: [18, 36], status: 'SYNTHETIC_TEST_DOMAIN_NOT_VALIDATED' },
    provenance: { source: 'invented-coefficients-for-unit-tests', license: 'NOT_REAL_DATA' },
    evaluationEvidence: null, predictionInterval: null, publicationAllowed: false,
  }
  return { ...payload, artifactHash: hash(payload) }
}
export function assertSyntheticSource(source: string) {
  if (source !== 'SYNTHETIC') throw new Error('REAL_TRAINING_NOT_AUTHORIZED')
}
export function inferSynthetic(input: Inputs, artifact: Artifact = syntheticArtifact()) {
  const { artifactHash, ...payload } = artifact
  if (hash(payload) !== artifactHash || artifactHash !== syntheticArtifact().artifactHash)
    throw new Error('UNAPPROVED_ARTIFACT')
  const base = { modelVersion, artifactHash, target, publicationAllowed: false,
    provenance: artifact.provenance, applicabilityDomain: artifact.applicabilityDomain,
    identityConfidence: null, statisticalUncertainty: 'UNVALIDATED', evaluationEvidence: null,
    predictionInterval: null, inputHash: null as string | null }
  const age = (Date.parse(input?.referenceAt) - Date.parse(input?.dateOfBirth)) / (365.2425 * 86400000)
  if (!input || !input.playerId || !input.clubId || !input.leagueId || !Number.isInteger(input.ovr) ||
      input.ovr < 1 || input.ovr > 99 || !Number.isFinite(age) || age < 0 ||
      !['GK', 'DEF', 'MID', 'ATT'].includes(input.position))
    return { ...base, prediction: null, abstentionReason: 'INVALID_OR_MISSING_INPUT' }
  base.inputHash = hash({ inputSchemaVersion, input })
  const d = artifact.applicabilityDomain
  if (input.ovr < d.ovr[0] || input.ovr > d.ovr[1] || age < d.age[0] || age > d.age[1])
    return { ...base, prediction: null, abstentionReason: 'OUTSIDE_SYNTHETIC_DOMAIN' }
  const b = artifact.coefficients
  return { ...base, prediction: Math.exp(b.intercept + b.ovr * input.ovr + b.age * age), abstentionReason: null }
}
