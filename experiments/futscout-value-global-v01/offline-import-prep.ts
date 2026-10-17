import { loadValueBindings } from './local-bindings'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { economicFingerprint } from '../../lib/economicData/value'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { sha } from './runner'


type Receipt = { mode: string; selectionHash: string; parentHash: string; requestId: string;
  playerId: string; originalPosition: number; observedAt: string; selectCurrent: boolean;
  inputHash: string; contentHash: string; plan: EconomicWrite; recordedAt: string; hash: string }
type Envelope = { record: { version: number; selectionHash: string; previous: string | null;
  event: { kind: string; id: string; payload: unknown } }; hash: string }

export type ImportItem = Readonly<{ position: number; requestId: string; playerId: string;
  receiptHash: string; contentHash: string; inputHash: string; plan: EconomicWrite }>

export function buildImportBatches(items: readonly ImportItem[], batchSize = 100) {
  assert(Number.isSafeInteger(batchSize) && batchSize > 0 && batchSize <= 100, 'IMPORT_BATCH_SIZE')
  assert.equal(new Set(items.map(item => item.playerId)).size, items.length, 'IMPORT_DUPLICATE_RECEIPT_PLAYER')
  assert.equal(new Set(items.map(item => item.requestId)).size, items.length, 'IMPORT_DUPLICATE_REQUEST')
  assert(items.every(item => item.plan.selectCurrent === false), 'IMPORT_CANNOT_PUBLISH')
  const ordered = [...items].sort((a, b) => a.position - b.position)
  assert(ordered.every((item, index) => index === 0 || item.position > ordered[index - 1].position), 'IMPORT_DUPLICATE_POSITION')
  return Array.from({ length: Math.ceil(ordered.length / batchSize) }, (_, index) => {
    const slice = ordered.slice(index * batchSize, (index + 1) * batchSize)
    return { number: index + 1, count: slice.length, firstPosition: slice[0].position,
      lastPosition: slice[slice.length - 1].position,
      hash: sha(JSON.stringify(slice.map(item => [item.position, item.requestId, item.receiptHash,
        item.inputHash, item.contentHash]))), items: slice }
  })
}

