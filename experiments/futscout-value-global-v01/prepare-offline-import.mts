import { loadValueBindings } from './local-bindings'
// Read-only preparation. No database client, API transport or writer is opened.
import { resolve } from 'node:path'
import { prepareOfflineImport } from './offline-import-prep'

const { offlineSelectionHash } = loadValueBindings()
const root = resolve('audit/output/value-global-offline-execution', offlineSelectionHash)
const selection = resolve('audit/output/value-global-remaining-preflight/selection.json')
const prepared = await prepareOfflineImport(selection, root)
console.log(JSON.stringify({ selectionHash: prepared.selectionHash, parentSelectionHash: prepared.parentSelectionHash,
  journalHash: prepared.journalHash, eventCount: prepared.eventCount, receipts: prepared.receipts,
  positive: prepared.positive, nulls: prepared.nulls, excluded: prepared.excluded,
  batches: prepared.batches.map(batch => ({ number: batch.number, count: batch.count,
    firstPosition: batch.firstPosition, lastPosition: batch.lastPosition, hash: batch.hash })) }))
