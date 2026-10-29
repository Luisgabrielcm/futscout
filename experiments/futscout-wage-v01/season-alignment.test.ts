import test from 'node:test'
import assert from 'node:assert/strict'
import { alignSeason, type AlignmentInput } from './season-alignment'

const input: AlignmentInput = { calendar: 'ANNUAL', calendarEvidence: 'synthetic:MLS-2026',
  salary: { season: '2026', evidenceReference: 'synthetic:salary', effectiveDate: '2026-04-16' },
  rating: { season: '2026', evidenceReference: 'synthetic:rating-version', effectiveDate: '2026-10-08' } }
test('same documented season permits exploration, not training', () => {
  const r = alignSeason(input)
  assert.equal(r.classification, 'SAME_SEASON'); assert.equal(r.distanceDays, 175)
  assert.equal(r.exploratoryComparable, true); assert.equal(r.trainingAllowed, false)
})
test('exact date requires documented matching seasons', () => {
  assert.equal(alignSeason({ ...input, rating: { ...input.rating, effectiveDate: '2026-04-16' } }).classification, 'EXACT_DATE')
})
test('different seasons remain different even with equal dates', () => {
  assert.equal(alignSeason({ ...input, rating: { ...input.rating, season: '2025', effectiveDate: '2026-04-16' } }).classification, 'DIFFERENT_SEASON')
})
test('import date is never proof of rating edition', () => {
  assert.equal(alignSeason({ ...input, ratingObservedAt: '2026-10-08', rating: { season: null, evidenceReference: null, effectiveDate: null } }).classification, 'UNKNOWN')
})
test('European split-year aliases normalize without invented dates', () => {
  const r = alignSeason({ ...input, calendar: 'SPLIT_YEAR', salary: { ...input.salary, season: '2025/26' }, rating: { ...input.rating, season: '2025-2026', effectiveDate: null } })
  assert.equal(r.classification, 'SAME_SEASON'); assert.equal(r.distanceDays, null)
})
test('unknown calendar or unsupported season blocks comparison', () => {
  assert.equal(alignSeason({ ...input, calendar: 'UNKNOWN' }).classification, 'UNKNOWN')
  assert.equal(alignSeason({ ...input, calendarEvidence: null }).classification, 'UNKNOWN')
  assert.equal(alignSeason({ ...input, rating: { ...input.rating, evidenceReference: null } }).classification, 'UNKNOWN')
})
test('invalid effective date cannot establish simultaneity', () => {
  assert.equal(alignSeason({ ...input, rating: { ...input.rating, effectiveDate: '2026-02-30' } }).distanceDays, null)
})
test('loan context is preserved independently and hashes deterministic', () => {
  const x = { ...input, clubContext: { salaryClubId: 'parent', ratingClubId: 'loan', transferOrLoanEvidence: 'synthetic:loan' } }
  assert.deepEqual(alignSeason(x), alignSeason(x)); assert.deepEqual(alignSeason(x).clubContext, x.clubContext)
})