/** READ ONLY: bind the original immutable journal to every offline receipt before staging. */
export async function prepareOfflineImport(selectionFile: string, evidenceRoot: string, batchSize = 100) {
  assert(Number.isSafeInteger(batchSize) && batchSize > 0 && batchSize <= 100, 'IMPORT_BATCH_SIZE')
  const { offlineSelectionHash, parentSelectionHash } = loadValueBindings()
  const selectionBytes = await readFile(selectionFile)
  assert.equal(sha(selectionBytes), offlineSelectionHash, 'IMPORT_SELECTION_HASH')
  const selection = JSON.parse(selectionBytes.toString()) as { firstOriginalPosition: number; playerIds: string[]; parentSelectionHash: string }
  assert.equal(selection.parentSelectionHash, parentSelectionHash, 'IMPORT_PARENT_HASH')
  assert.equal(selection.firstOriginalPosition, 1058, 'IMPORT_FIRST_POSITION')
  assert.equal(selection.playerIds.length, 7647, 'IMPORT_SELECTION_COUNT')
  assert.equal(new Set(selection.playerIds).size, selection.playerIds.length, 'IMPORT_DUPLICATE_PLAYER')
  const positions = new Map(selection.playerIds.map((id, index) => [id, index + 1]))

  const journalDir = join(evidenceRoot, 'journal')
  const eventFiles = (await readdir(journalDir)).filter(name => /^\d{8}\.json$/.test(name)).sort()
  assert.equal(eventFiles.length, 42264, 'IMPORT_JOURNAL_COUNT')
  const done = new Map<string, number>()
  const excluded = new Set<string>()
  let previous: string | null = null
  for (let start = 0; start < eventFiles.length; start += 256) {
    const chunk = eventFiles.slice(start, start + 256)
    const entries = await Promise.all(chunk.map(async file => JSON.parse(await readFile(join(journalDir, file), 'utf8')) as Envelope))
    for (let offset = 0; offset < entries.length; offset++) {
    const index = start + offset
    assert.equal(eventFiles[index], `${String(index + 1).padStart(8, '0')}.json`, 'IMPORT_JOURNAL_SEQUENCE')
    const entry = entries[offset]
    assert.equal(entry.record.version, 1, 'IMPORT_JOURNAL_VERSION')
    assert.equal(entry.record.selectionHash, offlineSelectionHash, 'IMPORT_JOURNAL_SELECTION')
    assert.equal(entry.record.previous, previous, 'IMPORT_JOURNAL_CHAIN')
    assert.equal(entry.hash, sha(JSON.stringify(entry.record)), 'IMPORT_JOURNAL_HASH')
    previous = entry.hash
    const { kind, id, payload } = entry.record.event
    if (kind === 'DONE') {
      const position = (payload as { position?: number } | null)?.position
      assert(Number.isSafeInteger(position) && position! > 0 && position! <= selection.playerIds.length, 'IMPORT_DONE_POSITION')
      const playerId = selection.playerIds[position! - 1]
      assert.equal(id, `lfglobal-${parentSelectionHash.slice(0, 16)}-${playerId}`, 'IMPORT_DONE_ID')
      assert(!done.has(playerId) && !excluded.has(playerId), 'IMPORT_DONE_DUPLICATE')
      done.set(playerId, position!)
    }
    if (kind === 'IDENTITY_PENDING' || kind === 'QUARANTINED') {
      const playerId = id.match(/-(cm[a-zA-Z0-9]+)(?:-(?:search|profile))?$/)?.[1]
      if (playerId && positions.has(playerId)) {
        assert(!done.has(playerId), 'IMPORT_EXCLUDED_DONE')
        excluded.add(playerId)
      }
    }
    }
  }

  const receiptDir = join(evidenceRoot, 'receipts')
  const receiptFiles = (await readdir(receiptDir)).filter(name => name.endsWith('.json')).sort()
  assert.equal(receiptFiles.length, done.size, 'IMPORT_RECEIPT_COUNT')
  const items: ImportItem[] = []
  for (let start = 0; start < receiptFiles.length; start += 256) {
    const chunk = receiptFiles.slice(start, start + 256)
    const receipts = await Promise.all(chunk.map(async file => JSON.parse(await readFile(join(receiptDir, file), 'utf8')) as Receipt))
    for (let offset = 0; offset < receipts.length; offset++) {
    const file = chunk[offset]
    const receipt = receipts[offset]
    const { hash, ...body } = receipt
    assert.equal(hash, sha(JSON.stringify(body)), 'IMPORT_RECEIPT_HASH')
    assert.equal(file, `${receipt.requestId}.json`, 'IMPORT_RECEIPT_FILENAME')
    assert.equal(receipt.mode, 'OFFLINE_COLLECTION', 'IMPORT_RECEIPT_MODE')
    assert.equal(receipt.selectionHash, offlineSelectionHash, 'IMPORT_RECEIPT_SELECTION')
    assert.equal(receipt.parentHash, parentSelectionHash, 'IMPORT_RECEIPT_PARENT')
    assert.equal(receipt.originalPosition, 1057 + (done.get(receipt.playerId) ?? 0), 'IMPORT_RECEIPT_POSITION')
    assert(done.has(receipt.playerId) && !excluded.has(receipt.playerId), 'IMPORT_RECEIPT_NOT_DONE')
    assert.equal(receipt.requestId, `lfglobal-${parentSelectionHash.slice(0, 16)}-${receipt.playerId}`, 'IMPORT_RECEIPT_ID')
    assert.equal(receipt.playerId, receipt.plan.state.playerId, 'IMPORT_PLAN_PLAYER')
    assert.equal(receipt.observedAt, receipt.plan.observedAt, 'IMPORT_OBSERVED_AT')
    assert.equal(receipt.inputHash, sha(JSON.stringify(receipt.plan)), 'IMPORT_INPUT_HASH')
    assert.equal(receipt.contentHash, economicFingerprint(receipt.plan.state), 'IMPORT_CONTENT_HASH')
    assert.equal(receipt.selectCurrent, false, 'IMPORT_RECEIPT_CURRENT')
    assert.equal(receipt.plan.selectCurrent, false, 'IMPORT_PLAN_CURRENT')
    assert.equal(receipt.plan.state.provider, 'LIVE_FOOTBALL', 'IMPORT_PROVIDER')
    assert(typeof receipt.plan.state.providerPlayerId === 'string' && receipt.plan.state.providerPlayerId.length > 0, 'IMPORT_PROVIDER_PLAYER')
    assert.equal(receipt.plan.state.field, 'MARKET_VALUE', 'IMPORT_FIELD')
    assert.equal(receipt.plan.state.context, 'REAL_WORLD', 'IMPORT_CONTEXT')
    assert.equal(receipt.plan.state.confidence, 'HIGH', 'IMPORT_CONFIDENCE')
    assert.equal(receipt.plan.state.matchState, 'MATCHED', 'IMPORT_MATCH_STATE')
    assert(['VALUE', 'NULL'].includes(receipt.plan.state.presence), 'IMPORT_PRESENCE')
    if (receipt.plan.state.presence === 'VALUE') {
      assert.equal(receipt.plan.state.currency, 'EUR', 'IMPORT_CURRENCY')
      assert(Number(receipt.plan.state.amount) > 0, 'IMPORT_POSITIVE_VALUE')
    } else assert.equal(receipt.plan.state.amount, null, 'IMPORT_NULL_AMOUNT')
    assert.equal(receipt.plan.state.metadata.evidenceRef, 'value-global-v1', 'IMPORT_PROVENANCE')
    assert.equal(receipt.plan.state.metadata.source, 'LIVE_FOOTBALL/player', 'IMPORT_SOURCE')
    assert.equal(receipt.plan.state.metadata.sourceVersion, 'adapter-v1', 'IMPORT_SOURCE_VERSION')
    assert(Number.isFinite(Date.parse(receipt.observedAt)), 'IMPORT_OBSERVED_INSTANT')
    items.push({ position: done.get(receipt.playerId)!, requestId: receipt.requestId,
      playerId: receipt.playerId, receiptHash: hash, inputHash: receipt.inputHash,
      contentHash: receipt.contentHash, plan: receipt.plan })
    }
  }
  const positive = items.filter(item => item.plan.state.presence === 'VALUE').length
  const nulls = items.length - positive
  assert.equal(items.length, 5989, 'IMPORT_DONE_COUNT')
  assert.equal(positive, 1787, 'IMPORT_POSITIVE_COUNT')
  assert.equal(nulls, 4202, 'IMPORT_NULL_COUNT')
  assert.equal(excluded.size, 1658, 'IMPORT_EXCLUDED_COUNT')
  const batches = buildImportBatches(items, batchSize)
  return { selectionHash: offlineSelectionHash, parentSelectionHash, journalHash: previous,
    eventCount: eventFiles.length, receipts: items.length, positive, nulls, excluded: excluded.size, batches }
}
