import test from 'node:test'
import assert from 'node:assert/strict'
import method from './method.json'
import { annualGrossTotalContract, convertAnnualGrossTotalEurToWeekly as convert } from './annual-gross-total'
import { normalizeBase, target, type Salary } from './engine'

test('annual gross total becomes a weekly equivalent, retaining the annual amount', () => {
  const r = convert(52000)
  assert.equal(r.state, 'VALUE')
  assert.equal(r.annualGrossEur, 52000)
  assert.equal(r.weeklyEquivalentEur, 1000)
  assert.equal(r.contract.weeklyTarget, 'EUR/GROSS/TOTAL/WEEK_EQUIVALENT')
})

test('fractional euros retained without monetary rounding', () => {
  const r = convert(52.52)
  assert.equal(r.annualGrossEur, 52.52)
  assert(Math.abs(r.weeklyEquivalentEur! - 1.01) <= Number.EPSILON * 1.01)
  assert(Math.abs(convert(1).weeklyEquivalentEur! - 0.019230769230769232) <= Number.EPSILON)
  assert.notEqual(convert(1).weeklyEquivalentEur, 0.02)
})

test('missing, null and observed zero remain distinct', () => {
  assert.equal(convert(undefined).state, 'ABSENT')
  assert.equal(convert(undefined).weeklyEquivalentEur, undefined)
  assert.equal(convert(null).state, 'NULL')
  assert.equal(convert(null).weeklyEquivalentEur, null)
  assert.equal(convert(0).state, 'ZERO')
  assert.equal(convert(0).weeklyEquivalentEur, 0)
})

test('invalid types are rejected without implicit numeric coercion', () => {
  for (const value of ['52000', '', true, false, {}, [], BigInt(52000)])
    assert.throws(() => convert(value), { name: 'TypeError', message: 'WAGE_ANNUAL_AMOUNT_NOT_NUMBER' })
})

test('negative and non-finite amounts have explicit errors', () => {
  assert.throws(() => convert(-0.01), { name: 'RangeError', message: 'WAGE_ANNUAL_AMOUNT_NEGATIVE' })
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(() => convert(value), { name: 'RangeError', message: 'WAGE_ANNUAL_AMOUNT_NOT_FINITE' })
})

test('positive underflow is not silently converted to zero', () => {
  assert.throws(() => convert(Number.MIN_VALUE), /WAGE_WEEKLY_EQUIVALENT_UNDERFLOW/)
  const r = convert(Number.MAX_VALUE)
  assert(Number.isFinite(r.weeklyEquivalentEur))
  assert(r.weeklyEquivalentEur! > 0)
})

test('source provenance and amount remain unchanged; repeated calls are deterministic', () => {
  const source = Object.freeze({ annualGrossEur: 123456.78, provenance: Object.freeze({
    source: 'SYNTHETIC', sourceRecordId: 'test-1', season: '2025/2026',
    effectiveAt: null, observedAt: '2026-10-28', definitionEvidence: null,
  }) })
  const before = JSON.stringify(source)
  const r = convert(source.annualGrossEur, source.provenance)
  assert.equal(r.provenance, source.provenance)
  assert.equal(r.annualGrossEur, source.annualGrossEur)
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(r, convert(source.annualGrossEur, source.provenance))
  assert.equal(r.provenance?.effectiveAt, null)
})

test('product semantics are versioned independently of the unchanged legacy base engine', () => {
  assert.equal(method.target, annualGrossTotalContract.annualTarget)
  assert.equal(method.semanticContract.version, annualGrossTotalContract.version)
  assert.equal(method.semanticContract.weeklyTarget, annualGrossTotalContract.weeklyTarget)
  assert.equal(method.semanticContract.divisor, annualGrossTotalContract.weeksPerYear)
  assert.equal(method.semanticContract.supplierDefinition, annualGrossTotalContract.supplierDefinition)
  assert.equal(method.publicationAllowed, false)
  assert.equal(target, 'EUR/GROSS/BASE/WEEK')
  const historical: Salary = { amount: 52000, currency: 'EUR', period: 'YEAR', tax: 'GROSS',
    component: 'BASE', source: 'SYNTHETIC', observedAt: '2026-10-28', effectiveAt: null }
  assert.equal(normalizeBase(historical).target, target)
  assert.throws(() => normalizeBase({ ...historical, component: 'TOTAL' }), /INCOMPARABLE_SALARY/)
  assert.equal(historical.component, 'BASE')
})
