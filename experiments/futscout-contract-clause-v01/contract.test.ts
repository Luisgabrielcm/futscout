import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, normalizeClause, prepare, simulateClause, validateDate, type ContractInput, type Clause } from './contract'

const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
const context = { playerId: 'synthetic-player', clubId: 'synthetic-club', context: 'REAL_WORLD', season: '2026-27' } as const
const clause: Clause = { status: 'UNKNOWN', amount: null, currency: null, clauseType: null,
  activationConditions: null, sourceReference: null, explicitEvidence: null }
const input: ContractInput = { ...context, provider: 'SYNTHETIC', sourceReference: 'synthetic/contract-1',
  observedAt: '2026-10-08T12:00:00Z', providerEffectiveAt: null, signedAt: unknown,
  contractUntil: { value: '2028-06', datePrecision: 'MONTH' }, contractStatus: 'UNKNOWN',
  extensionOptions: null, identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC',
  provenance: { evidenceReference: 'synthetic/contract-1', rights: 'UNKNOWN', synthetic: true }, releaseClause: clause }
const reported: Clause = { status: 'REPORTED', amount: '1250000.10', currency: 'EUR', clauseType: 'BUYOUT',
  activationConditions: null, sourceReference: 'synthetic/clause-1', explicitEvidence: 'Synthetic report of a buyout.' }

