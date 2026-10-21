import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CoverageRecord } from '../../../experiments/futscout-value-v01/coverage-contract'
import { prepareValueActivation, stageValueActivation, withdrawValueActivation, activationHash } from '../../../services/valueActivationPreparation'
import { createPlayerEconomicWriter } from '../../../services/playerEconomicPersistence'
import { economicFingerprint, normalizeEstimateAmount } from '../../../lib/economicData/value'
import { readEconomicMarketValue } from '../../../lib/economicData/read'
import { economicActivationStore } from '../../fixtures/economicActivationStore'

const record = (): CoverageRecord => ({ playerId: 'p', eaId: '123', valueEur: 123456.78912345678, currency: 'EUR',
  type: 'FUTSCOUT_ESTIMATE', method: 'D1_FULL_CONTEXT', version: 'model-v1', modelArtifactHash: 'a'.repeat(64),
  inputHash: 'b'.repeat(64), context: 'COMPLETE', quality: 'EXPERIMENTAL_NOT_VALIDATED', qualityApproved: false,
  uncertainty: null, provenance: { original: 'fixture' }, warnings: [], abstentionReason: null,
  eligibility: 'PRIVATE_EXPERIMENT_ONLY', publication: { existingReaderEligible: false, modelApproved: false, action: 'NOT_EXECUTED' },
  rights: { providerTraining: 'UNKNOWN', parameterCommercialUse: 'UNKNOWN', display: 'NOT_AUTHORIZED_BY_THIS_RUN' } })
const prepare = (r = record()) => prepareValueActivation([r], 'c'.repeat(64), '2026-10-20T00:00:00.000Z')
const grants = [{ provider: 'FUTSCOUT_VALUE', context: 'REAL_WORLD' as const, field: 'MARKET_VALUE' as const, evidenceRef: 'fixture-only' }]
const storage = { precision: 38, scale: 18 }
function fixture() { const f = economicActivationStore(); f.players.set('p', '123'); return f }

