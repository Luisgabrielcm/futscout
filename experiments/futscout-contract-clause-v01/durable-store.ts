import { open, mkdir, readdir, readFile, rename, lstat, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hash } from './contract'
import { assertPlan, type Plan } from './planner'
import { startReplay, replayStep, reconcileReplay, simulateReceipt, type Replay, type Receipt } from './replay'
import { assertRegistry, ensure, identifier, type Registry } from './source-registry'

export const durableVersion = 'contract-sync-durable-v0.1'
type Status = 'BEGIN' | 'APPLIED' | 'NOT_APPLIED' | 'CHECKPOINT'
type Entry = {
  schemaVersion: typeof durableVersion; runId: string; selectionHash: string; registryHash: string
  sequence: number; previousHash: string | null; position: number; requestId: string | null
  status: Status; payloadHash: string | null; receiptHash: string | null
  observedAt: string | null; provenanceHash: string | null; reference: string | null; replayHash: string
}
type Envelope = { entry: Entry; integrityHash: string }
export interface ReceiptCheckpointStorage {
  recover(): Replay
  begin(requestId: string): Promise<Replay>
  confirm(receipt: Receipt, reference: string): Promise<Replay>
  reconcileNotApplied(requestId: string, reference: string): Promise<Replay>
  checkpoint(): Promise<void>
  close(): Promise<void>
}
type FaultHook = (phase: 'BEFORE_RENAME' | 'AFTER_RENAME', status: Status) => void
function safeReference(value: string) {
  identifier(value)
  ensure(!value.includes('..') && !value.includes('://'), 'UNSAFE_REFERENCE')
}
async function regularFile(path: string) {
  const stat = await lstat(path)
  ensure(stat.isFile() && !stat.isSymbolicLink(), 'UNSAFE_FILE')
}
async function directory(path: string) {
  const stat = await lstat(path)
  ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_DIRECTORY')
}