for (const [precision, value] of [['DAY', '2028-02-29'], ['MONTH', '2028-06'], ['YEAR', '2028']] as const) {
  test(`${precision} preserved without invented precision`, () => {
    const date = { value, datePrecision: precision }
    assert.deepEqual(prepare({ ...input, contractUntil: date }, context).data.contractUntil, date)
  })
}
test('invalid dates and precision combinations rejected', () => {
  for (const value of ['2027-02-29', '2028-02-30', '2028-13-01', '0000-01-01'])
    assert.throws(() => validateDate({ value, datePrecision: 'DAY' }))
  assert.throws(() => validateDate({ value: '2028-00', datePrecision: 'MONTH' }))
  assert.throws(() => validateDate({ value: '2028-01', datePrecision: 'YEAR' }))
  assert.throws(() => validateDate({ value: '-', datePrecision: 'DAY' }))
})
test('unknown expiry and effective date stay null', () => {
  const result = prepare({ ...input, contractUntil: unknown }, context)
  assert.deepEqual(result.data.contractUntil, unknown)
  assert.equal(result.data.providerEffectiveAt, null)
})
test('status preserved, never inferred from future expiry', () => {
  for (const contractStatus of ['ACTIVE', 'INACTIVE', 'UNKNOWN'] as const)
    assert.equal(prepare({ ...input, contractStatus }, context).data.contractStatus, contractStatus)
  assert.throws(() => prepare({ ...input, contractStatus: 'OTHER' } as unknown as ContractInput, context))
})
test('extension is separate, not automatically applied; unknown versus none', () => {
  const option = { holder: 'CLUB', until: { value: '2029', datePrecision: 'YEAR' }, conditions: 'Mutual written approval', sourceReference: 'synthetic/option-1' } as const
  const result = prepare({ ...input, extensionOptions: [option] }, context)
  assert.deepEqual(result.data.extensionOptions, [option])
  assert.deepEqual(result.data.contractUntil, input.contractUntil)
  assert.notEqual(result.contentHash, prepare({ ...input, extensionOptions: [] }, context).contentHash)
  assert.notEqual(prepare({ ...input, extensionOptions: [] }, context).contentHash, prepare(input, context).contentHash)
})
test('confirmed/reported clauses retain exact amount and evidence', () => {
  for (const status of ['CONFIRMED', 'REPORTED'] as const) {
    const result = normalizeClause({ ...reported, status, amount: '999999999999999999.99' })
    assert.equal(result.amount, '999999999999999999.99')
    assert.equal(result.status, status)
  }
  assert.equal(normalizeClause({ ...reported, amount: '00012.1' }).amount, '12.10')
})
test('unknown, confirmed none and zero are distinct', () => {
  assert.equal(normalizeClause(clause).amount, null)
  assert.equal(normalizeClause({ ...reported, amount: '0' }).amount, '0.00')
  const none = { ...clause, status: 'CONFIRMED_NONE', sourceReference: 'synthetic/none', explicitEvidence: 'Explicit synthetic statement: no clause.' } as const
  assert.equal(normalizeClause(none).status, 'CONFIRMED_NONE')
  assert.throws(() => normalizeClause({ ...none, explicitEvidence: null }))
  assert.throws(() => normalizeClause({ ...clause, amount: '0', currency: 'EUR' }))
  assert.throws(() => normalizeClause({ ...reported, amount: '-' }))
})
test('existence may be reported without disclosing amount', () => {
  assert.equal(normalizeClause({ ...reported, amount: null, currency: null }).amount, null)
})
test('invalid amounts and currencies rejected, no floating conversion', () => {
  for (const amount of ['-1', 'NaN', 'Infinity', '1e6', '1,000', '1.001', '1000000000000000000'])
    assert.throws(() => normalizeClause({ ...reported, amount }))
  for (const currency of ['eur', 'ZZZ', '$', '', null])
    assert.throws(() => normalizeClause({ ...reported, currency }))
  assert.throws(() => normalizeClause({ ...reported, amount: 12 } as unknown as Clause))
})
test('missing evidence, invalid reference and invalid provenance rejected', () => {
  assert.throws(() => normalizeClause({ ...reported, sourceReference: null }))
  assert.throws(() => normalizeClause({ ...reported, explicitEvidence: '' }))
  assert.throws(() => prepare({ ...input, sourceReference: 'https://example.test/?token=fake' }, context))
  assert.throws(() => prepare({ ...input, provenance: { ...input.provenance, synthetic: false } }, context))
})
test('identity confidence never upgrades evidence or publication', () => {
  const result = prepare({ ...input, evidenceQuality: 'UNVERIFIED', provenance: { ...input.provenance, synthetic: false } }, context)
  assert.equal(result.data.identityConfidence, 'HIGH')
  assert.equal(result.data.evidenceQuality, 'UNVERIFIED')
  assert.equal(result.currentEligible, false); assert.equal(result.publicationAllowed, false)
})
test('timestamps validated and normalized, not invented', () => {
  assert.equal(prepare(input, context).data.observedAt, '2026-10-08T12:00:00.000Z')
  for (const observedAt of ['2026-02-30T12:00:00Z', '2026-01-01', '2026-01-01T24:00:00Z'])
    assert.throws(() => prepare({ ...input, observedAt }, context))
})
test('canonical hashes deterministic and observation independent of state', () => {
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }))
  assert.throws(() => hash({ x: undefined })); assert.throws(() => hash(NaN))
  const first = prepare(input, context)
  assert.deepEqual(first, prepare(input, context))
  const next = prepare({ ...input, observedAt: '2026-10-09T12:00:00Z' }, context)
  assert.equal(first.contentHash, next.contentHash)
  assert.notEqual(first.observationHash, next.observationHash)
  assert.notEqual(first.contentHash, prepare({ ...input, contractStatus: 'INACTIVE' }, context).contentHash)
})
test('player, club, season and source context cannot cross', () => {
  for (const key of ['playerId', 'clubId', 'season', 'context'] as const)
    assert.throws(() => prepare(input, { ...context, [key]: 'different' } as typeof context), /CONTEXT/)
})
test('simulation always abstains without approved model, including zero', () => {
  assert.equal(simulateClause({}).abstentionReason, 'INVALID_OR_MISSING_INPUT')
  for (const marketValue of ['0', '1000000']) {
    const result = simulateClause({ ...context, marketValue, currency: 'EUR' })
    assert.equal(result.abstentionReason, 'NO_APPROVED_MODEL')
    assert.equal(result.prediction, null); assert.equal(result.currentEligible, false)
    assert.equal(result.kind, 'HYPOTHETICAL_SIMULATION')
    assert.deepEqual(result, simulateClause({ ...context, marketValue, currency: 'EUR' }))
  }
  assert.equal(simulateClause({ ...context, marketValue: '-1', currency: 'EUR' }).prediction, null)
})
test('caller objects are not mutated or shared with prepared evidence', () => {
  const before = structuredClone(input)
  const result = prepare(input, context)
  result.data.provenance.evidenceReference = 'synthetic/changed'
  assert.deepEqual(input, before)
})
