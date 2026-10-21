import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalEconomicDecimal } from '../../../lib/economicData/decimal'
import { normalizeEstimateAmount } from '../../../lib/economicData/value'
import { frozenValueLexemes } from '../../helpers/exactFrozenValue'

test('canonical comparison preserves sub-cent digits and exponent text without Number', () => {
  assert.equal(canonicalEconomicDecimal('104701483.70181042'), '104701483.701810420000000000')
  assert.equal(canonicalEconomicDecimal('1.23456789012345678e5'), '123456.789012345678000000')
  assert.equal(canonicalEconomicDecimal('0'), '0.000000000000000000')
  assert.equal(canonicalEconomicDecimal('001.2000'), canonicalEconomicDecimal('1.2'))
  assert.throws(() => canonicalEconomicDecimal('1.0000000000000000001'), /PRECISION_LOSS/)
  assert.throws(() => canonicalEconomicDecimal('1e999'), /EXPONENT/)
})
test('own amount bounds are exact even when Number would round down at the safe-integer boundary', () => {
  assert.equal(normalizeEstimateAmount('9007199254740991'), '9007199254740991.000000000000000000')
  assert.throws(() => normalizeEstimateAmount('9007199254740991.000000000000000001'))
  assert.throws(() => normalizeEstimateAmount('0'))
})
test('frozen JSON comparison extracts the literal, ignores nested anchors and rejects duplicates', () => {
  const row = '{"playerId":"p","eaId":"1","method":"D1","type":"FUTSCOUT_ESTIMATE","valueEur":9007199254740991.000000000000000001,"anchor":{"valueEur":99}}'
  assert.equal(frozenValueLexemes(`{"rows":[${row}]}`).get('p'), '9007199254740991.000000000000000001')
  assert.throws(() => frozenValueLexemes(`{"rows":[${row},${row}]}`), /DUPLICATE/)
})
