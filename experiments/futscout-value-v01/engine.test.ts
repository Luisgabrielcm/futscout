import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonical, sha256, inputHash, fitOffline, infer, validateSplits, type Dataset, type Inputs, type Position, type Split } from './engine'
import { evaluate, trainFrozenDataset } from './pipeline'

// Entirely invented identities, inputs and labels; no provider data in fixtures.
function fixture(positionEffect = false): Dataset {
  const rows: Dataset['rows'] = [], assignments: Dataset['assignments'] = []
  const groups: Position[] = ['GK', 'DEF', 'MID', 'ATT'], codes = ['GK', 'CB', 'CM', 'ST']
  for (const [splitIndex, split] of (['train', 'calibration', 'holdout', 'unseen_leagues'] as Split[]).entries()) {
    for (let i = 0; i < 48; i++) {
      const playerId = `${split}-${i}`, g = i % 4
      const dateOfBirth = new Date(Date.UTC(1990 + i % 17, i % 12, 1)).toISOString(), referenceAt = '2026-10-08T00:00:00.000Z'
      const inputs: Inputs = { playerId, externalId: `synthetic-${splitIndex}-${i}`, ovr: 55 + i % 35, dateOfBirth, referenceAt,
        ageYears: (Date.parse(referenceAt) - Date.parse(dateOfBirth)) / (365.2425 * 86400000), position: codes[g], positionGroup: groups[g],
        clubId: `club-${split}-${Math.floor(i / 4)}`, clubGroup: `LOCAL:club-${split}-${Math.floor(i / 4)}`, leagueId: split === 'unseen_leagues' ? 'league-unseen' : 'league-development' }
      const value = Math.exp(8 + 0.09 * inputs.ovr - 0.06 * inputs.ageYears + (positionEffect ? [0, -0.3, 0.1, 0.4][g] : 0))
      rows.push({ playerId, inputs, inputHash: inputHash(inputs), target: { amountEUR: value.toFixed(2), currency: 'EUR', provider: 'SYNTHETIC', identityConfidence: 'HIGH' } })
      assignments.push({ playerId, clubGroup: inputs.clubGroup, leagueId: inputs.leagueId, split })
    }
  }
  return { source: 'SYNTHETIC', version: 'synthetic-fixture-v1', manifestHash: sha256('synthetic-fixture-v1'), rows, assignments }
}
const changed = (d: Dataset, f: (d: Dataset) => void) => { const copy = structuredClone(d); f(copy); return copy }
test('A recovers synthetic log-linear law and is deterministic', () => {
  const d = fixture(), a = fitOffline(d, 'A'), b = fitOffline(d, 'A')
  assert.deepEqual(a, b); assert.equal(a.featureOrder.length, 3); assert.equal(a.publicationAllowed, false)
  const p = infer(a, d.rows[0].inputs); assert(p.prediction !== null)
  assert(Math.abs(p.prediction / Number(d.rows[0].target.amountEUR) - 1) < 1e-6)
  assert.equal(p.inputHash, d.rows[0].inputHash); assert.equal(p.identityConfidence, null)
})
test('B recovers invented position effect with GK reference, A has only OVR/age', () => {
  const d = fixture(true), a = fitOffline(d, 'A'), b = fitOffline(d, 'B')
  const held = d.rows.filter(r => r.playerId.startsWith('holdout'))
  assert.equal(b.coefficients.length, 6)
  assert(evaluate(b, held, 'SYNTHETIC').maeLog! < 1e-6)
  assert(evaluate(a, held, 'SYNTHETIC').maeLog! > 0.01)
})
test('input and artifact hashes ignore object/row ordering but detect changes', () => {
  const d = fixture(), a = fitOffline(d, 'A')
  const reversed = Object.fromEntries(Object.entries(d.rows[0].inputs).reverse()) as Inputs
  assert.equal(inputHash(reversed), d.rows[0].inputHash)
  assert.deepEqual(fitOffline({ ...d, rows: [...d.rows].reverse(), assignments: [...d.assignments].reverse() }, 'A'), a)
  assert.throws(() => infer({ ...a, coefficients: [999, ...a.coefficients.slice(1)] }, d.rows[0].inputs), /ARTIFACT_HASH/)
})
test('invalid OVR/DOB/age/position and legacy fields abstain, never impute', () => {
  const d = fixture(), a = fitOffline(d, 'A'), x = d.rows[0].inputs
  for (const patch of [{ ovr: null }, { ovr: NaN }, { ovr: 100 }, { dateOfBirth: '2026-02-30T00:00:00.000Z' }, { ageYears: -1 }, { ageYears: x.ageYears + 1 }, { positionGroup: 'OTHER' }, { marketValue: 100 }, { legacyPotential: 99 }]) {
    const p = infer(a, { ...x, ...patch } as Inputs); assert.equal(p.prediction, null); assert.equal(p.abstentionReason, 'INVALID_INPUT')
  }
})
test('outside train range abstains without invented accuracy thresholds', () => {
  const d = fixture(), a = fitOffline(d, 'A')
  assert.equal(infer(a, { ...d.rows[0].inputs, ovr: 99 }).abstentionReason, 'OUTSIDE_TRAIN_RANGE')
})
test('calibrated intervals are ordered and finite', () => {
  const d = fixture(true), a = fitOffline(d, 'A'), p = infer(a, d.rows[0].inputs)
  assert(p.predictionInterval && p.prediction !== null)
  const levels = ['0.5', '0.8', '0.9'].map(k => p.predictionInterval![k]!)
  for (const q of levels) assert(q.lower <= p.prediction && q.upper >= p.prediction)
  assert(levels[2].lower <= levels[1].lower && levels[1].lower <= levels[0].lower)
  assert(levels[2].upper >= levels[1].upper && levels[1].upper >= levels[0].upper)
})
test('calibration and holdout labels cannot change train coefficients/scales', () => {
  const d = fixture(), a = fitOffline(d, 'A')
  const b = fitOffline(changed(d, c => { for (const r of c.rows) if (!r.playerId.startsWith('train-')) r.target.amountEUR = '99999999.00' }), 'A')
  assert.deepEqual(a.coefficients, b.coefficients); assert.deepEqual(a.normalization, b.normalization)
  const onlyTest = fitOffline(changed(d, c => { for (const r of c.rows) if (/^(holdout|unseen)/.test(r.playerId)) r.target.amountEUR = '99999999.00' }), 'A')
  assert.deepEqual(a, onlyTest)
})
test('duplicate player and input hash mismatch rejected', () => {
  const d = fixture()
  assert.throws(() => validateSplits(changed(d, c => { c.rows[1] = c.rows[0] })), /DUPLICATE/)
  assert.throws(() => validateSplits(changed(d, c => { c.rows[0].inputs.ovr++ })), /INPUT_HASH/)
})
test('club overlap rejected', () => {
  const d = changed(fixture(), c => {
    const r = c.rows[48]; r.inputs.clubGroup = c.rows[0].inputs.clubGroup; r.inputHash = inputHash(r.inputs); c.assignments[48].clubGroup = r.inputs.clubGroup
  })
  assert.throws(() => validateSplits(d), /CLUB_LEAKAGE/)
})
test('unseen league overlap rejected', () => {
  const d = changed(fixture(), c => { const r = c.rows[144]; r.inputs.leagueId = 'league-development'; r.inputHash = inputHash(r.inputs); c.assignments[144].leagueId = r.inputs.leagueId })
  assert.throws(() => validateSplits(d), /LEAGUE_LEAKAGE/)
})
test('zero/null/negative/wrong currency and provider labels rejected', () => {
  for (const patch of [{ amountEUR: '0.00' }, { amountEUR: null }, { amountEUR: '-1.00' }, { currency: 'USD' }, { identityConfidence: 'MEDIUM' }, { provider: 'LIVE_FOOTBALL' }]) {
    const d = changed(fixture(), c => { Object.assign(c.rows[0].target, patch) }); assert.throws(() => fitOffline(d, 'A'), /TARGET/)
  }
})
test('rank deficient design rejected without silent ridge or retry', () => {
  const d = changed(fixture(), c => { for (const r of c.rows) { r.inputs.ovr = 70; r.inputHash = inputHash(r.inputs) } })
  assert.throws(() => fitOffline(d, 'A'), /CONSTANT_FEATURE/)
})
test('real training gate rejects before accessing real labels or files', () => {
  assert.throws(() => trainFrozenDataset('DOES_NOT_EXIST'), /LIVE_FOOTBALL_TRAINING_LICENSE_PENDING/)
  assert.throws(() => fitOffline({ source: 'LIVE_FOOTBALL' } as Dataset, 'A'), /LIVE_FOOTBALL_TRAINING_LICENSE_PENDING/)
})
test('canonicalization rejects undefined and nonfinite values', () => {
  assert.throws(() => canonical({ x: Infinity })); assert.throws(() => canonical({ x: undefined }))
})
