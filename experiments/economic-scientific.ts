import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { verifyFrozenSplits } from './futscout-value-v01/pipeline'
import { adaptPilot } from './futscout-contract-clause-v01/evidence-adapter'

test('scientific: frozen value bytes and player/club/league splits', () => {
  assert.equal(verifyFrozenSplits('audit/output/futscout-economic-dataset-v1-20261008').players, 3457)
})
test('scientific: wage selection byte hash', () => {
  const bytes = readFileSync('audit/output/salarysport-wage-sample-preflight-20261008/selection.json')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '809821820b26cb0a6c7938cc6af2aa2c34a8d43957a6406f933ebe2919a1587f')
})
test('scientific: contract draft hash, dates and publication abstention', () => {
  const dir = 'audit/output/contract-evidence-pilot-20261008/'
  const p = adaptPilot(readFileSync(dir + 'selection.json'), readFileSync(dir + 'evidence.json'))
  assert.equal(p.artifactHash, 'd5c6c10f44a93780731bf093c5798d265a3f1f042d15f1ff9ef427e3c371f033')
  for (const r of p.records) {
    assert.equal(r.draft.observedAt, null); assert.equal(r.persistenceEligible, false)
    assert.equal(r.draft.provenance.rights, 'UNKNOWN')
  }
})
