import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonical, infer, sha256, type Artifact, type Inputs } from './engine'
import { simulateHybridPolicy, type ObservedCurrent } from './hybrid'

// Deliberately specified mathematical fixtures, never fitted economic parameters.
function model(patch: Partial<Omit<Artifact, 'artifactHash'>> = {}): Artifact {
  const payload: Omit<Artifact, 'artifactHash'> = {
    modelVersion: 'futscout-value-v0.1', inputSchemaVersion: 'futscout-value-input-v0.1', baseline: 'A',
    trainingDatasetVersion: 'SYNTHETIC_COHERENCE_ONLY', datasetManifestHash: sha256('synthetic-coherence'),
    trainingSource: 'SYNTHETIC', publicationAllowed: false, targetDefinition: 'ln(EUR); exp(log-fit), not arithmetic mean',
    normalization: { ovr: [70, 10], age: [25, 5] },
    featureOrder: ['intercept', 'ovr_train_standardized', 'age_train_standardized'], coefficients: [10, 0.4, -0.2],
    applicabilityDomain: { ovr: [1, 99], age: [0, 100], positions: ['GK', 'DEF', 'MID', 'ATT'], policy: 'TRAIN_RANGE_ONLY_NOT_VALIDATED_SUPPORT' },
    calibration: { version: 'absolute-log-residual-conformal-v1', n: 30, quantiles: { '0.5': 0.1, '0.8': 0.2, '0.9': 0.3 } },
    trainingIds: ['synthetic-train'], calibrationIds: ['synthetic-calibration'],
    validationManifestHash: sha256('synthetic-splits'), evaluationEvidence: null, ...patch,
  }
  return { ...payload, artifactHash: sha256(canonical(payload)) }
}
function inputs(dob = '2000-01-01T00:00:00.000Z', patch: Partial<Inputs> = {}): Inputs {
  const referenceAt = '2026-10-08T00:00:00.000Z'
  return { playerId: 'synthetic-player', externalId: null, ovr: 70, dateOfBirth: dob, referenceAt,
    ageYears: (Date.parse(referenceAt) - Date.parse(dob)) / (365.2425 * 86400000),
    position: 'CM', positionGroup: 'MID', clubId: 'synthetic-club', clubGroup: 'synthetic-club', leagueId: 'synthetic-league', ...patch }
}
function value(m: Artifact, x: Inputs): number {
  const result = infer(m, x)
  assert.equal(result.abstentionReason, null)
  assert(result.prediction !== null && Number.isFinite(result.prediction) && result.prediction > 0)
  return result.prediction
}
function close(actual: number, expected: number) { assert(Math.abs(actual / expected - 1) < 1e-12) }

test('OVR sensitivity follows positive, negative or zero fixture coefficient', () => {
  for (const coefficient of [0.4, -0.4, 0]) {
    const m = model({ coefficients: [10, coefficient, 0] })
    close(value(m, inputs(undefined, { ovr: 71 })) / value(m, inputs()), Math.exp(coefficient / 10))
  }
})

test('age sensitivity follows the linear log coefficient without an invented peak', () => {
  const young = inputs('2005-01-01T00:00:00.000Z'), older = inputs('1995-01-01T00:00:00.000Z')
  for (const coefficient of [-0.2, 0.2, 0]) {
    const m = model({ coefficients: [10, 0, coefficient] })
    close(value(m, older) / value(m, young), Math.exp(coefficient * (older.ageYears - young.ageYears) / 5))
  }
})

test('B position ratios are deterministic fixture effects; A is position invariant', () => {
  const b = model({ baseline: 'B', coefficients: [10, 0, 0, 0.3, -0.4, 0.1],
    featureOrder: ['intercept', 'ovr_train_standardized', 'age_train_standardized', 'DEF_vs_GK', 'MID_vs_GK', 'ATT_vs_GK'] })
  const cases = [['GK', 'GK', 0], ['CB', 'DEF', 0.3], ['CM', 'MID', -0.4], ['ST', 'ATT', 0.1]] as const
  const reference = value(b, inputs(undefined, { position: 'GK', positionGroup: 'GK' }))
  for (const [position, positionGroup, effect] of cases) {
    const x = inputs(undefined, { position, positionGroup })
    close(value(b, x) / reference, Math.exp(effect))
    assert.deepEqual(infer(b, x), infer(b, x))
    close(value(model(), x), value(model(), inputs()))
  }
})

