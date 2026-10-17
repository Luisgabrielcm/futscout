import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { economicFingerprint } from '../../lib/economicData/value'
import { adaptLiveFootballMarketValue } from '../../lib/economicData/liveFootball'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { buildImportBatches, type ImportItem } from './offline-import-prep'
import { validateValueBindings } from './local-bindings'
import { sha } from './runner'
import { runPreparedStagingBatch, type StagingImportOptions } from './staging-import'

async function fixture(run: (f: ReturnType<typeof setup>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'value-staging-import-'))
  try { await run(setup(root)) } finally { await rm(root, { recursive: true, force: true }) }
}
function setup(root: string) {
  const parent = 'a'.repeat(64), selection = 'b'.repeat(64)
  const players = ['synthetic001', 'synthetic002'].map(playerId => ({ playerId, clubId: 'synthetic-club', leagueId: 'synthetic-league' }))
  const items: ImportItem[] = players.map((player, index) => {
    const state = adaptLiveFootballMarketValue({ playerId: player.playerId, providerPlayerId: `provider-${index}`, field: 'MARKET_VALUE',
      marketValue: index ? null : '100.00', currency: 'EUR', confidence: 'HIGH', matchState: 'MATCHED' }).state
    state.metadata.evidenceRef = 'value-global-v1'
    const plan: EconomicWrite = { state, observedAt: '2026-01-01T00:00:00.000Z',
      requestId: `lfglobal-${parent.slice(0, 16)}-${player.playerId}`, selectCurrent: false,
      expectedRevision: null, selectionReason: 'AUTHORIZED_GLOBAL', policyVersion: 'global-v1' }
    return { position: index + 1, playerId: player.playerId, requestId: plan.requestId,
      receiptHash: sha(`synthetic-receipt-${index}`), contentHash: economicFingerprint(state), inputHash: sha(JSON.stringify(plan)), plan }
  })
  const stored = new Map<string, string>(), written: EconomicWrite[] = []
  let preflights = 0, checkpoints = 0
  const options: StagingImportOptions = { authorization: 'ISOLATED_STAGING_BATCH', generation: 'g1',
    valueBindings: validateValueBindings({ schemaVersion: 1, parentSelectionHash: parent, offlineSelectionHash: selection, quarantines: [] }),
    source: { selectionHash: selection, parentSelectionHash: parent, journalHash: 'c'.repeat(64) },
    batch: buildImportBatches(items)[0], players, journalRoot: root, sharedLockRoot: join(root, 'shared'),
    gate: {
      preflight: async (_players, progress) => { preflights++; assert.equal(progress.requests, 0); assert(progress.writes.every(plan => !plan.selectCurrent)) },
      existing: async () => false,
      write: async plan => { written.push(plan); stored.set(plan.requestId, sha(JSON.stringify(plan))) },
      readBack: async plan => !stored.has(plan.requestId) ? 'NOT_STARTED' :
        stored.get(plan.requestId) === sha(JSON.stringify(plan)) ? 'CONFIRMED' : 'CONFLICT',
      checkpoint: async () => { checkpoints++ },
    } }
  return { root, options, stored, written, counts: () => ({ preflights, checkpoints }) }
}

test('one synthetic VALUE/NULL batch uses the existing journal, never collects, never publishes and is idempotent', () => fixture(async f => {
  const result = await runPreparedStagingBatch(f.options)
  assert.deepEqual(result, { processed: 2, requests: 0, retries: 0 })
  assert.deepEqual(f.written.map(plan => [plan.state.presence, plan.state.amount, plan.selectCurrent]), [['VALUE', '100.00', false], ['NULL', null, false]])
  const journal = await Promise.all((await readdir(f.root)).filter(name => /^\d{8}\.json$/.test(name))
    .map(async name => JSON.parse(await readFile(join(f.root, name), 'utf8')).record.event))
  assert(journal.every(event => ['WRITE', 'DONE', 'CHECKPOINT'].includes(event.kind)))
  assert.deepEqual(await runPreparedStagingBatch(f.options), result)
  assert.equal(f.written.length, 2)
  assert.equal(f.counts().checkpoints, 1)
}))

test('lost write acknowledgement reconciles by existing read-back without replaying the committed item', () => fixture(async f => {
  const persist = f.options.gate.write
  let first = true
  f.options.gate.write = async plan => { await persist(plan); if (first) { first = false; throw Error('SYNTHETIC_ACK_LOST') } }
  await assert.rejects(runPreparedStagingBatch(f.options), /SYNTHETIC_ACK_LOST/)
  assert.equal(f.written.length, 1)
  assert.equal((await runPreparedStagingBatch(f.options)).processed, 2)
  assert.equal(f.written.length, 2)
  assert.equal(new Set(f.written.map(plan => plan.requestId)).size, 2)
}))

