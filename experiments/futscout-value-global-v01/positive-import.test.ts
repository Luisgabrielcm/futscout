import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptLiveFootballMarketValue } from '../../lib/economicData/liveFootball'
import { economicFingerprint } from '../../lib/economicData/value'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { buildImportBatches, type ImportItem } from './offline-import-prep'
import { buildPositiveImportPlan } from './positive-import'
import { sha } from './runner'

const parent = 'a'.repeat(64), selection = 'b'.repeat(64)
function fixture(values: (string | null)[]) {
  const items: ImportItem[] = values.map((amount, index) => {
    const playerId = `synthetic${String(index + 1).padStart(5, '0')}`
    const state = adaptLiveFootballMarketValue({ playerId, providerPlayerId: `provider-${index}`,
      field: 'MARKET_VALUE', marketValue: amount, currency: 'EUR', confidence: 'HIGH', matchState: 'MATCHED',
      providerEffectiveAt: null }).state
    state.metadata.evidenceRef = 'value-global-v1'
    const plan: EconomicWrite = { state, observedAt: '2026-01-01T00:00:00.000Z',
      requestId: `lfglobal-${parent.slice(0, 16)}-${playerId}`, selectCurrent: false,
      expectedRevision: null, selectionReason: 'AUTHORIZED_GLOBAL', policyVersion: 'global-v1' }
    return { position: index + 1, requestId: plan.requestId, playerId, plan,
      receiptHash: sha(`synthetic-receipt-${index}`), inputHash: sha(JSON.stringify(plan)), contentHash: economicFingerprint(state) }
  })
  return { selectionHash: selection, parentSelectionHash: parent, journalHash: 'c'.repeat(64),
    eventCount: 1, receipts: items.length, positive: values.filter(v => v !== null).length,
    nulls: values.filter(v => v === null).length, excluded: 0, batches: buildImportBatches(items) }
}

test('mixed receipts become positive-only batches without changing identity, provenance, hashes or dates', () => {
  const prepared = fixture([null, '123.45', null, '9.00', '2.00'])
  const before = structuredClone(prepared)
  const result = buildPositiveImportPlan(prepared, 2)
  assert.deepEqual(result.batches.map(b => b.items.map(i => i.position)), [[2, 4], [5]])
  assert.deepEqual(result.batches.flatMap(b => b.items), prepared.batches[0].items.filter(i => i.plan.state.presence === 'VALUE'))
  assert.deepEqual(result.source, { selectionHash: selection, parentSelectionHash: parent, journalHash: 'c'.repeat(64) })
  assert.equal(result.sourceReceipts, 5)
  assert.equal(result.positiveCandidates, 3)
  assert.equal(result.deferredNulls, 2)
  assert.equal(result.additionalPublicValues, null)
  assert.equal(result.publicationAllowed, false)
  assert(result.batches.flatMap(b => b.items).every(i => !i.plan.selectCurrent))
  assert.deepEqual(prepared, before)
  result.batches[0].items[0].plan.state.amount = '999.00'
  assert.deepEqual(prepared, before)
})

test('synthetic counts matching the reported inventory reduce 60 mixed batches to 18 positive batches', () => {
  // Counts are scenario inputs; these are not the private real receipts.
  const prepared = fixture(Array.from({ length: 5989 }, (_, i) => i < 1787 ? '1.00' : null))
  assert.equal(prepared.batches.length, 60)
  const result = buildPositiveImportPlan(prepared)
  assert.equal(result.positiveCandidates, 1787)
  assert.equal(result.deferredNulls, 4202)
  assert.equal(result.batches.length, 18)
  assert.equal(result.batches.at(-1)?.count, 87)
  assert.equal(result.additionalPublicValues, null)
  assert.deepEqual(result, buildPositiveImportPlan(prepared))
})

test('all-null and empty inventories produce no staging batch and no claimed public gain', () => {
  for (const prepared of [fixture([null, null]), fixture([])]) {
    const result = buildPositiveImportPlan(prepared)
    assert.deepEqual(result.batches, [])
    assert.equal(result.positiveCandidates, 0)
    assert.equal(result.additionalPublicValues, null)
  }
})

test('source, summary and batch tampering fail closed; malformed deferred nulls cannot be filtered away', () => {
  const changes: ((p: ReturnType<typeof fixture>) => void)[] = [
    p => { p.journalHash = 'invalid' }, p => { p.parentSelectionHash = selection },
    p => { p.receipts++ }, p => { p.positive++ }, p => { p.nulls++ },
    p => { p.batches[0].hash = '0'.repeat(64) }, p => { p.batches[0].count++ },
    p => { p.batches[0].firstPosition++ }, p => { p.batches[0].lastPosition++ },
    p => { p.batches[0].number++ }, p => { p.batches[0].items.reverse() },
    p => { p.batches[0].items[1].plan.selectCurrent = true },
    p => { p.batches[0].items[1].plan.state.metadata.source = 'OTHER/source' },
    p => { p.batches[0].items[1].plan.state.confidence = 'LOW' },
    p => { p.batches[0].items[0] = { ...p.batches[0].items[0], receiptHash: 'invalid' } },
    p => { p.batches[0].items[0].plan.state.amount = '999.00' },
  ]
  for (const change of changes) {
    const p = fixture(['10.00', null])
    change(p)
    assert.throws(() => buildPositiveImportPlan(p))
  }
  for (const size of [0, -1, 101, 1.5]) assert.throws(() => buildPositiveImportPlan(fixture(['1.00']), size), /IMPORT_BATCH_SIZE/)
})

test('rehashed zero, wrong currency and weak identities remain rejected by the existing import contract', () => {
  for (const patch of [{ amount: '0.00' }, { currency: 'USD' }, { confidence: 'LOW' }, { context: 'EA_CAREER' }]) {
    const p = fixture(['10.00'])
    const item = p.batches[0].items[0]
    Object.assign(item.plan.state, patch)
    p.batches = buildImportBatches([{ ...item, inputHash: sha(JSON.stringify(item.plan)),
      contentHash: economicFingerprint(item.plan.state) }])
    assert.throws(() => buildPositiveImportPlan(p))
  }
})

test('a rehashed weak NULL receipt blocks preparation even though it would be deferred', () => {
  const p = fixture(['10.00', null])
  const item = p.batches[0].items[1]
  item.plan.state.confidence = 'LOW'
  const altered = { ...item, inputHash: sha(JSON.stringify(item.plan)), contentHash: economicFingerprint(item.plan.state) }
  p.batches = buildImportBatches([p.batches[0].items[0], altered])
  assert.throws(() => buildPositiveImportPlan(p), /IMPORT_CONFIDENCE/)
})

test('duplicates across original batches cannot become duplicate positive imports', () => {
  const p = fixture(['1.00', '2.00'])
  const items = p.batches[0].items
  p.batches = buildImportBatches(items, 1)
  p.batches[1] = { ...buildImportBatches([items[0]])[0], number: 2 }
  assert.throws(() => buildPositiveImportPlan(p), /IMPORT_DUPLICATE_RECEIPT_PLAYER/)
})
