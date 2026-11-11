import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CoverageRecord } from './coverage-contract'
import { decideCoveragePublication, decideValuePublication } from './publication'

const provider = (): CoverageRecord => ({ playerId: 'player', eaId: 'ea', valueEur: 100,
  currency: 'EUR', type: 'PROVIDER', method: 'LIVE_FOOTBALL_EXISTING_CURRENT', version: 'test',
  modelArtifactHash: null, inputHash: null, context: 'COMPLETE', quality: 'EXISTING_ELIGIBLE_PROVIDER_OBSERVATION',
  qualityApproved: false, uncertainty: null, provenance: { observationId: 'original' }, warnings: [], abstentionReason: null,
  eligibility: 'EXISTING_READER_POLICY', publication: { existingReaderEligible: true, modelApproved: false, action: 'NOT_EXECUTED' },
  rights: { providerTraining: 'UNKNOWN', parameterCommercialUse: 'UNKNOWN', display: 'EXISTING_POLICY_ONLY' } })

test('existing supplier precedence survives unknown training rights; no alternate public field', () => {
  const row = provider(), before = structuredClone(row)
  assert.equal(decideValuePublication(row).marketValue, 100)
  assert.deepEqual(row, before)
  assert.equal(decideValuePublication({ ...row, type: 'FUTSCOUT_ESTIMATE', method: 'D1_FULL_CONTEXT' }).marketValue, null)
})
test('activity hold and pending review retain price privately', () => {
  const row = provider()
  row.eligibility = 'ACTIVITY_EVIDENCE_HOLD'
  assert.equal(decideValuePublication(row).marketValue, null)
  row.eligibility = 'EXISTING_READER_POLICY'
  row.dataReview = { reviewRequired: true } as CoverageRecord['dataReview']
  assert.deepEqual(decideValuePublication(row).reasons, ['DATA_REVIEW_REQUIRED'])
  row.dataReview!.reviewRequired = false
  assert.equal(decideValuePublication(row).marketValue, 100)
  assert.equal(row.valueEur, 100)
})
test('missing, zero, negative, unsafe, nonfinite and invalid source fail closed', () => {
  for (const valueEur of [null, 0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(decideValuePublication({ ...provider(), valueEur }).marketValue, null)
  assert.equal(decideValuePublication({ ...provider(), eaId: null }).eligible, false)
  assert.equal(decideValuePublication({ ...provider(), method: 'OTHER_PROVIDER' }).eligible, false)
  const row = provider(); row.publication.existingReaderEligible = false
  assert.equal(decideValuePublication(row).eligible, false)
})
test('partial and extrapolated mechanical support never imply quality approval', () => {
  for (const method of ['D1_FULL_CONTEXT', 'B_PARTIAL_CONTEXT', 'B_BOUNDED_DOMAIN_EXTRAPOLATION']) {
    const result = decideValuePublication({ ...provider(), type: 'FUTSCOUT_ESTIMATE', method, context: 'UNKNOWN' })
    assert.equal(result.eligible, false)
    assert.ok(result.reasons.includes('MODEL_QUALITY_NOT_APPROVED'))
    assert.ok(result.reasons.includes('MODEL_COMMERCIAL_RIGHTS_UNKNOWN'))
  }
})
test('batch is deterministic, immutable and rejects ambiguous identity', () => {
  const rows = [provider()], original = structuredClone(rows)
  assert.deepEqual(decideCoveragePublication(rows), decideCoveragePublication(rows))
  assert.deepEqual(rows, original)
  assert.equal(decideCoveragePublication(rows).summary.publishable, 1)
  assert.throws(() => decideCoveragePublication([...rows, provider()]), /DUPLICATE/)
})
