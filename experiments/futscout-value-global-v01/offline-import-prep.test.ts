import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { buildImportBatches, type ImportItem } from './offline-import-prep'

const plan = { selectCurrent: false } as EconomicWrite
const item = (position: number): ImportItem => ({ position, requestId: `request-${position}`,
  playerId: `player-${position}`, receiptHash: `receipt-${position}`, inputHash: `input-${position}`,
  contentHash: `content-${position}`, plan })

test('staging batches are ordered, bounded, stable and never publish Current', () => {
  const first = buildImportBatches([item(3), item(1), item(2)], 2)
  const second = buildImportBatches([item(2), item(3), item(1)], 2)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map(batch => [batch.count, batch.firstPosition, batch.lastPosition]), [[2, 1, 2], [1, 3, 3]])
  assert(first.every(batch => batch.items.every(entry => !entry.plan.selectCurrent)))
})

test('duplicate players, requests, positions and publication are rejected', () => {
  assert.throws(() => buildImportBatches([item(1), { ...item(2), playerId: 'player-1' }]), /IMPORT_DUPLICATE_RECEIPT_PLAYER/)
  assert.throws(() => buildImportBatches([item(1), { ...item(2), requestId: 'request-1' }]), /IMPORT_DUPLICATE_REQUEST/)
  assert.throws(() => buildImportBatches([item(1), { ...item(2), position: 1 }]), /IMPORT_DUPLICATE_POSITION/)
  assert.throws(() => buildImportBatches([{ ...item(1), plan: { ...plan, selectCurrent: true } }]), /IMPORT_CANNOT_PUBLISH/)
  assert.throws(() => buildImportBatches([item(1)], 101), /IMPORT_BATCH_SIZE/)
})