test('valid boundary inputs and ordered intervals remain positive, finite and deterministic', () => {
  const m = model()
  for (const ovr of [1, 99]) for (const dob of ['1927-01-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z']) {
    const x = inputs(dob, { ovr }), result = infer(m, x)
    value(m, x); assert.deepEqual(result, infer(m, x)); assert(result.predictionInterval)
    const intervals = ['0.5', '0.8', '0.9'].map(k => result.predictionInterval![k]!)
    for (const interval of intervals) {
      assert(interval.lower > 0 && Number.isFinite(interval.upper))
      assert(interval.lower <= result.prediction! && result.prediction! <= interval.upper)
    }
    assert(intervals[2].lower <= intervals[1].lower && intervals[1].lower <= intervals[0].lower)
    assert(intervals[2].upper >= intervals[1].upper && intervals[1].upper >= intervals[0].upper)
  }
})

test('small OVR changes follow the analytic ratio without numerical jumps', () => {
  const m = model()
  for (let ovr = 2; ovr <= 99; ovr++) close(value(m, inputs(undefined, { ovr })) / value(m, inputs(undefined, { ovr: ovr - 1 })), Math.exp(0.04))
})

test('overflow, underflow and interval overflow abstain', () => {
  for (const intercept of [1000, -1000]) assert.equal(infer(model({ coefficients: [intercept, 0, 0] }), inputs()).abstentionReason, 'NUMERIC_RANGE')
  const calibration = { version: 'absolute-log-residual-conformal-v1' as const, n: 30, quantiles: { '0.5': 1, '0.8': 2, '0.9': 1000 } }
  assert.equal(infer(model({ calibration }), inputs()).abstentionReason, 'NUMERIC_RANGE')
})

test('incomplete and invalid inputs abstain without imputation', () => {
  const incomplete = { ...inputs() } as Partial<Inputs>; delete incomplete.dateOfBirth
  for (const x of [incomplete, { ...inputs(), ovr: Infinity }, { ...inputs(), ovr: 0 }, { ...inputs(), ageYears: NaN }]) {
    const result = infer(model(), x as Inputs)
    assert.equal(result.prediction, null); assert.equal(result.abstentionReason, 'INVALID_INPUT')
  }
})

test('unsupported OVR, age and position abstain', () => {
  const m = model({ applicabilityDomain: { ovr: [65, 75], age: [20, 30], positions: ['GK'], policy: 'TRAIN_RANGE_ONLY_NOT_VALIDATED_SUPPORT' } })
  assert.equal(infer(m, inputs(undefined, { ovr: 60 })).abstentionReason, 'OUTSIDE_TRAIN_RANGE')
  assert.equal(infer(m, inputs('1980-01-01T00:00:00.000Z')).abstentionReason, 'OUTSIDE_TRAIN_RANGE')
  assert.equal(infer(m, inputs()).abstentionReason, 'UNSUPPORTED_POSITION')
})

test('missing calibration returns absence', () => {
  const calibration = { version: 'absolute-log-residual-conformal-v1' as const, n: 0, quantiles: { '0.5': null, '0.8': null, '0.9': null } }
  const result = infer(model({ calibration }), inputs())
  assert.equal(result.prediction, null); assert.equal(result.abstentionReason, 'INSUFFICIENT_CALIBRATION')
})

test('unapproved models cannot fill explicit null or no-current or publish', () => {
  const empty: ObservedCurrent = { provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', presence: 'NULL',
    amount: null, currency: null, status: 'MISSING', identityConfidence: 'HIGH', matchState: 'MATCHED',
    observationId: 'synthetic-observation', observedAt: '2026-10-08T00:00:00.000Z' }
  for (const current of [null, empty]) {
    const result = simulateHybridPolicy({ current, model: model(), inputs: inputs(), approval: null, withinValidatedDomain: true })
    assert.equal(result.amount, null); assert.equal(result.reason, 'MODEL_NOT_APPROVED')
    assert.equal(result.publicationAllowed, false); assert.equal(result.createsCurrent, false)
  }
})

test('observed positive and zero win even when model cannot infer', () => {
  for (const amount of [220000000, 0]) {
    const current = Object.freeze({ provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', presence: 'VALUE' as const,
      amount, currency: 'EUR', status: 'VALID', identityConfidence: 'HIGH', matchState: 'MATCHED',
      observationId: 'synthetic-observation', observedAt: '2026-10-08T00:00:00.000Z' })
    const before = canonical(current)
    const result = simulateHybridPolicy({ current, model: model({ coefficients: [1000, 0, 0] }), inputs: null, approval: null, withinValidatedDomain: false })
    assert.equal(result.amount, amount); assert.equal(result.source, 'LIVE_FOOTBALL')
    assert.equal(result.observationState, amount === 0 ? 'EXPLICIT_ZERO' : 'VALUE')
    assert.equal(result.observationId, current.observationId); assert.equal(canonical(current), before)
    assert.equal(result.publicationAllowed, false); assert.equal(result.createsCurrent, false)
  }
})
