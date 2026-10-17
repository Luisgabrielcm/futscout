import assert from 'node:assert/strict'
import { buildImportBatches } from './offline-import-prep'
import { validateValueBindings, type ValueBindings } from './local-bindings'
import { runGlobal, sha, type Dependencies, type Player } from './runner'
import { acquireGlobalLock } from './global-lock'
import { captureCleanup } from './diagnostics'

type Batch = ReturnType<typeof buildImportBatches>[number]
export type StagingImportGate = Pick<Dependencies, 'preflight' | 'existing' | 'write' | 'readBack' | 'checkpoint'>
export type StagingImportOptions = {
  authorization: 'ISOLATED_STAGING_BATCH'
  generation: string
  valueBindings: ValueBindings
  source: { selectionHash: string; parentSelectionHash: string; journalHash: string }
  batch: Batch
  players: readonly Player[]
  journalRoot: string
  sharedLockRoot: string
  gate: StagingImportGate
}

/** One batch from prepareOfflineImport. No CLI, ambient credentials, collection or default database binding. */
export async function runPreparedStagingBatch(options: StagingImportOptions) {
  assert.equal(options.authorization, 'ISOLATED_STAGING_BATCH', 'IMPORT_AUTHORIZATION_REQUIRED')
  assert(/^g[1-9][0-9]*$/.test(options.generation), 'STAGING_GENERATION')
  const valueBindings = validateValueBindings(options.valueBindings)
  const { source, batch, players } = structuredClone({ source: options.source, batch: options.batch, players: options.players })
  assert(batch.items.length > 0 && batch.items.length <= 100, 'IMPORT_SINGLE_BATCH_ONLY')
  assert(Number.isSafeInteger(batch.number) && batch.number > 0, 'IMPORT_BATCH_NUMBER')
  const normalized = buildImportBatches(batch.items)[0]
  assert(batch.hash === normalized.hash && batch.count === normalized.count &&
    batch.firstPosition === normalized.firstPosition && batch.lastPosition === normalized.lastPosition, 'IMPORT_BATCH_METADATA')
  const binding = { sourceSelectionHash: source.selectionHash, parentSelectionHash: source.parentSelectionHash,
    journalHash: source.journalHash, batchHash: batch.hash }
  // This journal belongs to one exact source, batch, input context and generation.
  const bytes = Buffer.from(JSON.stringify({ players, excludedIds: [], importBinding: { ...binding, generation: options.generation } }))
  const refuseCollection = (): never => { throw new Error('IMPORT_COLLECTION_FORBIDDEN') }
  const release = await acquireGlobalLock(options.sharedLockRoot, source.selectionHash)
  let failed = false, primary: unknown
  try {
    return await runGlobal(bytes, sha(bytes), options.journalRoot, {
      ...options.gate, valueBindings, stagingGeneration: options.generation,
      preparedImport: { ...binding, items: normalized.items },
      search: async () => refuseCollection(), profile: async () => refuseCollection(),
      choose: refuseCollection, adapt: refuseCollection,
    }, 0)
  } catch (error) { failed = true; primary = error; throw error }
  finally {
    try { await release() } catch (error) { if (failed) captureCleanup(primary, error); else throw error }
  }
}
