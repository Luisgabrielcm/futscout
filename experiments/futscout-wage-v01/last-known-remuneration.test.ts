import test from 'node:test'
import assert from 'node:assert/strict'
import { selectLastKnownRemuneration as select, type RemunerationInput, type RemunerationObservation } from './last-known-remuneration'

const observation = (patch: Partial<RemunerationObservation> = {}): RemunerationObservation => ({
  id: 'a', playerId: 'p', clubId: 'club', season: '2025', annualGrossEur: 52000,
  sourceReference: 'synthetic:salary', observedAt: '2025-12-31',
  seasonPeriod: { start: '2025-01-01', end: '2025-12-31', reference: 'synthetic:calendar' }, ...patch,
})
const input = (patch: Partial<RemunerationInput> = {}): RemunerationInput => ({
  playerId: 'p', asOf: '2026-06-01', currentClubId: 'club', personalIdentity: 'HIGH',
  observations: [observation()], ...patch,
})
const proof = { observationId: 'a', clubId: 'club', annualGrossEur: 52000, observedAt: '2026-01-01',
  validity: { start: '2025-01-01', end: '2026-12-31', reference: 'synthetic:contract-amount' } }

test('last known is unverified; weekly conversion does not grant eligibility', () => {
  const r = select(input())
  assert.equal(r.classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(r.assessments[0].conversion.weeklyEquivalentEur, 1000)
  assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.equal(r.salaryEligibility.publicationAllowed, false)
})
test('later null, missing and zero do not impute or replace a positive reference', () => {
  for (const annualGrossEur of [null, undefined, 0]) {
    const newer = observation({ id: 'b', annualGrossEur, season: '2026', observedAt: '2026-05-01',
      seasonPeriod: { start: '2026-01-01', end: '2026-12-31', reference: 'synthetic:calendar' } })
    const r = select(input({ observations: [observation(), newer] }))
    assert.equal(r.selectedObservationId, 'a')
    assert.equal(r.assessments[1].original.annualGrossEur, annualGrossEur)
    assert.equal(r.assessments[1].classification, null)
  }
})
test('no positive reference is absence, not a manufactured state or zero', () => {
  const r = select(input({ observations: [observation({ annualGrossEur: null })] }))
  assert.equal(r.selectedObservationId, null); assert.equal(r.classification, null)
})
test('explicit amount, club and validity confirm temporal status only', () => {
  const r = select(input({ confirmations: [proof], personalIdentity: 'UNKNOWN' }))
  assert.equal(r.classification, 'CONFIRMED_CURRENT')
  assert.equal(r.personalIdentity, 'UNKNOWN'); assert.equal(r.salaryEligibility.trainingAllowed, false)
  assert.equal(select(input({ confirmations: [proof], currentClubId: null })).classification, 'LAST_KNOWN_UNVERIFIED')
})
test('club change and expired salary validity are historical', () => {
  assert.equal(select(input({ currentClubId: 'other' })).classification, 'HISTORICAL_ONLY')
  assert.equal(select(input({ confirmations: [{ ...proof, validity: { ...proof.validity, end: '2025-12-31' } }] })).classification, 'HISTORICAL_ONLY')
})
test('transfer or termination breaks old confirmation; no silent continuity', () => {
  for (const kind of ['TRANSFER', 'TERMINATION'] as const) {
    assert.equal(select(input({ confirmations: [proof], events: [{ kind, date: '2026-02-01', observedAt: '2026-02-01', reference: 'synthetic:event' }] })).classification, 'HISTORICAL_ONLY')
  }
})
test('renewal alone does not confirm amount; new explicit evidence can cover it', () => {
  const events = [{ kind: 'RENEWAL' as const, date: '2026-02-01', observedAt: '2026-02-01', reference: 'synthetic:renewal' }]
  assert.equal(select(input({ confirmations: [proof], events })).classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(select(input({ confirmations: [{ ...proof, observedAt: '2026-02-01', validity: { ...proof.validity, start: '2026-02-01' } }], events })).classification, 'CONFIRMED_CURRENT')
})
test('contradictory explicit amounts or clubs are conflicts', () => {
  for (const wrong of [{ ...proof, annualGrossEur: 53000 }, { ...proof, clubId: 'other' }]) {
    const r = select(input({ confirmations: [proof, wrong] }))
    assert.equal(r.classification, 'CONFLICT'); assert.equal(r.selectedObservationId, null)
  }
})
test('later documented season supersedes old reference even for same amount', () => {
  const newer = observation({ id: 'b', season: '2026', observedAt: '2026-05-01',
    seasonPeriod: { start: '2026-01-01', end: '2026-12-31', reference: 'synthetic:calendar' } })
  const r = select(input({ observations: [newer, observation()] }))
  assert.equal(r.selectedObservationId, 'b'); assert.equal(r.assessments[0].classification, 'HISTORICAL_ONLY')
})
test('overlapping season calendars cannot be ordered by label or collection date', () => {
  const b = observation({ id: 'b', season: '2025/2026', seasonPeriod: { start: '2025-07-01', end: '2026-06-30', reference: 'synthetic:calendar' } })
  assert.equal(select(input({ observations: [observation(), b] })).classification, 'CONFLICT')
})
test('missing temporal evidence abstains from choosing between positives', () => {
  assert.equal(select(input({ observations: [observation(), observation({ id: 'b', seasonPeriod: null })] })).classification, 'CONFLICT')
})
test('same period with competing amount or club remains conflict', () => {
  for (const patch of [{ annualGrossEur: 104000 }, { clubId: 'other' }])
    assert.equal(select(input({ observations: [observation(), observation({ id: 'b', ...patch })] })).classification, 'CONFLICT')
})
test('explicit effective dates can disambiguate same-season updates', () => {
  const a = observation({ effectiveDate: { date: '2025-02-01', reference: 'synthetic:effective' } })
  const b = observation({ id: 'b', annualGrossEur: 104000, effectiveDate: { date: '2025-09-01', reference: 'synthetic:effective' } })
  assert.equal(select(input({ observations: [b, a] })).selectedObservationId, 'b')
})
test('future observations and evidence cannot establish an as-of result', () => {
  assert.equal(select(input({ observations: [observation({ observedAt: '2027-01-01' })] })).selectedObservationId, null)
  assert.equal(select(input({ confirmations: [{ ...proof, observedAt: '2027-01-01' }] })).classification, 'LAST_KNOWN_UNVERIFIED')
})
test('permutations, repeated execution and frozen observations are stable', () => {
  const a = Object.freeze(observation()), b = Object.freeze(observation({ id: 'b' }))
  const data = input({ observations: Object.freeze([a, b]) }), before = JSON.stringify(data)
  assert.deepEqual(select(data), select(input({ observations: [b, a] })))
  assert.deepEqual(select(data), select(data)); assert.equal(JSON.stringify(data), before)
  assert.equal(select(data).selectedObservationId, 'a')
})
test('invalid amounts, IDs and dates fail explicitly', () => {
  for (const value of [-1, NaN, Infinity]) assert.throws(() => select(input({ observations: [observation({ annualGrossEur: value })] })))
  assert.throws(() => select(input({ observations: [observation(), observation()] })), /DUPLICATE_OBSERVATION_ID/)
  assert.throws(() => select(input({ observations: [observation({ playerId: 'other' })] })), /PLAYER_ID_MISMATCH/)
  assert.throws(() => select(input({ asOf: '2026-02-30' })), /INVALID_DATE/)
  assert.throws(() => select(input({ confirmations: [{ ...proof, validity: { ...proof.validity, reference: '' } }] })), /MISSING_EVIDENCE_REFERENCE/)
})

const edition = (id: string, start: number, end: number, annualGrossEur: number | null = 52000): RemunerationObservation =>
  observation({ id, season: start === end ? String(start) : `${start}/${end}`, annualGrossEur,
    observedAt: '2026-10-29', seasonPeriod: null,
    seasonEvidence: { startingYear: start, endingYear: end, calendar: start === end ? 'ANNUAL' : 'SPLIT_YEAR', reference: 'synthetic:edition' } })
const atOctober = (observations: readonly RemunerationObservation[]) => input({ asOf: '2026-10-29', observations })

test('European editions order without fabricating dates; later null does not cancel', () => {
  const data = atOctober([edition('old', 2024, 2025), edition('latest', 2025, 2026, 104000), edition('null', 2026, 2027, null)])
  const r = select(data)
  assert.equal(r.selectedObservationId, 'latest'); assert.equal(r.classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(r.assessments.find(a => a.observationId === 'old')?.classification, 'HISTORICAL_ONLY')
  const selected = r.assessments.find(a => a.observationId === 'latest')!
  assert.equal(selected.conversion.weeklyEquivalentEur, 2000)
  assert.equal(selected.original.seasonPeriod, null); assert.equal(selected.original.effectiveDate, undefined)
  assert.equal(r.assessments.find(a => a.observationId === 'null')?.original.annualGrossEur, null)
  assert.equal(r.salaryEligibility.trainingAllowed, false); assert.equal(r.salaryEligibility.publicationAllowed, false)
})
test('MLS annual editions and repeated amounts preserve the newest original', () => {
  const r = select(atOctober([edition('2023', 2023, 2023), edition('2025', 2025, 2025), edition('2026', 2026, 2026, null)]))
  assert.equal(r.selectedObservationId, '2025'); assert.equal(r.classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(r.assessments[0].classification, 'HISTORICAL_ONLY')
})
test('short European notation uses the existing season alignment normalization', () => {
  const r = select(atOctober([edition('old', 2024, 2025), { ...edition('new', 2025, 2026), season: '2025/26' }]))
  assert.equal(r.selectedObservationId, 'new')
})
test('same-season distinct references abstain, including equal values from different sources', () => {
  for (const annualGrossEur of [52000, 104000]) {
    const r = select(atOctober([edition('a', 2025, 2026), { ...edition('b', 2025, 2026, annualGrossEur), sourceReference: 'synthetic:other-source' }]))
    assert.equal(r.selectedObservationId, null); assert.equal(r.classification, 'CONFLICT')
    assert.equal(r.assessments[0].reason, 'SAME_PERIOD_REFERENCES_AMBIGUOUS')
    assert.equal(r.assessments[0].issueKind, 'TEMPORAL_AMBIGUITY')
  }
})
test('overlapping mixed calendars abstain; disjoint year ranges can be ordered', () => {
  const ambiguous = select(atOctober([edition('a', 2025, 2025), edition('b', 2025, 2026)]))
  assert.equal(ambiguous.selectedObservationId, null)
  assert.equal(ambiguous.assessments[0].reason, 'TEMPORAL_RANGES_INCOMPARABLE')
  assert.equal(select(atOctober([edition('a', 2023, 2023), edition('b', 2025, 2026)])).selectedObservationId, 'b')
})
test('missing season evidence is distinct from contradictory documentation', () => {
  const missing = select(atOctober([edition('a', 2024, 2025), { ...edition('b', 2025, 2026), seasonEvidence: null }]))
  assert.equal(missing.assessments[0].reason, 'TEMPORAL_EVIDENCE_MISSING')
  for (const season of ['2024/2025', '2025/2027', 'not-a-season']) {
    const invalid = select(atOctober([{ ...edition('a', 2025, 2026), season }]))
    assert.equal(invalid.classification, 'CONFLICT')
    assert.equal(invalid.assessments[0].issueKind, 'DOCUMENTARY_CONFLICT')
    assert.equal(invalid.assessments[0].reason, 'SEASON_DOCUMENTATION_CONFLICT')
  }
})
test('year evidence contradicting exact dates cannot supersede safe history', () => {
  const bad = { ...edition('bad', 2025, 2026), effectiveDate: { date: '2024-01-01', reference: 'synthetic:date' } }
  const r = select(atOctober([edition('a', 2023, 2024), bad]))
  assert.equal(r.classification, 'CONFLICT'); assert.equal(r.selectedObservationId, null)
})
test('documented effective dates distinguish same-season updates, not collection times', () => {
  const a = { ...edition('a', 2025, 2026), effectiveDate: { date: '2025-09-01', reference: 'synthetic:effective' } }
  const b = { ...edition('b', 2025, 2026, 104000), effectiveDate: { date: '2026-02-01', reference: 'synthetic:effective' } }
  assert.equal(select(atOctober([b, a])).selectedObservationId, 'b')
})
test('season ordering neither confirms a contract nor ignores transfers or renewals', () => {
  const data = atOctober([edition('a', 2025, 2026)])
  assert.equal(select({ ...data, currentClubId: 'other' }).classification, 'HISTORICAL_ONLY')
  assert.equal(select({ ...data, events: [{ kind: 'RENEWAL', date: '2026-02-01', observedAt: '2026-02-01', reference: 'synthetic:event' }] }).classification, 'LAST_KNOWN_UNVERIFIED')
  assert.equal(select({ ...data, events: [{ kind: 'TRANSFER', date: '2026-02-01', observedAt: '2026-02-01', reference: 'synthetic:event' }] }).classification, 'HISTORICAL_ONLY')
})
test('season-only future years are unavailable; repeated and reversed inputs remain identical', () => {
  const observations = [edition('old', 2024, 2025), edition('new', 2025, 2026), edition('future', 2027, 2028)]
  observations.forEach(o => { Object.freeze(o.seasonEvidence); Object.freeze(o) }); Object.freeze(observations)
  const data = atOctober(observations), before = JSON.stringify(data)
  const r = select(data)
  assert.equal(r.selectedObservationId, 'new')
  assert.deepEqual(r, select(atOctober([...observations].reverse())))
  assert.deepEqual(r, select(data)); assert.equal(JSON.stringify(data), before)
})
