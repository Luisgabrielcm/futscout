import { syntheticBindings } from './synthetic-bindings.fixture'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGlobal, sha, type Dependencies, type QuarantineApproval } from './runner'

const playerId = 'synthetic-player-01'
async function fixture(fn: (f: Awaited<ReturnType<typeof seed>>) => Promise<void>) {
  const f = await seed()
  try { await fn(f) } finally { await rm(f.root, { recursive: true, force: true }) }
}
async function seed() {
  const root = await mkdtemp(join(tmpdir(), 'value-quarantine-'))
  const players = Array.from({ length: 375 }, (_, i) => ({ playerId: i < 373 ? `a${String(i).padStart(3, '0')}` : i === 373 ? playerId : 'z375', leagueId: 'league', clubId: 'club' }))
  const bytes = Buffer.from(JSON.stringify({ players, excludedIds: [] })), hash = sha(bytes)
  let previous: string | null = null, sequence = 0
  async function append(event: unknown) {
    const record = { version: 1, selectionHash: hash, previous, event }
    previous = sha(JSON.stringify(record)); sequence++
    await writeFile(join(root, `${String(sequence).padStart(8, '0')}.json`), JSON.stringify({ record, hash: previous }))
  }
  for (let i = 0; i < 373; i++) {
    const id = `lfglobal-${hash.slice(0, 16)}-${players[i].playerId}`
    await append({ kind: 'REQUEST', id: `${id}-search`, payload: null })
    await append({ kind: 'RESPONSE', id: `${id}-search`, payload: { data: [], observedAt: '2026-10-09T12:00:00Z' } })
    await append({ kind: 'DONE', id, payload: { position: i + 1 } })
    if ((i + 1) % 25 === 0) await append({ kind: 'CHECKPOINT', id: String(i + 1), payload: { batch: Math.ceil((i + 1) / 100) } })
  }
  const requestId = `lfglobal-${hash.slice(0, 16)}-${playerId}-search`
  await append({ kind: 'REQUEST', id: requestId, payload: null })
  const approval: QuarantineApproval = { approved: true, selectionHash: hash, position: 374, playerId, requestId,
    originalRequestHash: previous!, approvedAt: new Date().toISOString(), approvalReference: 'synthetic-operator-approval' }
  const calls: string[] = []
  const deps: Dependencies = { valueBindings: syntheticBindings(hash, [approval]), wait: async () => {}, preflight: async () => {}, existing: async () => false,
    search: async p => { calls.push(p.playerId); return { data: [], observedAt: '2026-10-09T12:00:00Z' } }, choose: () => null,
    profile: async () => { throw Error('NO_PROFILE') }, adapt: () => null, write: async () => { throw Error('NO_WRITE') },
    readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
  return { root, bytes, hash, approval, deps, calls, sequence }
}
test('approved 374 quarantine resumes 375, preserves old hashes, budget and partial checkpoint', () => fixture(async f => {
  const original = await readFile(join(f.root, '00000001.json'), 'utf8')
  const result = await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  assert.deepEqual(result, { processed: 374, requests: 375, retries: 0, status: 'PARTIAL', quarantined: 1, pending: 1, traversedPosition: 375 })
  assert.deepEqual(f.calls, ['z375'])
  assert.equal(await readFile(join(f.root, '00000001.json'), 'utf8'), original)
  const files = (await readdir(f.root)).filter(x => /^\d{8}\.json$/.test(x)).sort()
  const last = JSON.parse(await readFile(join(f.root, files.at(-1)!), 'utf8')).record.event
  assert.deepEqual(last.payload, { batch: 4, traversedPosition: 375, completed: 374, quarantined: 1 })
  assert.deepEqual(await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408), result)
  assert.deepEqual(f.calls, ['z375'])
}))
test('unapproved unknown remains blocked before dependencies', () => fixture(async f => {
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps), /UNKNOWN_REQUEST/)
  assert.equal(f.calls.length, 0)
}))
test('manual operations without private bindings fail before any external call or journal change', () => fixture(async f => {
  const before = await readdir(f.root)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, { ...f.deps, valueBindings: undefined }, 17408, f.approval),
    /VALUE_BINDINGS_REQUIRED/)
  assert.deepEqual(await readdir(f.root), before)
  assert.equal(f.calls.length, 0)
}))
test('approval file is explicit, durable registration is idempotent', () => fixture(async f => {
  await writeFile(join(f.root, 'quarantine-approval.json'), JSON.stringify(f.approval))
  await runGlobal(f.bytes, f.hash, f.root, f.deps)
  await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  const envelopes = await Promise.all((await readdir(f.root)).filter(x => /^\d{8}\.json$/.test(x)).map(async x => JSON.parse(await readFile(join(f.root, x), 'utf8'))))
  const q = envelopes.filter(x => x.record.event.kind === 'QUARANTINED')
  assert.equal(q.length, 1); assert.equal(q[0].record.event.payload.retryBlocked, true)
  assert.equal(q[0].record.event.payload.reconciliation, 'PENDING')
  assert(!envelopes.some(x => x.record.event.kind === 'DONE' && x.record.event.id.endsWith(playerId)))
}))
test('wrong attempt hash and wrong position are rejected', () => fixture(async f => {
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, { ...f.approval, originalRequestHash: '0'.repeat(64) }), /ATTEMPT_HASH/)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, { ...f.approval, position: 375 } as unknown as QuarantineApproval), /SCOPE/)
  assert.equal(f.calls.length, 0)
}))
test('quarantine does not refund original request budget', () => fixture(async f => {
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 374, f.approval), /REQUEST_LIMIT/)
  assert.equal(f.calls.length, 0)
}))
test('another unknown still blocks and cannot inherit a different player quarantine', () => fixture(async f => {
  f.deps.search = async () => { throw Error('ECONNRESET') }
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval), /ECONNRESET/)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps), /UNKNOWN_REQUEST/)
}))
test('failed quarantine append retains lock; explicit synthetic recovery preserves history', () => fixture(async f => {
  const file = join(f.root, `${String(f.sequence + 1).padStart(8, '0')}.json.tmp`)
  await writeFile(file, 'synthetic crash residue')
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval), /EEXIST/)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval), /EEXIST/)
  assert.equal(f.calls.length, 0)
  // Only this dead synthetic fixture is manually reconciled; no production lock is touched.
  await rm(file); await rm(join(f.root, 'execution.lock'))
  const result = await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  assert.equal(result.processed, 374)
}))
test('rehashed content with invalid quarantine semantics still blocks', () => fixture(async f => {
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 374, f.approval), /REQUEST_LIMIT/)
  const file = join(f.root, `${String(f.sequence + 1).padStart(8, '0')}.json`)
  const envelope = JSON.parse(await readFile(file, 'utf8'))
  envelope.record.event.payload.retryBlocked = false
  envelope.hash = sha(JSON.stringify(envelope.record)); await writeFile(file, JSON.stringify(envelope))
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps), /QUARANTINE_STATE/)
}))
test('retroactive response fields cannot enter quarantine approval', () => fixture(async f => {
  const approval = { ...f.approval, observedAt: '2000-01-01T00:00:00Z' }
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, approval), /UNEXPECTED_FIELD/)
  assert.equal(f.calls.length, 0)
}))
test('conflicting approval cannot replace durable quarantine', () => fixture(async f => {
  await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, { ...f.approval, approvalReference: 'changed-reference' }), /APPROVAL_CHANGED/)
  assert.deepEqual(f.calls, ['z375'])
}))
