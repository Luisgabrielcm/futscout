import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { canonicalizePotentialJson as jcs, fingerprintFutscoutPotential as fingerprint } from '../../../lib/futscoutPotential/fingerprint'
import { FUTSCOUT_E_V1_REGISTRATION as model } from '../../../lib/futscoutPotential/registeredEV1'
import goldens from '../../fixtures/futscoutPotential/fingerprint-v1.json'

const input = { birthDate: '2000-01-01T00:00:00.000Z', referenceAt: '2026-09-29T00:00:00.000Z', overall: 80, primaryPosition: 'MC' }
const cases = goldens.cases
for (const fixture of cases) test(`fingerprint golden ${fixture.hash}`, () => {
  const result = fingerprint(model, fixture.input)
  assert.equal(result.canonical, fixture.canonical)
  assert.equal(result.inputHash, fixture.hash)
  assert.deepEqual(result, fingerprint(model, fixture.input))
})
test('artifact binding matches normalized source recipe', () => {
  const files = ['lib/futscoutPotential/modelEV1.ts', 'lib/futscoutPotential/types.ts']
  const content = files.map(file => [file, readFileSync(file, 'utf8').replace(/\r\n/g, '\n')])
  assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'), model.artifactHash)
})
test('JCS numbers, ordering, Unicode and no normalization', () => {
  assert.equal(jcs({ z: -0, a: [333333333.33333329, 1e30, 4.50, .002, 1e-27] }), '{"a":[333333333.3333333,1e+30,4.5,0.002,1e-27],"z":0}')
  assert.equal(jcs({ '\ufffd': 1, '😀': 2, a: 3 }), '{"a":3,"😀":2,"�":1}')
  assert.notEqual(jcs('é'), jcs('e\u0301'))
  assert.equal(jcs({ b: 1, a: 2 }), jcs({ a: 2, b: 1 }))
})
test('rejects non-JSON values without executing getters', () => {
  const cycle: unknown[] = []; cycle.push(cycle)
  for (const value of [NaN, Infinity, undefined, BigInt(1), new Date(), cycle, new Array(2), '\ud800', '\udc00', { get secret() { throw new Error('GETTER_EXECUTED') } }]) {
    assert.throws(() => jcs(value), error => error instanceof Error && error.message !== 'GETTER_EXECUTED')
  }
})
test('all determinants affect hash; operational/identity fields do not', () => {
  const original = fingerprint(model, input)
  for (const change of [{ overall: 81 }, { primaryPosition: 'GOL' }, { referenceAt: '2026-09-30T00:00:00.000Z' }, { birthDate: '2000-01-02T00:00:00.000Z' }]) assert.notEqual(fingerprint(model, { ...input, ...change }).inputHash, original.inputHash)
  assert.notEqual(fingerprint({ ...model, version: 'test-v2' }, input).inputHash, original.inputHash)
  assert.notEqual(fingerprint({ ...model, artifactHash: 'a'.repeat(64) }, input).inputHash, original.inputHash)
  assert.equal(fingerprint(model, { ...input, ...{ playerId: 'ignored', observedAt: 'ignored', age: 99 } }).inputHash, original.inputHash)
  assert.equal(original.coreInput.age, (Date.parse(input.referenceAt) - Date.parse(input.birthDate)) / (365.2425 * 86400000))
})
test('invalid dates, ranges and positions fail before persistence', () => {
  for (const change of [{ birthDate: '2000-02-30T00:00:00.000Z' }, { birthDate: '2030-01-01T00:00:00.000Z' }, { referenceAt: '2026-09-29' }, { overall: NaN }, { overall: 100 }, { primaryPosition: 'UNKNOWN' }]) assert.throws(() => fingerprint(model, { ...input, ...change }))
})
