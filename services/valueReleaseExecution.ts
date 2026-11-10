// Operational journal around the existing stage-only service. No ambient URL,
// publication, alternate writer, database retry, or modification of frozen data.
import fs from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '../app/generated/prisma/client'
import { canonicalEconomicDecimal } from '../lib/economicData/decimal'
import { activationHash, stageValueActivation, withdrawValueActivation, verifyValueActivationBundle,
  type ValueActivationBundle, type ValueStagingReceipt } from './valueActivationPreparation'
import type { EconomicAuthorization } from './playerEconomicPersistence'

type ReceiptRow = ValueStagingReceipt['rows'][number]
type Baseline = { currentHash: string; providerHistoryHash: string; itemCurrents: string[] }
type Header = { kind: 'HEADER'; batchHash: string; bundleSha256: string; targetHash: string; baseline: Baseline }
type Event = Header | { kind: 'PENDING'; index: number } |
  { kind: 'COMMITTED'; index: number; row: ReceiptRow } | { kind: 'WITHDRAWN'; receiptHash: string }
type Line = { sequence: number; previous: string | null; event: Event; hash: string }
type JournalState = { header: Header | undefined; pending: number | undefined; rows: ReceiptRow[]; withdrawn: boolean }
function fail(code: string): never { throw Error(`RELEASE_${code}`) }

