import test from 'node:test'
import assert from 'node:assert/strict'
import { splitByClub, pointMetrics, evaluateSynthetic, prepareSyntheticEvaluationRows } from './contextual-evaluation'
import { fitContextualSynthetic, type SyntheticRow } from './contextual-engine'
import type { ContextualInput } from './contextual-input'

const rows: SyntheticRow[] = Array.from({ length: 96 }, (_, i) => ({
  playerId: `synthetic-${i}`, source: 'SYNTHETIC', leagueId: i < 48 ? 'L1' : 'L2', clubId: `C${Math.floor(i / 16)}`,
  season: '2026', position: (['GK', 'DEF', 'MID', 'ATT'] as const)[i % 4], ageYears: 20 + Math.floor(i % 16 / 4) * 3,
  salary: { amount: 1000 + i * 10, currency: 'EUR', period: 'WEEK', tax: 'GROSS', component: 'BASE',
    observedAt: '2026-04-16T00:00:00Z', effectiveAt: '2026-04-16', source: 'SYNTHETIC' }
}))
test('splits deterministic under row permutation, preserve inputs and manifest hash', () => {
  const before = structuredClone(rows), a = splitByClub(rows), b = splitByClub([...rows].reverse())
  assert.deepEqual(a, b); assert.deepEqual(rows, before)
  assert.equal(a.splits.train.length + a.splits.calibration.length + a.splits.test.length, rows.length)
})
test('club and player groups never cross train/calibration/test', () => {
  const s = splitByClub(rows).splits
  for (const [a, b] of [[s.train, s.calibration], [s.train, s.test], [s.calibration, s.test]]) {
    assert.equal(a.some(r => b.some(t => r.clubId === t.clubId || r.playerId === t.playerId)), false)
  }
  assert.throws(() => splitByClub([...rows, { ...rows[0], clubId: 'transfer-club' }]), /LEAKAGE/)
})
test('hold out entire league without leaking it into development', () => {
  const s = splitByClub(rows, ['L2']).splits
  assert.equal([...s.train, ...s.calibration].some(r => r.leagueId === 'L2'), false)
  assert.equal(s.test.filter(r => r.leagueId === 'L2').length, 48)
  assert.throws(() => splitByClub(rows, ['absent']), /UNKNOWN/)
})
test('mixed editions, insufficient clubs and real-source rows rejected', () => {
  const changed = structuredClone(rows); changed[0].season = '2025'
  assert.throws(() => splitByClub(changed), /MIXED/)
  assert.throws(() => splitByClub(rows.slice(0, 16)), /INSUFFICIENT/)
  changed[0] = { ...rows[0], salary: { ...rows[0].salary, source: 'MLSPA' } }
  assert.throws(() => splitByClub(changed), /FORBIDDEN/)
})
test('MAE, median percent, natural log MAE and signed bias match hand calculation', () => {
  const m = pointMetrics([{ actual: 100, predicted: 120 }, { actual: 200, predicted: 180 }])!
  assert.equal(m.maeEURWeekly, 20); assert.equal(m.medianAbsolutePercentageError, 15); assert.equal(m.biasEURWeekly, 0)
  assert.ok(Math.abs(m.maeLog - (Math.abs(Math.log(1.2)) + Math.abs(Math.log(0.9))) / 2) < 1e-12)
  assert.equal(pointMetrics([{ actual: 100, predicted: 100 }])!.medianAbsolutePercentageError, 0)
})
test('unseen clubs report abstention, null metrics and unavailable intervals', () => {
  const s = splitByClub(rows).splits, model = fitContextualSynthetic(s), report = evaluateSynthetic(s.test, model)
  assert.equal(report.abstained, s.test.length); assert.equal(report.predictionCoverage, 0)
  assert.equal(report.metrics, null); assert.equal(report.intervals.coverage90, null)
  assert.equal(report.intervals.meanWidth, null); assert.equal(report.publicationAllowed, false)
})
test('unseen league also abstains; supported training domain only as diagnostic', () => {
  const s = splitByClub(rows, ['L2']).splits, model = fitContextualSynthetic(s)
  const report = evaluateSynthetic(s.test, model)
  assert.equal(report.abstentions.INSUFFICIENT_SUPPORT, s.test.length)
  const diagnostic = evaluateSynthetic(s.train, model)
  assert.ok(diagnostic.predicted > 0); assert.ok(diagnostic.metrics)
})
test('empty and numerically invalid metric inputs cannot yield false success', () => {
  assert.equal(pointMetrics([]), null)
  for (const n of [0, -1, NaN, Infinity]) assert.throws(() => pointMetrics([{ actual: n, predicted: 1 }]))
  assert.throws(() => pointMetrics([{ actual: Number.MIN_VALUE, predicted: Number.MAX_VALUE }]), /NUMERIC/)
  assert.ok(Number.isFinite(pointMetrics([{ actual: 1e308, predicted: 5e307 }, { actual: 1e308, predicted: 5e307 }])!.maeEURWeekly))
})
test('OVR does not affect split allocation, predictions or metrics', () => {
  const s = splitByClub(rows).splits, model = fitContextualSynthetic(s)
  const changed = s.test.map(r => Object.assign({ ...r }, { ovr: 99 }))
  assert.deepEqual(evaluateSynthetic(changed, model), evaluateSynthetic(s.test, model))
  assert.deepEqual(splitByClub(rows.map(r => Object.assign({ ...r }, { ovr: 1 }))).manifest.allocation,
    splitByClub(rows).manifest.allocation)
})
test('existing contextual input/gate reused; incomplete rights and real data remain blocked', () => {
  const input: ContextualInput = {
    reference: { salary: { amount: 52000, currency: 'USD', period: 'YEAR', tax: 'GROSS', component: 'BASE',
      observedAt: '2026-04-16T00:00:00Z', effectiveAt: '2026-04-16', source: 'SYNTHETIC' },
    fx: { from: 'USD', eurPerUnit: 0.9, date: '2026-04-16', source: 'SYNTHETIC_FX' }, nature: 'OBSERVED', sourceReference: 'synthetic:evidence',
    rights: { training: 'CONFIRMED', calibration: 'CONFIRMED', evidenceReference: 'synthetic:rights' },
    identity: { playerId: 'p', sourcePlayerId: 'sp', confidence: 'HIGH', evidenceReference: 'synthetic:identity' },
    context: { playerId: 'p', clubId: 'c', sourceClubId: 'c', season: '2026', sourceSeason: '2026',
      seasonStart: '2026-01-01', seasonEnd: '2026-12-31', referenceAt: '2026-04-16' } },
    leagueId: 'l', dateOfBirth: '2000-01-01', position: 'GK', positionEvidence: 'synthetic:position', guaranteedAnnualUSD: null,
    affiliation: { playingClubId: 'c', payerClubId: null, status: 'UNKNOWN', evidenceReference: null }
  }
  const prepared = prepareSyntheticEvaluationRows([input])
  assert.equal(prepared[0].salary.currency, 'USD'); assert.equal(prepared[0].position, 'GK')
  const bad = structuredClone(input); bad.reference.rights.training = 'UNKNOWN'
  assert.throws(() => prepareSyntheticEvaluationRows([bad]), /INELIGIBLE/)
  bad.reference.salary.source = 'MLSPA'
  assert.throws(() => prepareSyntheticEvaluationRows([bad]), /FORBIDDEN/)
})