test('exact frozen amount, provenance hashes and separate conditional launch/UNKNOWN rights', () => {
  const r = record(), before = structuredClone(r), a = prepare(r)
  assert.equal(Number(a.items[0].plan.state.amount), r.valueEur)
  assert.deepEqual(r, before); assert.deepEqual(prepare(r), a)
  assert.equal(a.publication.publishable, 0)
  assert.equal(a.items[0].plan.state.metadata.estimate?.commercialRights, 'UNKNOWN')
  assert.equal(a.items[0].plan.state.metadata.estimate?.launchDecision, 'CONDITIONAL_OWNER_DECISION')
  assert.equal(a.items[0].plan.state.providerEffectiveAt, null)
  assert.throws(() => normalizeEstimateAmount('1.0000000000000000001'))
})
test('stage/replay are idempotent and withdrawal preserves immutable history and Current', async () => {
  const f = fixture(), bundle = prepare()
  f.seedCurrent({ playerId: 'p', field: 'MARKET_VALUE', observationId: 'provider-original', revision: 3 })
  const before = activationHash([...f.currents])
  const first = await stageValueActivation(bundle, f.client, grants, storage)
  assert.deepEqual(await stageValueActivation(bundle, f.client, grants, storage), first)
  assert.equal(f.states.size, 1); assert.equal(f.observations.size, 1); assert.equal(activationHash([...f.currents]), before)
  const withdrawal = await withdrawValueActivation(bundle, first, f.client)
  assert.deepEqual(await withdrawValueActivation(bundle, first, f.client), withdrawal)
  assert.equal(withdrawal.currentsChanged, 0); assert.equal(f.observations.size, 1)
})
test('wrong storage, ungranted source and wrong EA identity reject before state insertion', async () => {
  const f = fixture(), bundle = prepare()
  await assert.rejects(stageValueActivation(bundle, f.client, grants, { precision: 20, scale: 2 }), /STORAGE/)
  const wrong = economicActivationStore({ precision: 20, scale: 2 }); wrong.players.set('p', '123')
  await assert.rejects(stageValueActivation(bundle, wrong.client, grants, storage), /STORAGE/)
  await assert.rejects(stageValueActivation(bundle, f.client, [], storage), /UNAUTHORIZED/)
  f.players.set('p', '456')
  await assert.rejects(stageValueActivation(bundle, f.client, grants, storage), /IDENTITY_CONFLICT/)
  assert.equal(f.states.size, 0)
})
test('transaction failure rolls back its state and explicit resume completes once', async () => {
  const f = fixture(), bundle = prepare(); f.failNextObservation()
  await assert.rejects(stageValueActivation(bundle, f.client, grants, storage), /INJECTED_FAILURE/)
  assert.equal(f.states.size, 0); assert.equal(f.observations.size, 0)
  await stageValueActivation(bundle, f.client, grants, storage)
  assert.equal(f.states.size, 1); assert.equal(f.observations.size, 1)
})
test('even unexpected driver rounding is detected inside the transaction and leaves no observation', async () => {
  const f = economicActivationStore({ simulateDriverRounding: true }); f.players.set('p', '123')
  await assert.rejects(stageValueActivation(prepare(), f.client, grants, storage), /EXACT_AMOUNT_READ_BACK/)
  assert.equal(f.states.size, 0); assert.equal(f.observations.size, 0)
})
test('checkpoint failure after commit stops safely and resume does not duplicate the committed observation', async () => {
  const f = fixture(), bundle = prepare()
  await assert.rejects(stageValueActivation(bundle, f.client, grants, storage, async () => { throw Error('CHECKPOINT_FAILED') }), /CHECKPOINT_FAILED/)
  assert.equal(f.observations.size, 1)
  await stageValueActivation(bundle, f.client, grants, storage)
  assert.equal(f.observations.size, 1)
})
test('tampered bundle, duplicate identities and changed request content fail closed', async () => {
  const f = fixture(), bundle = prepare()
  const changed = structuredClone(bundle); changed.items[0].plan.state.amount = normalizeEstimateAmount(1)
  await assert.rejects(stageValueActivation(changed, f.client, grants, storage), /BUNDLE_CHANGED/)
  assert.throws(() => prepareValueActivation([record(), record()], 'a'.repeat(64), bundle.preparedAt), /DUPLICATE/)
  await stageValueActivation(bundle, f.client, grants, storage)
  const write = createPlayerEconomicWriter(f.client, grants, { idempotentStaging: true })
  await assert.rejects(write({ ...bundle.items[0].plan, observedAt: '2026-10-21T00:00:00Z' }), /IDEMPOTENCY_CONFLICT/)
})
test('pending estimates cannot select Current or display even when directly supplied to the reader', async () => {
  const f = fixture(), bundle = prepare(), plan = bundle.items[0].plan
  await assert.rejects(createPlayerEconomicWriter(f.client, grants)({ ...plan, selectCurrent: true }), /PUBLICATION/)
  const result = readEconomicMarketValue({ id: 'p', externalId: '123', economicCurrents: [{ observation: {
    observedAt: new Date(bundle.preparedAt), state: plan.state,
  } }] as unknown as Parameters<typeof readEconomicMarketValue>[0]['economicCurrents'] })
  assert.equal(result.marketValue, null)
  const prior = economicFingerprint(plan.state)
  const e = plan.state.metadata.estimate!
  assert.equal(economicFingerprint({ ...plan.state, metadata: { ...plan.state.metadata,
    estimate: Object.fromEntries(Object.entries(e).reverse()) as typeof e } }), prior)
})
test('metadata cannot manufacture rights/quality approval or change economic scope', () => {
  const state = prepare().items[0].plan.state
  for (const change of [{ commercialRights: 'CONFIRMED' }, { qualityApproved: true }, { launchDecision: 'APPROVED' }]) {
    const bad = structuredClone(state)
    Object.assign(bad.metadata.estimate!, change)
    assert.throws(() => economicFingerprint(bad), /METADATA_INVALID/)
  }
  assert.throws(() => economicFingerprint({ ...state, context: 'EA_CAREER' }), /SCOPE_INVALID/)
})
test('withdrawal rejects a changed Current and never overwrites that pointer', async () => {
  const f = fixture(), bundle = prepare(), receipt = await stageValueActivation(bundle, f.client, grants, storage)
  f.seedCurrent({ playerId: 'p', field: 'MARKET_VALUE', observationId: 'new-provider', revision: 1 })
  await assert.rejects(withdrawValueActivation(bundle, receipt, f.client), /WITHDRAWAL_CONFLICT/)
  assert.equal(f.currents.get('p:MARKET_VALUE')?.observationId, 'new-provider')
})
