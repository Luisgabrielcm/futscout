import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonical, sha256, type Artifact, type Inputs } from './engine'
import { simulateHybridPolicy, type ObservedCurrent, type ScenarioApproval } from './hybrid'
import { runCommand } from './run'
import { evaluateFrozenDataset, verifyFrozenSplits } from './pipeline'

const payload: Omit<Artifact, 'artifactHash'> = {
  modelVersion: 'futscout-value-v0.1', inputSchemaVersion: 'futscout-value-input-v0.1', baseline: 'A', trainingDatasetVersion: 'SYNTHETIC_POLICY_FIXTURE',
  datasetManifestHash: sha256('SYNTHETIC'), trainingSource: 'SYNTHETIC', publicationAllowed: false, targetDefinition: 'ln(EUR); exp(log-fit), not arithmetic mean',
  normalization: { ovr: [70, 10], age: [25, 5] }, featureOrder: ['intercept', 'ovr_train_standardized', 'age_train_standardized'], coefficients: [10, 0, 0],
  applicabilityDomain: { ovr: [60, 80], age: [18, 40], positions: ['GK', 'DEF', 'MID', 'ATT'], policy: 'TRAIN_RANGE_ONLY_NOT_VALIDATED_SUPPORT' },
  calibration: { version: 'absolute-log-residual-conformal-v1', n: 30, quantiles: { '0.5': 0.1, '0.8': 0.2, '0.9': 0.3 } },
  trainingIds: ['synthetic-train'], calibrationIds: ['synthetic-calibration'], validationManifestHash: sha256('synthetic-splits'), evaluationEvidence: null,
}
const model: Artifact = { ...payload, artifactHash: sha256(canonical(payload)) }
const inputs: Inputs = { playerId: 'synthetic-player', externalId: null, ovr: 70, dateOfBirth: '2000-01-01T00:00:00.000Z', referenceAt: '2026-10-08T00:00:00.000Z',
  ageYears: (Date.parse('2026-10-08T00:00:00.000Z') - Date.parse('2000-01-01T00:00:00.000Z')) / (365.2425 * 86400000), position: 'CM', positionGroup: 'MID', clubId: 'test-club', clubGroup: 'LOCAL:test-club', leagueId: 'test-league' }
