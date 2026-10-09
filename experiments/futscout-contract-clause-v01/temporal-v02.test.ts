import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepare, type ContractInput } from './contract'
import { adaptPilot } from './evidence-adapter'
import { assessTemporal, type TemporalInput, type TemporalEvent } from './temporal-v02'

const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
const ctx = { playerId: 'synthetic-player', clubId: 'synthetic-club', context: 'REAL_WORLD', season: '2026' } as const
const contract: ContractInput = { ...ctx, provider: 'SYNTHETIC', sourceReference: 'synthetic/terms',
  observedAt: '2026-10-08T12:00:00Z', providerEffectiveAt: null, signedAt: unknown,
  contractUntil: { value: '2027', datePrecision: 'YEAR' }, contractStatus: 'UNKNOWN',
  extensionOptions: [{ holder: 'UNKNOWN', until: { value: '2028', datePrecision: 'YEAR' }, conditions: null, sourceReference: 'synthetic/option' }],
  identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC',
  provenance: { evidenceReference: 'synthetic/terms', rights: 'UNKNOWN', synthetic: true },
  releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } }
const input: TemporalInput = { contract, publishedAt: { value: '2025', datePrecision: 'YEAR' },
  periodQualifier: null, competitionCalendar: null, evidenceStatus: 'OFFICIAL_EXPLICIT', verification: null, events: [] }
const asOf = '2026-10-09T00:00:00Z'
const verification: NonNullable<TemporalInput['verification']> = { at: '2026-10-08T13:00:00Z', sourceReference: 'synthetic/check', scope: 'CONTRACT_TERMS', outcome: 'CORROBORATED' }
const run = (x = input) => assessTemporal(x, ctx, asOf)
function event(kind: TemporalEvent['kind'], extra: Partial<TemporalEvent> = {}): TemporalEvent {
  return { playerId: ctx.playerId, clubId: ctx.clubId, context: ctx.context, targetContentHash: prepare(contract, ctx).contentHash,
    kind, sourceReference: 'synthetic/change', observedAt: '2026-10-08T14:00:00Z', publishedAt: unknown,
    providerEffectiveAt: '2026-10-08T14:00:00Z', evidenceStatus: 'OFFICIAL_EXPLICIT', newClubId: null,
    newUntil: unknown, optionIndex: null, ...extra }
}

