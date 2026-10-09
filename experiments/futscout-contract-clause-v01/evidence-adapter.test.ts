import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptEvidence, adaptPilot, type Evidence } from './evidence-adapter'

// Entirely synthetic inputs; adapter provenance output is not a real observation.
const selected = { id: 'synthetic-player', name: 'Synthetic Player', dob: '2000-01-01', club: 'Synthetic Club' }
const record: Evidence = { selectionPosition: 1, playerId: selected.id, name: selected.name,
  source: 'https://example.test/synthetic', sourceClub: selected.club, evidenceQuality: 'PRIMARY',
  access: 'PAGE_OPENED', publishedAt: '2026-01-01', contractUntil: { value: '2028', datePrecision: 'YEAR' },
  identityEvidence: 'Synthetic fixture only', temporalAssessment: 'Synthetic fixture only' }
const run = (patch: Partial<Evidence> = {}) => adaptEvidence({ ...record, ...patch }, selected, '2026-10-08T00:00:00Z')
test('synthetic adapter preserves partial dates, unknown rights and timestamps', () => {
  const r = run(); assert.deepEqual(r.draft.contractUntil, record.contractUntil)
  assert.equal(r.draft.observedAt, null); assert.equal(r.draft.clubId, null)
  assert.equal(r.draft.provenance.rights, 'UNKNOWN'); assert.equal(r.persistenceEligible, false)
  assert.equal(r.draft.releaseClause.status, 'UNKNOWN'); assert.deepEqual(run(), r)
})
test('synthetic options remain independent; conflicts and provisional evidence block', () => {
  assert.equal(run({ extensionOptions: [{ until: { value: '2029', datePrecision: 'YEAR' }, holder: 'UNKNOWN', conditions: null }] }).draft.contractUntil.value, '2028')
  assert.equal(run({ sourceClub: 'Other Synthetic Club' }).reviewEligible, false)
  assert.equal(run({ evidenceQuality: 'PRIMARY_INDEXED_PENDING_ACCESS' }).evidenceStatus, 'PROVISIONAL')
})
test('synthetic invalid identity, date and URL rejected; frozen hashes not bypassed', () => {
  assert.throws(() => run({ playerId: 'other' }), /IDENTITY/)
  assert.throws(() => run({ contractUntil: { value: '2027-02-29', datePrecision: 'DAY' } }))
  assert.throws(() => run({ source: 'https://example.test/?token=fake' }), /UNSAFE/)
  assert.throws(() => adaptPilot(Buffer.from('{}'), Buffer.from('{}')), /SELECTION_HASH/)
})
