import assert from 'node:assert/strict'
import { buildImportBatches, prepareOfflineImport, validateImportItem } from './offline-import-prep'

type Prepared = Awaited<ReturnType<typeof prepareOfflineImport>>

/** Pure prioritization AFTER prepareOfflineImport verifies the private receipts/journal.
 * This is not evidence verification, a publication grant or a second importer.
 */
export function buildPositiveImportPlan(input: Prepared, batchSize = 100) {
  const prepared = structuredClone(input)
  const { selectionHash, parentSelectionHash, journalHash } = prepared
  assert([selectionHash, parentSelectionHash, journalHash].every(hash =>
    typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)), 'POSITIVE_IMPORT_SOURCE')
  assert.notEqual(selectionHash, parentSelectionHash, 'POSITIVE_IMPORT_SOURCE')
  // Validate the complete source, including deferred NULLs. Filtering must not
  // conceal an invalid item, duplicate or tampered batch from the original plan.
  const items = prepared.batches.flatMap((batch, index) => {
    assert.equal(batch.number, index + 1, 'POSITIVE_IMPORT_BATCH_ORDER')
    assert(batch.items.length > 0 && batch.items.length <= 100, 'POSITIVE_IMPORT_BATCH_SIZE')
    const normalized = buildImportBatches(batch.items)[0]
    assert.equal(batch.hash, normalized.hash, 'POSITIVE_IMPORT_BATCH_HASH')
    assert.equal(batch.count, normalized.count, 'POSITIVE_IMPORT_BATCH_COUNT')
    assert.equal(batch.firstPosition, normalized.firstPosition, 'POSITIVE_IMPORT_BATCH_POSITION')
    assert.equal(batch.lastPosition, normalized.lastPosition, 'POSITIVE_IMPORT_BATCH_POSITION')
    assert.deepEqual(batch.items, normalized.items, 'POSITIVE_IMPORT_ITEM_ORDER')
    return batch.items
  })
  buildImportBatches(items) // also checks duplicates across source batches
  assert(items.every((item, index) => index === 0 || item.position > items[index - 1].position), 'POSITIVE_IMPORT_POSITION_ORDER')
  items.forEach(item => validateImportItem(item, parentSelectionHash))
  const positives = items.filter(item => item.plan.state.presence === 'VALUE')
  const nulls = items.length - positives.length
  assert.equal(prepared.receipts, items.length, 'POSITIVE_IMPORT_RECEIPT_COUNT')
  assert.equal(prepared.positive, positives.length, 'POSITIVE_IMPORT_VALUE_COUNT')
  assert.equal(prepared.nulls, nulls, 'POSITIVE_IMPORT_NULL_COUNT')
  return {
    source: { selectionHash, parentSelectionHash, journalHash: journalHash! },
    sourceReceipts: items.length, positiveCandidates: positives.length, deferredNulls: nulls,
    // Unknown overlap/current eligibility cannot be reported as coverage gain.
    additionalPublicValues: null, publicationAllowed: false as const,
    batches: buildImportBatches(positives, batchSize),
  }
}

/** Read-only entry point: never accepts unverified real receipts as prepared input. */
export async function preparePositiveOfflineImport(selectionFile: string, evidenceRoot: string, batchSize = 100) {
  return buildPositiveImportPlan(await prepareOfflineImport(selectionFile, evidenceRoot), batchSize)
}
