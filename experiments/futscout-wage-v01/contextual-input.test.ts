import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareContextualInput, type ContextualInput } from './contextual-input'

const fixture = (): ContextualInput => ({ leagueId: 'MLS', dateOfBirth: '2000-01-01', position: 'MID', positionEvidence: 'synthetic:position',
  guaranteedAnnualUSD: 120000, affiliation: { playingClubId: 'club', payerClubId: null, status: 'UNKNOWN', evidenceReference: null },
  reference: { salary: { amount: 100000, currency: 'USD', period: 'YEAR', tax: 'UNKNOWN', component: 'BASE',
    observedAt: '2026-10-01', effectiveAt: null, source: 'synthetic' }, nature: 'OBSERVED', sourceReference: 'synthetic:source',
    rights: { training: 'UNKNOWN', calibration: 'UNKNOWN', evidenceReference: '' },
    identity: { playerId: 'player', sourcePlayerId: '', confidence: 'HIGH', evidenceReference: 'synthetic:identity' },
    context: { playerId: 'player', clubId: 'club', sourceClubId: 'club', season: '2026', sourceSeason: '2026',
      seasonStart: '2026-01-01', seasonEnd: '2026-12-31', referenceAt: '2026-04-16' } } })
test('separate labels, age at reference and preserved blockers', () => {
  const r = prepareContextualInput(fixture())
  assert(r.features.ageYears > 26 && r.features.ageYears < 27)
  assert.equal(r.labels.baseAnnualUSD, 100000); assert.equal(r.labels.guaranteedAnnualUSD, 120000)
  assert.equal(r.labels.normalized, null); assert.equal(r.eligibility.classification, 'RIGHTS_UNKNOWN')
  assert.equal(r.trainingAllowed, false)
})
test('null, absent and zero remain distinct', () => {
  for (const [amount, state] of [[null, 'NULL'], [undefined, 'ABSENT'], [0, 'ZERO']] as const) {
    const x = fixture(); x.reference.salary.amount = amount
    assert.equal(prepareContextualInput(x).labels.baseState, state)
  }
})
test('identity and incompatible seasons rejected', () => {
  const a = fixture(); a.reference.identity.confidence = 'MEDIUM'; assert.throws(() => prepareContextualInput(a))
  const b = fixture(); b.reference.context.sourceSeason = '2025'; assert.throws(() => prepareContextualInput(b))
})
test('dates and unproven positions rejected; missing position allowed', () => {
  const a = fixture(); a.dateOfBirth = '2000-02-30'; assert.throws(() => prepareContextualInput(a))
  const b = fixture(); b.positionEvidence = null; assert.throws(() => prepareContextualInput(b))
  b.position = null; assert.equal(prepareContextualInput(b).features.position, null)
})
test('loan does not infer payer and preserves clubs', () => {
  const x = fixture(); x.affiliation = { playingClubId: 'borrower', payerClubId: null, status: 'LOAN', evidenceReference: 'synthetic:loan' }
  const r = prepareContextualInput(x); assert.equal(r.affiliation.payerClubId, null); assert.equal(r.features.clubId, 'club')
})
test('optional measurements require evidence and pre-reference dates', () => {
  const x = fixture(); x.performance = { value: 100, unit: 'minutes', effectiveAt: '2026-05-01', evidenceReference: 'synthetic:stats' }
  assert.throws(() => prepareContextualInput(x)); x.performance.effectiveAt = '2026-04-01'
  assert.equal(prepareContextualInput(x).features.performance?.value, 100)
})
test('OVR, name and player ID do not affect predictors; deterministic without mutation', () => {
  const x = fixture(); const original = structuredClone(x)
  const a = prepareContextualInput({ ...x, ...{ ovr: 99, name: 'a' } })
  x.reference.identity.playerId = 'other'; x.reference.context.playerId = 'other'
  assert.equal(a.featureHash, prepareContextualInput({ ...x, ...{ ovr: 1, name: 'b' } }).featureHash)
  assert.deepEqual(prepareContextualInput(original), prepareContextualInput(original))
})
test('invalid values and incompatible salary units rejected', () => {
  const a = fixture(); a.guaranteedAnnualUSD = -1; assert.throws(() => prepareContextualInput(a))
  const b = fixture(); b.reference.salary.currency = 'EUR'; assert.throws(() => prepareContextualInput(b))
})