// Experimental, cooperative single-writer journal. No source text, URLs, credentials or raw payloads.
// The caller must preserve the frozen plan independently; receipts are verified against it on recovery.
export class JsonReceiptCheckpointStore implements ReceiptCheckpointStorage {
  private state: Replay
  private sequence = 0
  private previousHash: string | null = null
  private closed = false
  private poisoned = false
  private busy = false
  private constructor(private dir: string, private runId: string, private plan: Plan,
    private registry: Registry, private lock: Awaited<ReturnType<typeof open>>, private fault?: FaultHook) {
    this.state = startReplay(plan)
  }
  static async create(root: string, runId: string, plan: Plan, registry: Registry, fault?: FaultHook) {
    ensure(/^[a-zA-Z0-9_-]{1,80}$/.test(runId), 'UNSAFE_RUN_ID'); safeReference(runId)
    assertPlan(plan); assertRegistry(registry)
    ensure(plan.registryHash === registry.registryHash, 'REGISTRY_CHANGED')
    const base = resolve(root)
    await mkdir(base, { recursive: true }); await directory(base)
    const dir = join(base, runId)
    await mkdir(dir, { recursive: true }); await directory(dir)
    const lock = await open(join(dir, 'writer.lock'), 'wx', 0o600)
    const store = new JsonReceiptCheckpointStore(dir, runId, structuredClone(plan), structuredClone(registry), lock, fault)
    try {
      await store.load()
      if (store.sequence === 0) await store.checkpoint()
      return store
    } catch (error) { await store.close(); throw error }
  }
  private entry(status: Status, requestId: string | null, receipt: Receipt | null, reference: string | null, next: Replay): Entry {
    const index = requestId === null ? -1 : this.plan.queue.findIndex(j => j.requestId === requestId)
    const job = this.plan.queue[index]
    if (requestId !== null) { safeReference(requestId); ensure(job, 'UNKNOWN_REQUEST') }
    if (reference !== null) safeReference(reference)
    // Dates come from the captured evidence, never from the time of replay or file creation.
    const observedAt = job?.input.contract.observedAt ?? null
    if (observedAt !== null) ensure(Number.isFinite(Date.parse(observedAt)) && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(observedAt), 'INVALID_OBSERVED_AT')
    return {
      schemaVersion: durableVersion, runId: this.runId, selectionHash: this.plan.planHash,
      registryHash: this.registry.registryHash, sequence: this.sequence + 1, previousHash: this.previousHash,
      position: requestId === null ? next.cursor : index + 1, requestId, status,
      payloadHash: job?.payloadHash ?? null, receiptHash: receipt === null ? null : hash(receipt), observedAt,
      provenanceHash: job ? hash({ sourceId: job.sourceId, sourceVersion: job.sourceVersion,
        provenance: job.input.contract.provenance }) : null,
      reference, replayHash: next.replayHash,
    }
  }
  private transition(status: Status, requestId: string | null, reference: string | null, receipt?: Receipt): Replay {
    if (status === 'CHECKPOINT') return structuredClone(this.state)
    const job = this.plan.queue[this.state.cursor]
    ensure(job && job.requestId === requestId, 'OUT_OF_ORDER')
    if (status === 'BEGIN') return replayStep(this.plan, this.state, this.registry,
      { kind: 'UNCERTAIN', requestId: job.requestId, payloadHash: job.payloadHash })
    ensure(reference !== null, 'RECONCILIATION_REFERENCE_REQUIRED')
    if (status === 'APPLIED') {
      ensure(receipt, 'RECEIPT_REQUIRED')
      return reconcileReplay(this.plan, this.state, this.registry, { requestId: job.requestId, reference, outcome: 'APPLIED', receipt })
    }
    ensure(status === 'NOT_APPLIED', 'INVALID_STATUS')
    return reconcileReplay(this.plan, this.state, this.registry, { requestId: job.requestId, reference, outcome: 'NOT_APPLIED' })
  }
  private async load() {
    const names = await readdir(this.dir)
    ensure(names.every(n => n === 'writer.lock' || /^\d{10}\.json$/.test(n) || /^pending-[a-f0-9-]+\.tmp$/.test(n)), 'UNEXPECTED_FILE')
    // Uncommitted temporary files are never interpreted as receipts. They are retained for review.
    for (const name of names.filter(n => n.endsWith('.json')).sort()) {
      ensure(name === `${String(this.sequence + 1).padStart(10, '0')}.json`, 'JOURNAL_GAP')
      const path = join(this.dir, name); await regularFile(path)
      const envelope: Envelope = JSON.parse(await readFile(path, 'utf8'))
      const e = envelope.entry
      ensure(e && envelope.integrityHash === hash(e), 'INTEGRITY_MISMATCH')
      ensure(e.schemaVersion === durableVersion && e.runId === this.runId && e.selectionHash === this.plan.planHash &&
        e.registryHash === this.registry.registryHash, 'SELECTION_OR_CONTEXT_MISMATCH')
      const receipt = e.status === 'APPLIED' ? simulateReceipt(this.plan, this.state.cursor, this.registry) : null
      const next = this.transition(e.status, e.requestId, e.reference, receipt ?? undefined)
      const expected = this.entry(e.status, e.requestId, receipt, e.reference, next)
      ensure(hash(envelope) === hash({ entry: expected, integrityHash: hash(expected) }), 'JOURNAL_DIVERGENCE')
      this.state = next; this.sequence++; this.previousHash = envelope.integrityHash
    }
  }
  private async append(status: Status, requestId: string | null, receipt: Receipt | null, reference: string | null, next: Replay) {
    const entry = this.entry(status, requestId, receipt, reference, next)
    const envelope: Envelope = { entry, integrityHash: hash(entry) }
    const temp = join(this.dir, `pending-${randomUUID()}.tmp`)
    const target = join(this.dir, `${String(entry.sequence).padStart(10, '0')}.json`)
    try {
      // Exclusive lock + append-only sequence prevents cooperative writers overwriting history.
      ensure(!(await readdir(this.dir)).includes(`${String(entry.sequence).padStart(10, '0')}.json`), 'HISTORY_EXISTS')
      const file = await open(temp, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify(envelope) + '\n', 'utf8'); await file.sync() } finally { await file.close() }
      this.fault?.('BEFORE_RENAME', status)
      await rename(temp, target)
      this.fault?.('AFTER_RENAME', status)
      this.sequence++; this.previousHash = envelope.integrityHash; this.state = next
    } catch (error) { this.poisoned = true; throw error }
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    ensure(!this.closed && !this.poisoned, 'STORE_REQUIRES_REOPEN')
    ensure(!this.busy, 'CONCURRENT_OPERATION'); this.busy = true
    try { return await action() } finally { this.busy = false }
  }
  recover() { ensure(!this.closed && !this.poisoned, 'STORE_REQUIRES_REOPEN'); return structuredClone(this.state) }
  async begin(requestId: string) {
    return this.exclusive(async () => {
      if (this.state.receipts.some(r => r.requestId === requestId)) return this.recover()
      await this.append('BEGIN', requestId, null, null, this.transition('BEGIN', requestId, null))
      return this.recover()
    })
  }
  async confirm(receipt: Receipt, reference: string) {
    return this.exclusive(async () => {
      const prior = this.state.receipts.find(r => r.requestId === receipt.requestId)
      if (prior) { ensure(hash(prior) === hash(receipt), 'RECEIPT_COLLISION'); return this.recover() }
      await this.append('APPLIED', receipt.requestId, receipt, reference, this.transition('APPLIED', receipt.requestId, reference, receipt))
      if (this.state.cursor % 25 === 0 || this.state.cursor === this.plan.queue.length)
        await this.append('CHECKPOINT', null, null, null, this.state)
      return this.recover()
    })
  }
  async reconcileNotApplied(requestId: string, reference: string) {
    return this.exclusive(async () => {
      await this.append('NOT_APPLIED', requestId, null, reference, this.transition('NOT_APPLIED', requestId, reference))
      return this.recover()
    })
  }
  async checkpoint() { return this.exclusive(() => this.append('CHECKPOINT', null, null, null, this.state)) }
  async close() {
    ensure(!this.busy, 'CONCURRENT_OPERATION')
    if (this.closed) return
    this.closed = true
    await this.lock.close(); await unlink(join(this.dir, 'writer.lock'))
  }
}