const approval: ScenarioApproval = { state: 'APPROVED', modelVersion: model.modelVersion, artifactHash: model.artifactHash, rights: 'CONFIRMED', evaluationEvidence: 'SYNTHETIC_SCENARIO_NOT_REAL_APPROVAL', domainVersion: 'SYNTHETIC_DOMAIN' }
const observed: Exclude<ObservedCurrent, null> = { provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', presence: 'VALUE', amount: 123456, currency: 'EUR', status: 'VALID', identityConfidence: 'HIGH', matchState: 'MATCHED', observationId: 'synthetic-observation', observedAt: '2026-10-08T00:00:00.000Z' }
const empty: Exclude<ObservedCurrent, null> = { ...observed, presence: 'NULL', amount: null, currency: null, status: 'MISSING' }
const scenario = { current: null, model, inputs, approval, withinValidatedDomain: true }

test('positive observed value is preserved even with corrupt model and missing inputs', () => {
  const current = Object.freeze({ ...observed }), before = canonical(current)
  const result = simulateHybridPolicy({ ...scenario, current, inputs: null, model: { ...model, coefficients: [999] } })
  assert.equal(result.amount, current.amount); assert.equal(result.source, 'LIVE_FOOTBALL'); assert.equal(result.observationId, current.observationId)
  assert.equal(canonical(current), before); assert.equal(result.createsCurrent, false); assert.equal(result.publicationAllowed, false)
})
test('explicit null and no-current remain distinguishable', () => {
  const a = simulateHybridPolicy({ ...scenario, current: empty, approval: null }), b = simulateHybridPolicy({ ...scenario, approval: null })
  assert.equal(a.observationState, 'EXPLICIT_NULL'); assert.equal(b.observationState, 'NO_CURRENT'); assert.equal(a.amount, null); assert.equal(b.amount, null)
})
test('approved hypothetical estimate only fills null or no-current', () => {
  for (const current of [null, empty]) {
    const r = simulateHybridPolicy({ ...scenario, current }); assert.equal(r.source, 'FUTSCOUT'); assert.equal(r.amount, Math.exp(10))
    assert.equal(r.modelVersion, model.modelVersion); assert.equal(r.artifactHash, model.artifactHash); assert.equal(r.publicationAllowed, false)
  }
})
test('experimental model and pending rights return absence', () => {
  assert.equal(simulateHybridPolicy({ ...scenario, approval: { ...approval, state: 'EXPERIMENTAL' } }).reason, 'MODEL_NOT_APPROVED')
  assert.equal(simulateHybridPolicy({ ...scenario, approval: { ...approval, rights: 'UNKNOWN' } }).reason, 'MODEL_RIGHTS_PENDING')
})
test('incomplete inputs cause abstention despite hypothetical approval', () => {
  assert.equal(simulateHybridPolicy({ ...scenario, inputs: {} as Inputs }).reason, 'INVALID_INPUT')
  assert.equal(simulateHybridPolicy({ ...scenario, inputs: null }).reason, 'INVALID_INPUT')
})
test('HIGH identity cannot approve model statistical quality', () => {
  assert.equal(simulateHybridPolicy({ ...scenario, current: empty, approval: null }).amount, null)
  const r = simulateHybridPolicy({ ...scenario, current: empty }); assert('identityConfidence' in r); assert.equal(r.identityConfidence, null)
})
test('explicit zero stays observed zero, never null or model estimate', () => {
  const r = simulateHybridPolicy({ ...scenario, current: { ...observed, amount: 0 } })
  assert.equal(r.amount, 0); assert.equal(r.source, 'LIVE_FOOTBALL'); assert.equal(r.observationState, 'EXPLICIT_ZERO')
})
test('unvalidated domain and mismatched artifact prevent estimates', () => {
  assert.equal(simulateHybridPolicy({ ...scenario, withinValidatedDomain: false }).reason, 'DOMAIN_NOT_VALIDATED')
  assert.equal(simulateHybridPolicy({ ...scenario, approval: { ...approval, artifactHash: sha256('other') } }).reason, 'APPROVAL_ARTIFACT_MISMATCH')
  assert.equal(simulateHybridPolicy({ ...scenario, inputs: { ...inputs, ovr: 99 } }).reason, 'OUTSIDE_TRAIN_RANGE')
})
test('absent payload, wrong currency and identity cannot be silently replaced', () => {
  for (const current of [{ ...empty, presence: 'ABSENT' as const }, { ...observed, currency: 'USD' }, { ...observed, identityConfidence: 'MEDIUM' }, { ...observed, amount: NaN }]) {
    const r = simulateHybridPolicy({ ...scenario, current }); assert.equal(r.source, 'NONE'); assert.equal(r.amount, null)
  }
})
test('training and evaluation commands stop at license gate before files or real data', () => {
  assert.throws(() => runCommand(['train', 'DOES_NOT_EXIST']), /LIVE_FOOTBALL_TRAINING_LICENSE_PENDING/)
  assert.throws(() => runCommand(['evaluate', 'DOES_NOT_EXIST', 'DOES_NOT_EXIST']), /LIVE_FOOTBALL_TRAINING_LICENSE_PENDING/)
  assert.throws(() => evaluateFrozenDataset('DOES_NOT_EXIST', { A: model, B: model }), /LIVE_FOOTBALL_TRAINING_LICENSE_PENDING/)
})
test('frozen 3457-player split has no player/club/unseen-league overlap', () => {
  const checked = verifyFrozenSplits('audit/output/futscout-economic-dataset-v1-20261008')
  assert.deepEqual(checked.counts, { train: 1707, calibration: 455, holdout: 577, unseen_leagues: 718 }); assert.equal(checked.players, 3457)
})
