import { loadValueBindings } from './local-bindings'
// Read-only preparation. No database client, API transport or writer is opened.
import { resolve } from 'node:path'
import { prepareOfflineImport } from './offline-import-prep'
import assert from 'node:assert/strict'
import { preparePositiveOfflineImport } from './positive-import'

const args = process.argv.slice(2)
assert(args.length === 0 || (args.length === 1 && args[0] === '--positive-only'), 'IMPORT_PREP_ARGUMENTS')
const { offlineSelectionHash } = loadValueBindings()
const root = resolve('audit/output/value-global-offline-execution', offlineSelectionHash)
const selection = resolve('audit/output/value-global-remaining-preflight/selection.json')
if (args[0] === '--positive-only') {
  const prepared = await preparePositiveOfflineImport(selection, root)
  // Summary only: never print player IDs, amounts, plans or private receipts.
  console.log(JSON.stringify({ sourceReceipts: prepared.sourceReceipts, positiveCandidates: prepared.positiveCandidates,
    deferredNulls: prepared.deferredNulls, additionalPublicValues: prepared.additionalPublicValues,
    publicationAllowed: prepared.publicationAllowed,
    batches: prepared.batches.map(batch => ({ number: batch.number, count: batch.count,
      firstPosition: batch.firstPosition, lastPosition: batch.lastPosition, hash: batch.hash })) }))
} else {
  const prepared = await prepareOfflineImport(selection, root)
  console.log(JSON.stringify({ selectionHash: prepared.selectionHash, parentSelectionHash: prepared.parentSelectionHash,
    journalHash: prepared.journalHash, eventCount: prepared.eventCount, receipts: prepared.receipts,
    positive: prepared.positive, nulls: prepared.nulls, excluded: prepared.excluded,
    batches: prepared.batches.map(batch => ({ number: batch.number, count: batch.count,
      firstPosition: batch.firstPosition, lastPosition: batch.lastPosition, hash: batch.hash })) }))
}