// Append+fsync makes every acknowledged event durable. A torn final line is
// rejected, never silently truncated; its last write may already have committed.
export class ValueReleaseJournal {
  private readonly lines: Line[] = []
  private validated = 0
  private cached: JournalState = { header: undefined, pending: undefined, rows: [], withdrawn: false }
  constructor(readonly file: string) {
    if (!fs.existsSync(file)) return
    const text = fs.readFileSync(file, 'utf8')
    if (!text.endsWith('\n')) fail('JOURNAL_TORN')
    for (const raw of text.trimEnd().split('\n')) {
      const line = JSON.parse(raw) as Line
      const { hash, ...body } = line
      if (line.sequence !== this.lines.length || line.previous !== (this.lines.at(-1)?.hash ?? null) ||
          activationHash(body) !== hash) fail('JOURNAL_HASH')
      this.lines.push(line)
    }
    this.state()
  }
  append(event: Event) {
    const body = { sequence: this.lines.length, previous: this.lines.at(-1)?.hash ?? null, event }
    const line = { ...body, hash: activationHash(body) }
    const fd = fs.openSync(this.file, this.lines.length ? 'a' : 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(line) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    this.lines.push(line)
    // On POSIX also persist directory creation/entry metadata. Windows does not
    // permit opening directories this way; file FlushFileBuffers is used above.
    if (process.platform !== 'win32') {
      const dir = fs.openSync(path.dirname(this.file), 'r')
      try { fs.fsyncSync(dir) } finally { fs.closeSync(dir) }
    }
  }
  state() {
    let { header, pending, withdrawn } = this.cached
    const rows = this.cached.rows
    for (const { event } of this.lines.slice(this.validated)) {
      if (event.kind === 'HEADER') {
        if (header || rows.length || pending !== undefined) fail('JOURNAL_HEADER')
        header = event
      } else if (!header || withdrawn) fail('JOURNAL_ORDER')
      else if (event.kind === 'PENDING') {
        if (pending !== undefined || event.index !== rows.length) fail('JOURNAL_PENDING')
        pending = event.index
      } else if (event.kind === 'COMMITTED') {
        if (pending !== event.index || event.index !== rows.length) fail('JOURNAL_COMMIT')
        rows.push(event.row); pending = undefined
      } else {
        if (pending !== undefined || event.receiptHash !== activationHash({ batchHash: header.batchHash, status: 'STAGED', rows })) fail('JOURNAL_WITHDRAWAL')
        withdrawn = true
      }
    }
    this.validated = this.lines.length
    this.cached = { header, pending, rows, withdrawn }
    return this.cached
  }
}

export type ReleaseMode = 'preflight' | 'import' | 'reconcile' | 'withdraw'
export async function executeValueRelease(options: {
  mode: ReleaseMode; bundle: ValueActivationBundle; bundleSha256: string; targetHash: string;
  journalFile: string; client: PrismaClient; grants: readonly EconomicAuthorization[];
  providerBaseline: { playerId: string; eaId: string; amount: string }[];
  verifyLease?: () => void;
  onProgress?: (completed: number) => void;
  // Only used by local tests to reproduce commit-before-checkpoint interruption.
  afterCommitBeforeJournal?: (index: number) => Promise<void>
}) {
  const { bundle, client, mode } = options
  verifyValueActivationBundle(bundle)
  if (bundle.items.length !== 12280 || bundle.providerPlayersPreserved.length !== 3948 ||
      new Set(bundle.items.map(i => i.playerId)).size !== 12280 ||
      new Set(bundle.items.map(i => i.eaId)).size !== 12280 ||
      new Set(bundle.items.map(i => i.plan.requestId)).size !== 12280 ||
      new Set(bundle.providerPlayersPreserved).size !== 3948 ||
      bundle.items.some(i => bundle.providerPlayersPreserved.includes(i.playerId))) fail('BUNDLE_SCOPE')
  for (const hash of [options.bundleSha256, options.targetHash]) if (!/^[a-f0-9]{64}$/.test(hash)) fail('INPUT_HASH')
  if (options.providerBaseline.length !== 3948 || new Set(options.providerBaseline.map(p => p.playerId)).size !== 3948 ||
      options.providerBaseline.some(p => !bundle.providerPlayersPreserved.includes(p.playerId))) fail('PROVIDER_SCOPE')
  const currentRows = () => client.playerEconomicCurrent.findMany({ orderBy: [{ playerId: 'asc' }, { field: 'asc' }] })
  const providerHistory = async () => activationHash(await client.$queryRaw`
    SELECT 'STATE' AS kind,row_to_json(s)::text AS record FROM public."PlayerEconomicState" s WHERE provider<>'FUTSCOUT_VALUE'
    UNION ALL SELECT 'OBSERVATION',row_to_json(o)::text FROM public."PlayerEconomicObservation" o
    JOIN public."PlayerEconomicState" s ON s.id=o."stateId" WHERE s.provider<>'FUTSCOUT_VALUE' ORDER BY kind,record`)
  const allCurrents = await currentRows()
  const byPlayer = new Map(allCurrents.filter(c => c.field === 'MARKET_VALUE').map(c => [c.playerId, c]))
  const baseline: Baseline = { currentHash: activationHash(allCurrents), providerHistoryHash: await providerHistory(),
    itemCurrents: bundle.items.map(i => activationHash(byPlayer.get(i.playerId) ?? null)) }
  const identities = new Map((await client.player.findMany({ where: { id: { in: [...bundle.items.map(i => i.playerId), ...bundle.providerPlayersPreserved] } },
    select: { id: true, externalId: true } })).map(p => [p.id, p.externalId]))
  if (bundle.items.some(i => identities.get(i.playerId) !== i.eaId)) fail('IDENTITY_CONFLICT')
  const providerStates = await client.playerEconomicState.findMany({ where: { playerId: { in: bundle.providerPlayersPreserved },
    provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', presence: 'VALUE', currency: 'EUR',
    status: 'VALID', confidence: 'HIGH', matchState: 'MATCHED' }, select: { playerId: true, amount: true } })
  const matches = new Set(providerStates.filter(s => s.amount !== null).map(s => `${s.playerId}:${canonicalEconomicDecimal(s.amount!.toString())}`))
  if (options.providerBaseline.some(p => identities.get(p.playerId) !== p.eaId || !matches.has(`${p.playerId}:${canonicalEconomicDecimal(p.amount)}`))) fail('PROVIDER_BASELINE_CHANGED')
  const precision = await client.$queryRaw<{ precision: number; scale: number }[]>`
    SELECT numeric_precision::int AS precision,numeric_scale::int AS scale FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PlayerEconomicState' AND column_name='amount'`
  if (precision.length !== 1 || precision[0].precision !== 38 || precision[0].scale !== 18) fail('PRECISION')
  const journal = new ValueReleaseJournal(options.journalFile)
  const initial = journal.state()
  if (initial.header && (initial.header.batchHash !== bundle.batchHash || initial.header.bundleSha256 !== options.bundleSha256 ||
      initial.header.targetHash !== options.targetHash)) fail('JOURNAL_BINDING')
  const frozen = initial.header?.baseline ?? baseline
  if (activationHash(frozen) !== activationHash(baseline)) fail('BASELINE_CHANGED')
  const checkBaseline = async () => {
    options.verifyLease?.()
    if (activationHash(await currentRows()) !== frozen.currentHash || await providerHistory() !== frozen.providerHistoryHash) fail('BASELINE_CHANGED')
  }
  if (mode === 'preflight') return { status: 'PREFLIGHT_READY', completed: initial.rows.length, pending: initial.pending !== undefined, withdrawn: initial.withdrawn }
  if (!initial.header) {
    if (mode !== 'import') fail('JOURNAL_MISSING')
    journal.append({ kind: 'HEADER', batchHash: bundle.batchHash, bundleSha256: options.bundleSha256,
      targetHash: options.targetHash, baseline })
  }
  if (mode === 'reconcile') {
    if (initial.withdrawn) fail('WITHDRAWN')
    if (initial.pending === undefined) return { status: 'NO_PENDING_WRITE', completed: initial.rows.length }
    const index = initial.pending, item = bundle.items[index]
    const observation = await client.playerEconomicObservation.findUnique({ where: { requestId: item.plan.requestId }, include: { state: true } })
    // Absence alone cannot prove that a lost transaction has terminated.
    if (!observation) fail('PENDING_WRITE_NOT_FOUND_CONFIRM_TERMINATION')
    if (observation.playerId !== item.playerId || observation.field !== 'MARKET_VALUE' ||
        observation.state.contentHash !== item.contentHash || observation.state.provider !== 'FUTSCOUT_VALUE' ||
        observation.observedAt.toISOString() !== item.plan.observedAt ||
        canonicalEconomicDecimal(observation.state.amount!.toString()) !== canonicalEconomicDecimal(item.plan.state.amount!)) fail('PENDING_WRITE_CONFLICT')
    await checkBaseline()
    journal.append({ kind: 'COMMITTED', index, row: { playerId: item.playerId, requestId: item.plan.requestId,
      stateId: observation.stateId, observationId: observation.id, originalCurrentHash: frozen.itemCurrents[index] } })
    return { status: 'RECONCILED_COMMITTED_WRITE', completed: index + 1 }
  }
  if (initial.pending !== undefined) fail('PENDING_REQUIRES_RECONCILIATION')
  if (mode === 'withdraw') {
    if (initial.rows.length !== bundle.items.length) fail('WITHDRAWAL_INCOMPLETE')
    const receipt: ValueStagingReceipt = { batchHash: bundle.batchHash, status: 'STAGED', rows: initial.rows }
    const result = await withdrawValueActivation(bundle, receipt, client)
    await checkBaseline()
    if (!initial.withdrawn) journal.append({ kind: 'WITHDRAWN', receiptHash: activationHash(receipt) })
    return result
  }
  if (initial.withdrawn) fail('WITHDRAWN')
  let index = 0
  const receipt = await stageValueActivation(bundle, client, options.grants, precision[0], async row => {
    options.verifyLease?.()
    const state = journal.state()
    if (row.originalCurrentHash !== frozen.itemCurrents[index]) fail('CURRENT_CHANGED')
    if (index < state.rows.length) {
      if (activationHash(row) !== activationHash(state.rows[index])) fail('REPLAY_CHANGED')
    } else {
      await options.afterCommitBeforeJournal?.(index)
      journal.append({ kind: 'COMMITTED', index, row })
    }
    index++
    if (index % 1000 === 0) options.onProgress?.(index)
  }, async (item, itemIndex) => {
    options.verifyLease?.()
    if (itemIndex % 1000 === 0) await checkBaseline()
    const current = await client.playerEconomicCurrent.findUnique({ where: { playerId_field: { playerId: item.playerId, field: 'MARKET_VALUE' } } })
    if (activationHash(current) !== frozen.itemCurrents[itemIndex]) fail('CURRENT_CHANGED')
    if (itemIndex >= journal.state().rows.length) journal.append({ kind: 'PENDING', index: itemIndex })
  })
  await checkBaseline()
  return { status: 'STAGED', completed: receipt.rows.length, receiptHash: activationHash(receipt), currentChanged: false }
}
