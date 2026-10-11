import test from 'node:test'
import assert from 'node:assert/strict'
import { assessReference, type Reference } from './reference-eligibility'
const fixture = (): Reference => ({
  salary: { amount: 52000, currency: 'EUR', period: 'YEAR', tax: 'GROSS', component: 'BASE',
    source: 'SYNTHETIC', observedAt: '2026-10-08T00:00:00Z', effectiveAt: '2026-07-01' },
  nature: 'OBSERVED', sourceReference: 'synthetic/source',
  rights: { training: 'CONFIRMED', calibration: 'CONFIRMED', evidenceReference: 'synthetic/license' },
  identity: { playerId: 'synthetic-player', sourcePlayerId: 'synthetic-provider-id', confidence: 'HIGH', evidenceReference: 'synthetic/identity' },
  context: { playerId: 'synthetic-player', clubId: 'synthetic-club', sourceClubId: 'synthetic-club', season: '2026-27',
    sourceSeason: '2026-27', seasonStart: '2026-07-01', seasonEnd: '2027-06-30', referenceAt: '2026-10-01' },
})
test('eligible observed gross base normalizes to EUR/week; provider estimate remains distinct', () => {
  const r = fixture(), a = assessReference(r)
  assert.equal(a.classification, 'ELIGIBLE'); assert.equal(a.normalized?.amountEURWeekly, 1000)
  assert.equal(a.publicationAllowed, false)
  r.nature = 'PROVIDER_ESTIMATE'
  assert.equal(assessReference(r).nature, 'PROVIDER_ESTIMATE'); assert.notEqual(assessReference(r).inputHash, a.inputHash)
})
for (const status of ['UNKNOWN', 'RESTRICTED'] as const) test(`rights ${status} block training and calibration`, () => {
  for (const field of ['training', 'calibration'] as const) {
    const r = fixture(); r.rights[field] = status
    const result = assessReference(r); assert.equal(result.classification, 'RIGHTS_UNKNOWN')
    assert.equal(result.reasons[0].code, status === 'RESTRICTED' ? 'RIGHTS_RESTRICTED' : 'RIGHTS_NOT_DOCUMENTED')
  }
})
test('license and identity require evidence; source identity is not name-only', () => {
  let r = fixture(); r.rights.evidenceReference = ''; assert.equal(assessReference(r).classification, 'RIGHTS_UNKNOWN')
  for (const field of ['confidence', 'evidenceReference', 'sourcePlayerId', 'playerId'] as const) {
    r = fixture()
    if (field === 'confidence') r.identity.confidence = 'MEDIUM'
    else r.identity[field] = ''
    assert.equal(assessReference(r).classification, 'IDENTITY_INSUFFICIENT')
  }
})
for (const component of ['BONUS', 'TOTAL', 'UNKNOWN'] as const) test(`component ${component} not base`, () => {
  const r = fixture(); r.salary.component = component
  assert.equal(assessReference(r).classification, 'SEMANTICS_INCOMPATIBLE')
})
test('net or unknown tax and unknown unit/currency rejected', () => {
  for (const tax of ['NET', 'UNKNOWN'] as const) { const r = fixture(); r.salary.tax = tax; assert.equal(assessReference(r).classification, 'SEMANTICS_INCOMPATIBLE') }
  const r = fixture(); r.salary.period = 'UNKNOWN'; assert.equal(assessReference(r).classification, 'SEMANTICS_INCOMPATIBLE')
  r.salary.period = 'YEAR'; r.salary.currency = 'ZZZ'; assert.equal(assessReference(r).classification, 'SEMANTICS_INCOMPATIBLE')
})
test('club, season, effective time and invalid calendar dates cannot be inferred', () => {
  for (const mutate of [(r: Reference) => { r.context.sourceClubId = 'other' },
    (r: Reference) => { r.context.sourceSeason = '2025' }, (r: Reference) => { r.salary.effectiveAt = null },
    (r: Reference) => { r.salary.effectiveAt = '2026-02-30' }, (r: Reference) => { r.context.referenceAt = '2025-01-01' },
    (r: Reference) => { r.salary.observedAt = '2025-01-01' }]) {
    const r = fixture(); mutate(r); assert.equal(assessReference(r).classification, 'TEMPORAL_MISMATCH')
  }
})
test('null, absent and zero stay distinct; zero is excluded from log labels', () => {
  const results = [undefined, null, 0].map(amount => { const r = fixture(); r.salary.amount = amount; return assessReference(r) })
  assert.deepEqual(results.map(r => r.amountState), ['ABSENT', 'NULL', 'ZERO'])
  assert(results.every(r => r.classification === 'INVALID_VALUE'))
  assert.equal(results[2].normalized?.amountEURWeekly, 0)
  assert.equal(new Set(results.map(r => r.inputHash)).size, 3)
})
test('negative, non-finite and overflow amounts rejected without fabricated hash', () => {
  for (const amount of [-1, NaN, Infinity]) { const r = fixture(); r.salary.amount = amount; assert.equal(assessReference(r).classification, 'INVALID_VALUE') }
  const r = fixture(); r.salary.currency = 'USD'; r.salary.amount = Number.MAX_VALUE
  r.fx = { from: 'USD', eurPerUnit: 2, date: '2026-10-01', source: 'SYNTHETIC' }
  assert.equal(assessReference(r).classification, 'INVALID_VALUE')
})
test('dated FX normalization; absent FX rejected', () => {
  const r = fixture(); r.salary.currency = 'USD'
  assert.equal(assessReference(r).classification, 'INVALID_VALUE')
  r.fx = { from: 'USD', eurPerUnit: 0.9, date: '2026-10-01', source: 'SYNTHETIC' }
  assert.equal(assessReference(r).normalized?.amountEURWeekly, 900)
})
test('deterministic hashes, no mutation and no ambient clock', () => {
  const r = fixture(), snapshot = JSON.stringify(r), a = assessReference(r)
  assert.deepEqual(a, assessReference({ ...r, context: { ...r.context } }))
  assert.equal(JSON.stringify(r), snapshot); assert.match(a.resultHash, /^[a-f0-9]{64}$/)
})
