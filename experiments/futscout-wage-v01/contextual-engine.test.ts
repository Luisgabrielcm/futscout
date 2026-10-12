import test from 'node:test'
import assert from 'node:assert/strict'
import { fitContextualSynthetic, predictContextualSynthetic, type SyntheticRow, type Context } from './contextual-engine'
import { hash } from './engine'

// Invented response surface exclusively for mathematical tests, never economic evidence.
const rows: SyntheticRow[] = Array.from({ length: 128 }, (_, i) => {
  const league = Math.floor(i / 64), club = Math.floor(i / 32) % 2
  const position = (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], ageYears = 18 + Math.floor(i / 4) % 8 * 2
  return { playerId: `synthetic-${String(i).padStart(3, '0')}`, source: 'SYNTHETIC', leagueId: `league-${league}`,
    clubId: `club-${league}-${club}`, season: '2026', position, ageYears,
    salary: { amount: Math.exp(6 + league * 0.7 + club * 0.3 + (i % 4) * 0.1 + ageYears * 0.02),
      currency: 'EUR', period: 'WEEK', tax: 'GROSS', component: 'BASE', source: 'SYNTHETIC',
      observedAt: '2026-04-16T00:00:00Z', effectiveAt: '2026-04-16' } }
})
const splits = () => ({ train: structuredClone(rows), calibration: [{ ...structuredClone(rows[0]), playerId: 'calibration' }],
  test: [{ ...structuredClone(rows[1]), playerId: 'holdout' }] })
const input: Context = { leagueId: 'league-0', clubId: 'club-0-0', season: '2026', position: 'GK', ageYears: 24 }
const model = fitContextualSynthetic(splits())
const prediction = (x: Context) => predictContextualSynthetic(x, model).prediction!

test('learned nested league and club effects; no fixed multipliers', () => {
  assert.ok(prediction({ ...input, leagueId: 'league-1', clubId: 'club-1-0' }) > prediction(input))
  assert.ok(prediction({ ...input, clubId: 'club-0-1' }) > prediction(input))
})
test('position and linear age sensitivity learned from synthetic data', () => {
  assert.ok(prediction({ ...input, position: 'ATT' }) > prediction(input))
  assert.ok(prediction({ ...input, ageYears: 28 }) > prediction(input))
})
test('club shrinkage increases with regularization', () => {
  const strong = fitContextualSynthetic(splits(), { clubPenalty: 10000 })
  const norm = (m: typeof model) => m.coefficients.reduce((s, b, i) => s + (m.features[i].startsWith('club:') ? b * b : 0), 0)
  assert.ok(norm(strong) < norm(model))
})
test('deterministic fit, row-order independence and stable hashes', () => {
  assert.deepEqual(fitContextualSynthetic(splits()), model)
  const s = splits(); s.train.reverse()
  assert.deepEqual(fitContextualSynthetic(s), model)
})
test('holdout and calibration labels never influence fit', () => {
  const s = splits(); s.test[0].salary.amount = 1e20; s.calibration[0].salary.amount = 1
  assert.deepEqual(fitContextualSynthetic(s), model)
  s.test[0].playerId = s.train[0].playerId
  assert.throws(() => fitContextualSynthetic(s), /LEAKAGE/)
})
test('missing variables, invalid ages and unsupported groups abstain', () => {
  for (const x of [{ ...input, clubId: '' }, { ...input, ageYears: NaN }, { ...input, ageYears: Infinity }])
    assert.equal(predictContextualSynthetic(x, model).prediction, null)
  for (const x of [{ ...input, clubId: 'unseen' }, { ...input, leagueId: 'unseen' }, { ...input, season: '2027' }])
    assert.equal(predictContextualSynthetic(x, model).abstentionReason, 'INSUFFICIENT_SUPPORT')
  assert.equal(predictContextualSynthetic({ ...input, ageYears: 50 }, model).abstentionReason, 'OUTSIDE_AGE_DOMAIN')
})
test('few observations in club cannot obtain unsupported estimate', () => {
  const s = splits(); s.train[0].clubId = 'sparse'
  assert.equal(predictContextualSynthetic({ ...input, clubId: 'sparse' }, fitContextualSynthetic(s)).prediction, null)
})
test('positive finite EUR weekly outputs, blocked publication and no intervals claimed', () => {
  for (const ageYears of [18, 32]) {
    const p = predictContextualSynthetic({ ...input, ageYears }, model)
    assert.ok(Number.isFinite(p.prediction) && p.prediction! > 0)
    assert.equal(p.target, 'EUR/GROSS/BASE/WEEK'); assert.equal(p.publicationAllowed, false)
  }
  assert.equal(model.calibrated, false)
})
test('FX explicit and dated; original currency not silently relabelled', () => {
  const s = splits(); s.train[0].salary.currency = 'GBP'
  assert.throws(() => fitContextualSynthetic(s), /FX/)
  s.train[0].fx = { from: 'GBP', eurPerUnit: 1.2, date: '2026-04-16', source: 'SYNTHETIC_FX' }
  assert.ok(fitContextualSynthetic(s).artifactHash)
})
test('null zero negative and real-source labels rejected', () => {
  for (const amount of [null, 0, -1, NaN, Infinity]) {
    const s = splits(); s.train[0].salary.amount = amount
    assert.throws(() => fitContextualSynthetic(s))
  }
  const s = splits(); s.train[0].salary.source = 'MLSPA'
  assert.throws(() => fitContextualSynthetic(s), /FORBIDDEN/)
})
test('OVR absent from features and cannot influence fit or prediction', () => {
  const s = splits(); Object.assign(s.train[0], { ovr: 99, marketValue: 1e9 })
  assert.deepEqual(fitContextualSynthetic(s), model)
  assert.deepEqual(predictContextualSynthetic(Object.assign({ ...input }, { ovr: 1 }), model), predictContextualSynthetic(input, model))
  assert.equal(model.features.some(f => /ovr|market/i.test(f)), false)
})
test('tampering, overflow, invalid regularization and non-convergence are blocked', () => {
  const bad = structuredClone(model); bad.coefficients[0] = 10000
  assert.equal(predictContextualSynthetic(input, bad).abstentionReason, 'INVALID_ARTIFACT')
  const { artifactHash: ignored, ...payload } = bad; void ignored
  assert.equal(predictContextualSynthetic(input, { ...payload, artifactHash: hash(payload) }).abstentionReason, 'NUMERIC_FAILURE')
  assert.throws(() => fitContextualSynthetic(splits(), { clubPenalty: 0 }), /OPTIONS/)
  assert.throws(() => fitContextualSynthetic(splits(), { maxIterations: 1 }), /CONVERGED/)
})