test('absence after an uncertain write is never permission to retry or advance', () => fixture(async f => {
  let attempts = 0
  f.options.gate.write = async () => { attempts++; throw Error('SYNTHETIC_WRITE_UNKNOWN') }
  await assert.rejects(runPreparedStagingBatch(f.options), /SYNTHETIC_WRITE_UNKNOWN/)
  await assert.rejects(runPreparedStagingBatch(f.options), /UNCERTAIN_WRITE_REQUIRES_REVIEW/)
  assert.equal(attempts, 1)
  assert.equal(f.stored.size, 0)
  assert.equal(f.counts().checkpoints, 0)
}))

for (const outcome of ['UNKNOWN', 'CONFLICT'] as const) test(`staging read-back ${outcome} stops before the next item`, () => fixture(async f => {
  f.options.gate.readBack = async () => outcome
  await assert.rejects(runPreparedStagingBatch(f.options), /READ_BACK_DIVERGENGENCE/)
  await assert.rejects(runPreparedStagingBatch(f.options), /UNCERTAIN_WRITE_REQUIRES_REVIEW/)
  assert.equal(f.written.length, 1)
}))

test('authorization, binding, order, cap and plan tampering reject before preflight or writes', () => fixture(async f => {
  const changes: ((options: StagingImportOptions) => void)[] = [
    o => { o.authorization = undefined as unknown as StagingImportOptions['authorization'] },
    o => { o.generation = 'g0' },
    o => { o.valueBindings = undefined as unknown as StagingImportOptions['valueBindings'] },
    o => { o.source.selectionHash = 'd'.repeat(64) },
    o => { o.source.journalHash = 'invalid' },
    o => { o.batch.hash = '0'.repeat(64) },
    o => { o.batch.items = [] },
    o => { o.batch.items = Array(101).fill(o.batch.items[0]) },
    o => { o.batch.items[0].plan.selectCurrent = true },
    o => { o.batch.items[0].plan.state.amount = '999.00' },
    o => { o.players = [...o.players].reverse() },
    o => {
      const item = o.batch.items[0]
      item.plan.state.confidence = 'LOW'
      o.batch = buildImportBatches([{ ...item, inputHash: sha(JSON.stringify(item.plan)), contentHash: economicFingerprint(item.plan.state) }, o.batch.items[1]])[0]
    },
  ]
  for (const change of changes) {
    const options = { ...f.options, ...structuredClone({ source: f.options.source, batch: f.options.batch, players: f.options.players }) }
    change(options)
    await assert.rejects(runPreparedStagingBatch(options))
  }
  assert.equal(f.counts().preflights, 0)
  assert.equal(f.written.length, 0)
  assert.deepEqual((await readdir(f.root)).filter(name => name !== 'shared'), [])
}))

test('source and generation changes cannot reuse a journal, and rehashed plan tampering is rejected', () => fixture(async f => {
  f.options.gate.write = async () => { throw Error('SYNTHETIC_STOP') }
  await assert.rejects(runPreparedStagingBatch(f.options), /SYNTHETIC_STOP/)
  for (const options of [{ ...f.options, generation: 'g2' },
    { ...f.options, source: { ...f.options.source, journalHash: 'd'.repeat(64) } }]) {
    await assert.rejects(runPreparedStagingBatch(options), /SELECTION_CHANGED/)
  }
  const file = join(f.root, '00000001.json'), envelope = JSON.parse(await readFile(file, 'utf8'))
  envelope.record.event.payload.state.amount = '999.00'
  envelope.hash = sha(JSON.stringify(envelope.record))
  await writeFile(file, JSON.stringify(envelope))
  await assert.rejects(runPreparedStagingBatch(f.options), /IMPORT_JOURNAL_PLAN_CHANGED/)
  assert.equal(f.counts().preflights, 1)
}))

test('the prepared input is detached before awaiting the target preflight', () => fixture(async f => {
  f.options.gate.preflight = async () => { f.options.batch.items[0].plan.state.amount = '999.00' }
  await runPreparedStagingBatch(f.options)
  assert.equal(f.written[0].state.amount, '100.00')
}))

test('target preflight failure and existing observations never reach the writer', () => fixture(async f => {
  f.options.gate.preflight = async () => { throw Error('ISOLATED_TARGET_NOT_VERIFIED') }
  await assert.rejects(runPreparedStagingBatch(f.options), /ISOLATED_TARGET_NOT_VERIFIED/)
  f.options.gate.preflight = async () => {}
  f.options.gate.existing = async () => true
  await assert.rejects(runPreparedStagingBatch(f.options), /EXISTING_VALUE_OR_CONSULTATION/)
  assert.equal(f.written.length, 0)
}))

test('the existing shared lock excludes a second caller with a different journal directory', () => fixture(async f => {
  let entered!: () => void, unblock!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const blocked = new Promise<void>(resolve => { unblock = resolve })
  f.options.gate.preflight = async () => { entered(); await blocked }
  const first = runPreparedStagingBatch(f.options)
  await ready
  try {
    await assert.rejects(runPreparedStagingBatch({ ...f.options, journalRoot: join(f.root, 'other-journal') }), /EEXIST/)
  } finally { unblock(); await first }
  assert.equal(f.written.length, 2)
}))