for (const [datePrecision, value] of [['DAY', '2031-06-30'], ['MONTH', '2028-06'], ['YEAR', '2028'], ['UNKNOWN', null]] as const) {
  test(`v02 preserves ${datePrecision} without calendar conversion`, () => {
    const date = { value, datePrecision } as ContractInput['contractUntil']
    assert.deepEqual(run({ ...input, contract: { ...contract, contractUntil: date } }).data.contract.contractUntil, date)
  })
}
test('summer and season-end qualifiers do not add month or day', () => {
  for (const kind of ['SUMMER', 'SEASON_END'] as const) {
    const q = { kind, sourceText: 'synthetic period description', sourceReference: 'synthetic/qualifier' }
    const r = run({ ...input, periodQualifier: q })
    assert.deepEqual(r.data.periodQualifier, q); assert.equal(r.data.contract.contractUntil.value, '2027')
  }
})
test('MLS/calendar-year and cross-year contexts cannot calculate expiry', () => {
  for (const cycle of ['CALENDAR_YEAR', 'CROSS_YEAR', 'UNKNOWN'] as const) {
    const r = run({ ...input, competitionCalendar: { competitionId: 'synthetic-league', season: ctx.season, cycle, sourceReference: 'synthetic/calendar' } })
    assert.equal(r.data.contract.contractUntil.value, '2027'); assert.equal(r.assessment, 'HISTORICAL_ONLY')
  }
})
test('future expiry, ACTIVE source status and affiliation alone never prove current terms', () => {
  assert.equal(run({ ...input, contract: { ...contract, contractStatus: 'ACTIVE' } }).assessment, 'HISTORICAL_ONLY')
  assert.equal(run({ ...input, verification: { ...verification, scope: 'AFFILIATION_ONLY' } }).assessment, 'HISTORICAL_ONLY')
})
test('explicit reviewed terms corroboration is evidence, never automatic current selection', () => {
  const r = run({ ...input, verification })
  assert.equal(r.assessment, 'CURRENT_CORROBORATED'); assert.equal(r.negotiationsStatus, 'UNKNOWN')
  assert.equal(r.currentEligible, false); assert.equal(r.publicationAllowed, false); assert.equal(r.persistenceEligible, false)
  assert.equal(r.data.contract.contractStatus, 'UNKNOWN')
})
test('provisional, reported, missing terms and low identity cannot be current', () => {
  for (const evidenceStatus of ['REPORTED', 'PROVISIONAL', 'INSUFFICIENT'] as const)
    assert.equal(run({ ...input, verification, evidenceStatus }).assessment, 'INSUFFICIENT_EVIDENCE')
  assert.equal(run({ ...input, verification, contract: { ...contract, contractUntil: unknown } }).assessment, 'INSUFFICIENT_EVIDENCE')
  assert.notEqual(run({ ...input, verification, contract: { ...contract, identityConfidence: 'MEDIUM' } }).assessment, 'CURRENT_CORROBORATED')
})
test('inactive source and elapsed exact expiry cannot become current', () => {
  assert.equal(run({ ...input, verification, contract: { ...contract, contractStatus: 'INACTIVE' } }).assessment, 'HISTORICAL_ONLY')
  assert.equal(run({ ...input, verification, contract: { ...contract, contractUntil: { value: '2026-10-01', datePrecision: 'DAY' } } }).assessment, 'HISTORICAL_ONLY')
})
test('elapsed year/month prevents current status without fabricating exact expiry', () => {
  for (const date of [{ value: '2025', datePrecision: 'YEAR' }, { value: '2026-09', datePrecision: 'MONTH' }] as const) {
    const r = run({ ...input, verification, contract: { ...contract, contractUntil: date } })
    assert.equal(r.assessment, 'HISTORICAL_ONLY'); assert.deepEqual(r.data.contract.contractUntil, date)
  }
  assert.equal(run({ ...input, verification, contract: { ...contract, contractUntil: { value: '2026', datePrecision: 'YEAR' } } }).assessment, 'CURRENT_CORROBORATED')
})
test('unknown versus explicitly empty options stay distinct', () => {
  const none = run({ ...input, contract: { ...contract, extensionOptions: [] } })
  const missing = run({ ...input, contract: { ...contract, extensionOptions: null } })
  assert.deepEqual(none.data.contract.extensionOptions, []); assert.equal(missing.data.contract.extensionOptions, null)
  assert.notEqual(none.inputHash, missing.inputHash)
})
test('renewal marks old record historical, without rewriting expiry or hashes', () => {
  const before = prepare(contract, ctx)
  const r = run({ ...input, verification, events: [event('RENEWAL', { newUntil: { value: '2029', datePrecision: 'YEAR' } })] })
  assert.equal(r.assessment, 'HISTORICAL_ONLY'); assert.equal(r.data.contract.contractUntil.value, '2027')
  assert.equal(r.legacyContentHash, before.contentHash); assert.equal(r.legacyObservationHash, before.observationHash)
})
test('transfer and termination supersede old club evidence, not Player/Club', () => {
  for (const kind of ['TRANSFER', 'TERMINATION'] as const) {
    const r = run({ ...input, verification, events: [event(kind, { newClubId: kind === 'TRANSFER' ? 'synthetic-new-club' : null })] })
    assert.equal(r.assessment, 'HISTORICAL_ONLY'); assert.equal(r.data.contract.clubId, ctx.clubId)
  }
})
test('unknown or future effective event and reported event require review, no publication-date substitution', () => {
  for (const e of [event('TERMINATION', { providerEffectiveAt: null }), event('TERMINATION', { providerEffectiveAt: '2027-01-01T00:00:00Z' }), event('TERMINATION', { evidenceStatus: 'REPORTED' })])
    assert.equal(run({ ...input, verification, events: [e] }).assessment, 'INSUFFICIENT_EVIDENCE')
})
test('future contract effectiveness and an event older than its target cannot imply current terms', () => {
  assert.equal(run({ ...input, verification, contract: { ...contract, providerEffectiveAt: '2027-01-01T00:00:00Z' } }).assessment, 'INSUFFICIENT_EVIDENCE')
  const dated = { ...contract, providerEffectiveAt: '2026-10-08T15:00:00Z' }
  assert.throws(() => run({ ...input, contract: dated, events: [event('TERMINATION', { targetContentHash: prepare(dated, ctx).contentHash })] }), /PRECEDES_TARGET/)
})
test('unexercised and unknown options never extend main expiry', () => {
  assert.equal(run().data.contract.extensionOptions?.[0].until.value, '2028')
  const r = run({ ...input, verification, events: [event('OPTION_NOT_EXERCISED', { optionIndex: 0 })] })
  assert.equal(r.assessment, 'CURRENT_CORROBORATED'); assert.equal(r.data.contract.contractUntil.value, '2027')
})
test('explicit exercise needs new record and valid separate option evidence', () => {
  const exercised = event('OPTION_EXERCISED', { optionIndex: 0, newUntil: { value: '2028', datePrecision: 'YEAR' } })
  const r = run({ ...input, verification, events: [exercised] })
  assert.equal(r.assessment, 'HISTORICAL_ONLY'); assert.equal(r.data.contract.contractUntil.value, '2027')
  assert.throws(() => run({ ...input, events: [{ ...exercised, optionIndex: 1 }] }), /OPTION/)
  assert.throws(() => run({ ...input, events: [{ ...exercised, newUntil: { value: '2028-12-31', datePrecision: 'DAY' } }] }), /OPTION_DATE_CONFLICT/)
})
test('contradictory evidence always abstains, including exercise/non-exercise', () => {
  const exercise = event('OPTION_EXERCISED', { optionIndex: 0, newUntil: { value: '2028', datePrecision: 'YEAR' } })
  for (const events of [[event('CONFLICT')], [exercise, event('OPTION_NOT_EXERCISED', { optionIndex: 0 })]]) {
    const r = run({ ...input, verification, events })
    assert.equal(r.assessment, 'CONFLICTED'); assert.ok(r.abstentionReasons.includes('CONFLICT_REQUIRES_REVIEW'))
  }
  assert.equal(run({ ...input, verification: { ...verification, outcome: 'CONFLICTED' } }).assessment, 'CONFLICTED')
})
test('published, observed, effective and verification dates remain independent', () => {
  const r = run({ ...input, verification })
  assert.deepEqual(r.data.publishedAt, input.publishedAt)
  assert.equal(r.data.contract.observedAt, '2026-10-08T12:00:00.000Z')
  assert.equal(r.lastVerifiedAt, '2026-10-08T13:00:00.000Z'); assert.equal(r.data.contract.providerEffectiveAt, null)
  assert.equal(run().lastVerifiedAt, null)
})
test('invalid/future timestamps and publication chronology rejected', () => {
  for (const at of ['2026-02-30T12:00:00Z', '2026-10-10T12:00:00Z', '2026-10-07T12:00:00Z'])
    assert.throws(() => run({ ...input, verification: { ...verification, at } }))
  assert.throws(() => run({ ...input, publishedAt: { value: '2027', datePrecision: 'YEAR' } }), /PUBLICATION/)
  assert.throws(() => run({ ...input, contract: { ...contract, observedAt: null } } as unknown as TemporalInput))
})
test('context, event target, provenance and calendar mismatch rejected', () => {
  for (const change of [{ playerId: 'other' }, { clubId: 'other' }, { targetContentHash: 'wrong' }])
    assert.throws(() => run({ ...input, events: [event('TERMINATION', change)] }), /CONTEXT/)
  assert.throws(() => run({ ...input, verification: { ...verification, sourceReference: '' } }), /REFERENCE/)
  assert.throws(() => run({ ...input, competitionCalendar: { competitionId: 'MLS', season: 'wrong', cycle: 'CALENDAR_YEAR', sourceReference: 'synthetic/calendar' } }), /CONTEXT/)
  assert.throws(() => run({ ...input, contract: { ...contract, evidenceQuality: 'SECONDARY', provenance: { ...contract.provenance, synthetic: false } } }), /QUALITY/)
})
test('deterministic/idempotent assessment, no mutation, legacy hashes stable', () => {
  const copy = structuredClone(input), first = run()
  assert.deepEqual(first, run()); assert.deepEqual(input, copy)
  const verified = run({ ...input, verification })
  assert.equal(verified.legacyContentHash, first.legacyContentHash)
  assert.notEqual(verified.inputHash, first.inputHash)
  const reordered = Object.fromEntries(Object.entries(input).reverse()) as TemporalInput
  assert.equal(run(reordered).artifactHash, first.artifactHash)
  first.data.contract.clubId = 'changed'; assert.equal(input.contract.clubId, ctx.clubId)
})
test('duplicate events rejected, no duplicated confirmation', () => {
  const e = event('TERMINATION')
  assert.throws(() => run({ ...input, events: [e, e] }), /DUPLICATE_EVENT/)
})
test('four documented facts and adapter hashes remain intact; synthetic clocks never become real observations', () => {
  const dir = 'audit/output/contract-evidence-pilot-20261008/'
  const pilot = adaptPilot(readFileSync(dir + 'selection.json'), readFileSync(dir + 'evidence.json'))
  assert.equal(pilot.artifactHash, 'd5c6c10f44a93780731bf093c5798d265a3f1f042d15f1ff9ef427e3c371f033')
  for (const [name, value, precision] of [['Lamine Yamal', '2031-06-30', 'DAY'], ['Harry Kane', '2027-06-30', 'DAY'], ['Frederik Lauenborg', '2028', 'YEAR'], ['Miguel Almirón', '2027', 'YEAR']]) {
    const r = pilot.records.find(r => r.provenance.sourceEvidence.name === name)!
    assert.deepEqual(r.draft.contractUntil, { value, datePrecision: precision })
    // Only the documented date/options are applied to a clearly synthetic identity.
    const q = name === 'Frederik Lauenborg' ? { kind: 'SUMMER' as const, sourceText: 'summer 2028', sourceReference: 'synthetic/qualifier' } : null
    const result = run({ ...input, periodQualifier: q, contract: { ...contract, contractUntil: r.draft.contractUntil } })
    assert.deepEqual(result.data.contract.contractUntil, r.draft.contractUntil)
    assert.equal(r.draft.observedAt, null); assert.equal(r.draft.releaseClause.status, 'UNKNOWN')
    if (name === 'Miguel Almirón') assert.deepEqual(r.draft.extensionOptions?.[0].until, { value: '2028', datePrecision: 'YEAR' })
  }
})
