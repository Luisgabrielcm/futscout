import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { runOfflineWagePipeline as run, type OfflineWageInput, type OfflineWageObservation } from './offline-pipeline'

function salary(id = 'salary-2025', year = 2025, annualAmount: number | null | undefined = 52000): OfflineWageObservation {
  return {
    id, footyStatsId: 7, footyClubId: 9, season: String(year), annualAmount,
    units: { currency: 'EUR', period: 'YEAR', tax: 'GROSS', component: 'TOTAL' },
    definition: { basis: 'OWNER_DECLARED', reference: 'synthetic:owner-definition' },
    sourceReference: `synthetic:salary/${id}`, observedAt: '2026-10-29',
    seasonPeriod: null, effectiveDate: null,
    seasonEvidence: { startingYear: year, endingYear: year, calendar: 'ANNUAL', reference: `synthetic:edition/${year}` },
  }
}
function fixture(): OfflineWageInput {
  const person = { name: 'Synthetic Player', birth: '2000-01-02', nationality: 'Spain', position: 'MID' }
  const contents = JSON.stringify({ records: [{ ...person, eaId: 'ea-1', apiFootballId: 42 },
    { ...person, name: 'Other Person', eaId: 'ea-2', apiFootballId: 43 }],
    clubs: [{ footyClubId: 9, eaClubId: 'ea-club', season: '2026' }] })
  const ref = { documentId: 'synthetic', sha256: createHash('sha256').update(contents).digest('hex'), pointer: '/records/0' }
  return {
    asOf: '2026-10-29', observations: [salary()],
    identity: {
      source: { ...person, footyStatsId: 7, clubId: 9, season: '2026' },
      catalog: [{ ...person, playerId: 'local-1', eaId: 'ea-1', apiFootballId: 42, clubId: 'ea-club', season: '2026' }],
      sources: [], owners: [], documents: [{ id: 'synthetic', contents }],
      evidence: [{ eaId: 'ea-1', origin: 'API_FOOTBALL', reference: ref }], corrections: [],
      clubMaps: [{ footyClubId: 9, eaClubId: 'ea-club', season: '2026', reference: { ...ref, pointer: '/clubs/0' } }],
    },
  }
}

