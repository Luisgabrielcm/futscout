import test from 'node:test'
import assert from 'node:assert/strict'
import { fitContextualSynthetic, predictContextualSynthetic, type SyntheticRow } from './contextual-engine'
import { splitByClub, compareSyntheticFallback } from './contextual-evaluation'
import { hash } from './engine'

// Invented fixtures only; no economic coefficients or real salaries imported.
const rows: SyntheticRow[] = Array.from({ length: 96 }, (_, i) => ({
  playerId: `synthetic-${i}`, source: 'SYNTHETIC', leagueId: 'L1', clubId: `C${Math.floor(i / 16)}`,
  season: '2026', position: (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], ageYears: 20 + Math.floor(i % 16 / 4) * 3,
  salary: { amount: 1000 + i * 10, currency: 'EUR', period: 'WEEK', tax: 'GROSS', component: 'BASE',
    observedAt: '2026-04-16T00:00:00Z', effectiveAt: '2026-04-16', source: 'SYNTHETIC' }
}))
const selection = splitByClub(rows), model = fitContextualSynthetic(selection.splits)
const fallback = (r: SyntheticRow, m = model) => predictContextualSynthetic(r, m, 'LEAGUE_FALLBACK_V01')

test('known supported club preserves specific prediction and baseline default', () => {
  const r = selection.splits.train[0], a = predictContextualSynthetic(r, model), b = fallback(r)
  assert.equal(a.prediction, b.prediction); assert.equal(b.fallbackLevel, 'CLUB_SPECIFIC')
  assert.deepEqual(a, predictContextualSynthetic(r, model, 'BASELINE'))
})
test('unseen club uses learned league with exactly zero club deviation', () => {
  const r = selection.splits.test[0], p = fallback(r)
  assert.equal(p.fallbackLevel, 'LEAGUE_UNSEEN_CLUB'); assert.ok(p.prediction! > 0)
  assert.equal(predictContextualSynthetic(r, model).prediction, null)
  const expectedLog = model.features.reduce((sum, f, i) => sum + model.coefficients[i] *
    (f === 'intercept' ? 1 : f === 'age' ? (r.ageYears - model.ageMean) / model.ageScale :
      f === `position:${r.position}` || f === `league:${JSON.stringify([r.leagueId, r.season])}` ? 1 : 0), 0)
  assert.equal(p.prediction, Math.exp(expectedLog))
  assert.equal(fallback({ ...r, clubId: 'another-unseen' }).prediction, p.prediction)
})
test('sparse club uses parent instead of its poorly supported deviation', () => {
  const s = structuredClone(selection.splits); s.train[0].clubId = 'sparse'
  const m = fitContextualSynthetic(s), r = s.train[0], p = fallback(r, m)
  assert.equal(p.fallbackLevel, 'LEAGUE_SPARSE_CLUB')
  assert.equal(p.prediction, fallback({ ...r, clubId: 'unseen' }, m).prediction)
  assert.equal(predictContextualSynthetic(r, m).prediction, null)
})
test('unseen league, new season and insufficient parent support still abstain', () => {
  const r = selection.splits.test[0]
  for (const x of [{ ...r, leagueId: 'unknown' }, { ...r, season: '2027' }]) assert.equal(fallback(x).prediction, null)
  const m = fitContextualSynthetic(selection.splits, { minLeague: 1000 })
  assert.equal(fallback(r, m).prediction, null)
})
test('position, age and missing context checks cannot be bypassed by fallback', () => {
  const r = selection.splits.test[0]
  for (const x of [{ ...r, clubId: '' }, { ...r, ageYears: NaN }, { ...r, ageYears: 50 }]) assert.equal(fallback(x).prediction, null)
  const m = fitContextualSynthetic(selection.splits, { minPosition: 1000 })
  assert.equal(fallback(r, m).prediction, null)
})
test('comparison preserves club splits and reports synthetic coverage, not predictive gain', () => {
  const before = hash(selection), report = compareSyntheticFallback(selection.splits.test, model)
  assert.equal(report.baseline.predicted, 0); assert.equal(report.baseline.metrics, null)
  assert.equal(report.fallback.predicted, selection.splits.test.length)
  assert.ok(report.fallback.metrics); assert.equal(report.predictiveImprovementEstablished, false)
  assert.equal(report.fallback.intervals.coverage80, null); assert.equal(report.fallback.publicationAllowed, false)
  assert.equal(hash(selection), before)
  assert.equal(selection.splits.test.some(r => selection.splits.train.some(t => t.clubId === r.clubId)), false)
})
test('league-isolated evaluation preserves abstention for both policies', () => {
  const multi = rows.map((r, i) => ({ ...r, leagueId: i < 48 ? 'L1' : 'L2' }))
  const s = splitByClub(multi, ['L2']).splits, m = fitContextualSynthetic(s)
  const report = compareSyntheticFallback(s.test, m)
  assert.equal(report.baseline.predicted, 0); assert.equal(report.fallback.predicted, 0)
  assert.equal(report.fallback.metrics, null)
})
test('determinism, provenance, original artifact hash and no OVR influence', () => {
  const r = selection.splits.test[0], before = hash(model), p = fallback(r)
  assert.deepEqual(p, fallback(Object.assign({ ...r }, { ovr: 99 })))
  assert.deepEqual(p, fallback(r)); assert.equal(hash(model), before)
  assert.equal(p.provenance.trainingHash, model.trainingHash)
  assert.equal(p.provenance.artifactHash, model.artifactHash)
  assert.equal(p.provenance.validation, 'SYNTHETIC_ONLY_NOT_REAL_VALIDATED')
})
test('regularization retained; fallback does not refit coefficients', () => {
  const stronger = fitContextualSynthetic(selection.splits, { clubPenalty: 10000 })
  const norm = (m: typeof model) => m.coefficients.reduce((s, b, i) => s + (m.features[i].startsWith('club:') ? b * b : 0), 0)
  assert.ok(norm(stronger) < norm(model))
  const before = hash(stronger); fallback(selection.splits.test[0], stronger)
  assert.equal(hash(stronger), before)
})
test('corrupt artifacts and numerical overflow remain blocked under fallback', () => {
  const r = selection.splits.test[0], bad = structuredClone(model); bad.coefficients[0] = 10000
  assert.equal(fallback(r, bad).abstentionReason, 'INVALID_ARTIFACT')
  const { artifactHash: ignored, ...payload } = bad; void ignored
  assert.equal(fallback(r, { ...payload, artifactHash: hash(payload) }).abstentionReason, 'NUMERIC_FAILURE')
})
