import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { normalizeBase, inferSynthetic, syntheticArtifact, assertSyntheticSource, hash, type Salary, type Inputs } from './engine'

const salary: Salary = { amount: 52000, currency: 'EUR', period: 'YEAR', tax: 'GROSS', component: 'BASE', source: 'SYNTHETIC', observedAt: '2026-10-08T00:00:00Z', effectiveAt: null }
const input: Inputs = { playerId: 'synthetic-1', ovr: 70, dateOfBirth: '2000-01-01', referenceAt: '2026-01-01', position: 'GK', clubId: 'synthetic-club', leagueId: 'synthetic-league' }
test('annual base /52 and weekly passthrough', () => {
  assert.equal(normalizeBase(salary).amountEURWeekly, 1000)
  assert.equal(normalizeBase({ ...salary, period: 'WEEK', amount: 1000 }).amountEURWeekly, 1000)
})
test('dated FX direction and provenance preserved', () => {
  const fx = { from: 'GBP', eurPerUnit: 1.2, date: '2026-01-01', source: 'SYNTHETIC_FX' }
  const result = normalizeBase({ ...salary, currency: 'GBP' }, fx)
  assert.equal(result.amountEURWeekly, 1200); assert.deepEqual(result.fx, fx)
  assert.equal(result.original.effectiveAt, null)
})
test('missing FX, invalid rate or wrong currency rejected', () => {
  assert.throws(() => normalizeBase({ ...salary, currency: 'GBP' }), /FX/)
  for (const rate of [0, -1, NaN, Infinity]) assert.throws(() => normalizeBase({ ...salary, currency: 'GBP' }, { from: 'GBP', eurPerUnit: rate, date: '2026-01-01', source: 'SYNTHETIC' }))
})
test('net and unknown tax never converted to gross', () => {
  for (const tax of ['NET', 'UNKNOWN'] as const) assert.throws(() => normalizeBase({ ...salary, tax }), /INCOMPARABLE/)
})
test('bonus/total/unknown never folded into base', () => {
  for (const component of ['BONUS', 'TOTAL', 'UNKNOWN'] as const) assert.throws(() => normalizeBase({ ...salary, component }), /INCOMPARABLE/)
})
test('absence, explicit null and zero distinct', () => {
  assert.equal(normalizeBase({ ...salary, amount: undefined }).state, 'ABSENT')
  assert.equal(normalizeBase({ ...salary, amount: null }).state, 'NULL')
  assert.equal(normalizeBase({ ...salary, amount: 0 }).amountEURWeekly, 0)
  assert.equal(normalizeBase({ ...salary, amount: 0 }).state, 'ZERO')
})
test('invalid amounts, period and provenance rejected', () => {
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => normalizeBase({ ...salary, amount }))
  assert.throws(() => normalizeBase({ ...salary, period: 'UNKNOWN' }))
  assert.throws(() => normalizeBase({ ...salary, observedAt: 'invalid' }))
})
test('hash canonical and deterministic; invalid values rejected', () => {
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }))
  assert.throws(() => hash({ x: NaN })); assert.throws(() => hash({ x: undefined }))
  assert.deepEqual(syntheticArtifact(), syntheticArtifact())
})
test('inference calculations deterministic, not publishable or calibrated', () => {
  const result = inferSynthetic(input)
  assert.deepEqual(result, inferSynthetic(input)); assert.equal(result.publicationAllowed, false)
  const age = (Date.parse(input.referenceAt) - Date.parse(input.dateOfBirth)) / (365.2425 * 86400000)
  assert.equal(result.prediction, Math.exp(2 + 0.04 * 70 + 0.01 * age))
  assert.equal(result.predictionInterval, null); assert.equal(result.identityConfidence, null)
  assert.notEqual(result.inputHash, inferSynthetic({ ...input, ovr: 71 }).inputHash)
})
test('incomplete inputs and unsupported domain abstain', () => {
  assert.equal(inferSynthetic({ ...input, ovr: NaN }).abstentionReason, 'INVALID_OR_MISSING_INPUT')
  assert.equal(inferSynthetic({ ...input, clubId: '' }).prediction, null)
  assert.equal(inferSynthetic({ ...input, ovr: 59 }).abstentionReason, 'OUTSIDE_SYNTHETIC_DOMAIN')
})
test('real-data training forbidden, artifacts cannot self-approve', () => {
  assertSyntheticSource('SYNTHETIC')
  for (const source of ['SALARYSPORT', 'MLSPA', 'LIVE_FOOTBALL']) assert.throws(() => assertSyntheticSource(source))
  const a = syntheticArtifact(); a.coefficients.ovr = 1
  assert.throws(() => inferSynthetic(input, a), /UNAPPROVED/)
})
test('12-player freeze unchanged (local audit dependency)', () => {
  const bytes = readFileSync('audit/output/salarysport-wage-sample-preflight-20261008/selection.json')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '809821820b26cb0a6c7938cc6af2aa2c34a8d43957a6406f933ebe2919a1587f')
})