test('HIGH runs the existing temporal selector and converter without qualifying a label', () => {
  const data = fixture(), before = structuredClone(data), r = run(data)
  assert.equal(r.identity.candidates[0].classification, 'HIGH')
  assert.deepEqual(r.association, { footyStatsId: 7, eaId: 'ea-1', playerId: 'local-1', persisted: false })
  assert.equal(r.lastKnownRemuneration?.classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(r.lastKnownRemuneration?.assessments[0].conversion.weeklyEquivalentEur, 1000)
  assert.equal(r.lastKnownRemuneration?.assessments[0].original.playerId, '7')
  assert.equal(r.lastKnownRemuneration?.assessments[0].original.clubId, '9')
  assert.equal(r.sourceEvidence.observations[0].annualAmount, 52000)
  assert.deepEqual(r.sourceEvidence.observations[0].units, data.observations[0].units)
  assert.equal(r.sourceEvidence.observations[0].definition.basis, 'OWNER_DECLARED')
  assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.equal(r.salaryEligibility.publicationAllowed, false); assert.equal(r.writable, false)
  assert.deepEqual(data, before)
})
test('MEDIUM retains only source salary evidence, with no EA remuneration association', () => {
  const data = fixture(); data.identity.evidence = []
  const r = run(data)
  assert.equal(r.identity.candidates[0].classification, 'MEDIUM')
  assert.equal(r.association, null); assert.equal(r.lastKnownRemuneration, null)
  assert.equal(r.blockReason, 'UNIQUE_HIGH_IDENTITY_REQUIRED')
  assert.deepEqual(r.sourceEvidence.observations, data.observations)
  assert(!Object.hasOwn(r.sourceEvidence.observations[0], 'eaId'))
})
test('documentary CONFLICT preserves the diagnostic and does not attach a salary', () => {
  const data = fixture(); data.identity.evidence[0].reference.pointer = '/records/1'
  const r = run(data)
  assert.equal(r.identity.candidates[0].classification, 'CONFLICT')
  assert(r.identity.candidates[0].reasons.includes('DOCUMENT_PERSON_CONFLICT'))
  assert.equal(r.association, null); assert.equal(r.lastKnownRemuneration, null)
  assert.equal(r.sourceEvidence.observations.length, 1)
})
test('LOW and unmatched sources never acquire an EA salary', () => {
  const low = fixture(); low.identity.evidence = []; low.identity.source.birth = null
  assert.equal(run(low).identity.candidates[0].classification, 'LOW')
  assert.equal(run(low).association, null)
  const missing = fixture(); missing.identity.source.name = 'Unmatched Person'
  assert.deepEqual(run(missing).identity.candidates, [])
  assert.equal(run(missing).association, null)
})
test('homonyms and conflicting source owners fail closed', () => {
  const data = fixture()
  data.identity.catalog = [...data.identity.catalog, { ...data.identity.catalog[0], eaId: 'ea-2', playerId: 'local-2', apiFootballId: null }]
  assert.equal(run(data).association, null)
  const conflict = fixture(); conflict.identity.owners = [{ footyStatsId: 7, eaId: 'other' }]
  assert.equal(run(conflict).association, null)
})
test('empty salaries, null, absent and observed zero retain their different meanings', () => {
  for (const annualAmount of [null, undefined, 0]) {
    const data = fixture()
    const row = { ...salary(), annualAmount }
    const r = run({ ...data, observations: [row] })
    assert.equal(r.lastKnownRemuneration?.selectedObservationId, null)
    assert.equal(r.sourceEvidence.observations[0].annualAmount, annualAmount)
    assert.equal(r.lastKnownRemuneration?.assessments[0].conversion.state, annualAmount === null ? 'NULL' : annualAmount === undefined ? 'ABSENT' : 'ZERO')
  }
  assert.equal(run({ ...fixture(), observations: [] }).lastKnownRemuneration?.selectedObservationId, null)
})
test('multiple seasons preserve history and later null without imputation', () => {
  const r = run({ ...fixture(), observations: [salary('old', 2023, 26000), salary('latest', 2025, 104000), salary('null', 2026, null)] })
  assert.equal(r.lastKnownRemuneration?.selectedObservationId, 'latest')
  assert.equal(r.lastKnownRemuneration?.classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(r.lastKnownRemuneration?.assessments.find(a => a.observationId === 'old')?.classification, 'HISTORICAL_ONLY')
  assert.equal(r.sourceEvidence.observations.find(a => a.id === 'null')?.annualAmount, null)
  assert.equal(r.sourceEvidence.observations.length, 3)
})
test('personal HIGH does not validate historical club context', () => {
  const data = fixture(); data.identity.catalog[0].clubId = 'different-ea-club'
  const r = run({ ...data, observations: [{ ...salary(), footyClubId: 8 }] })
  assert.equal(r.identity.candidates[0].classification, 'HIGH')
  assert.equal(r.clubTemporalContext.candidates[0].state, 'INCOMPATIBLE')
  assert.equal(r.clubTemporalContext.currentClubConfirmed, false)
  assert.equal(r.lastKnownRemuneration?.classification, 'HISTORICAL_ONLY')
  assert.equal(r.salaryEligibility.trainingAllowed, false)
})
test('same-season conflicting salaries remain conflicts, not current wages', () => {
  const r = run({ ...fixture(), observations: [salary('a'), salary('b', 2025, 104000)] })
  assert.equal(r.lastKnownRemuneration?.classification, 'CONFLICT')
  assert.equal(r.lastKnownRemuneration?.selectedObservationId, null)
  assert.equal(r.salaryEligibility.publicationAllowed, false)
})
test('explicit confirmation is required for current validity and still does not grant eligibility', () => {
  const r = run({ ...fixture(), confirmations: [{ observationId: 'salary-2025', footyClubId: 9, annualGrossEur: 52000,
    observedAt: '2026-01-01', validity: { start: '2025-01-01', end: '2026-12-31', reference: 'synthetic:confirmed-amount' } }] })
  assert.equal(r.lastKnownRemuneration?.classification, 'CONFIRMED_CURRENT')
  assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.equal(r.salaryEligibility.publicationAllowed, false)
})
test('incompatible units are retained, never converted or silently skipped', () => {
  for (const units of [
    { ...salary().units, currency: 'USD' }, { ...salary().units, period: 'WEEK' as const },
    { ...salary().units, tax: 'NET' as const }, { ...salary().units, component: 'BASE' as const },
  ]) {
    const row = { ...salary('new', 2026), units }
    const r = run({ ...fixture(), observations: [salary(), row] })
    assert.equal(r.lastKnownRemuneration, null); assert.equal(r.association, null)
    assert.equal(r.blockReason, 'INCOMPATIBLE_SALARY_UNITS_OR_DEFINITION')
    assert.deepEqual(r.incompatibleObservationIds, ['new'])
    assert.deepEqual(r.sourceEvidence.observations.find(o => o.id === 'new'), row)
  }
})
test('mixed players, duplicate salary IDs and unbound confirmations are rejected', () => {
  assert.throws(() => run({ ...fixture(), observations: [{ ...salary(), footyStatsId: 8 }] }), /SALARY_SOURCE_ID_MISMATCH/)
  assert.throws(() => run({ ...fixture(), observations: [salary(), salary()] }), /DUPLICATE_SALARY_ID/)
  assert.throws(() => run({ ...fixture(), observations: [{ ...salary(), footyClubId: -1 }] }), /INVALID_FOOTYSTATS_CLUB_ID/)
  assert.throws(() => run({ ...fixture(), confirmations: [{ observationId: 'absent', footyClubId: 9, annualGrossEur: 52000,
    observedAt: '2026-01-01', validity: { start: '2025-01-01', end: '2026-12-31', reference: 'synthetic:proof' } }] }), /UNKNOWN_SALARY_CONFIRMATION/)
})
test('invalid annual amounts use the existing converter errors without coercion', () => {
  for (const annualAmount of [-1, Infinity, NaN])
    assert.throws(() => run({ ...fixture(), observations: [{ ...salary(), annualAmount }] }), /WAGE_ANNUAL_AMOUNT/)
})
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
}
test('frozen inputs, array permutations and repeated executions are deterministic', () => {
  const data = fixture()
  data.identity.catalog = [...data.identity.catalog, { ...data.identity.catalog[0], playerId: 'other', eaId: 'other', apiFootballId: 43, name: 'Another Person' }]
  data.identity.evidence = [...data.identity.evidence, { ...data.identity.evidence[0], origin: 'OFFICIAL' }]
  const full: OfflineWageInput = { ...data, observations: [salary('old', 2023), salary('new', 2025)],
    events: [{ kind: 'RENEWAL', date: '2024-01-01', observedAt: '2024-01-01', reference: 'synthetic:event-1' },
      { kind: 'RENEWAL', date: '2026-01-01', observedAt: '2026-01-01', reference: 'synthetic:event-2' }] }
  const before = structuredClone(full); freeze(full)
  const r = run(full)
  assert.deepEqual(r, run(full))
  assert.deepEqual(r, run({ ...full, observations: [...full.observations].reverse(), events: [...full.events!].reverse(),
    identity: { ...full.identity, catalog: [...full.identity.catalog].reverse(), evidence: [...full.identity.evidence].reverse() } }))
  assert.deepEqual(full, before)
})
