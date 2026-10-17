import { syntheticBindings } from './synthetic-bindings.fixture'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGlobal, sha, type Dependencies, type QuarantineApproval } from './runner'

async function fixture(fn: (f: Awaited<ReturnType<typeof seed>>) => Promise<void>) {
  const f = await seed()
  try { await fn(f) } finally { await rm(f.root, { recursive: true, force: true }) }
}
async function seed() {
  const root = await mkdtemp(join(tmpdir(), 'value-third-quarantine-'))
  const players = Array.from({ length: 908 }, (_, i) => ({
    playerId: i === 373 ? 'synthetic-player-01' : i === 855 ? 'synthetic-player-02' : i === 906 ? 'synthetic-player-03' : `p${i}`,
    leagueId: `l${String(i).padStart(4, '0')}`, clubId: 'club',
  }))
  const bytes = Buffer.from(JSON.stringify({ players, excludedIds: [] })), hash = sha(bytes)
  let previous: string | null = null, sequence = 0
  async function append(event: unknown) {
    const record = { version: 1, selectionHash: hash, previous, event }
    previous = sha(JSON.stringify(record)); sequence++
    await writeFile(join(root, `${String(sequence).padStart(8, '0')}.json`), JSON.stringify({ record, hash: previous }))
  }
  const approvals: QuarantineApproval[] = []
  let approval!: QuarantineApproval
  for (let i = 0; i < 907; i++) {
    const id = `lfglobal-${hash.slice(0, 16)}-${players[i].playerId}`
    await append({ kind: 'REQUEST', id: `${id}-search`, payload: null })
    if (i === 373 || i === 855 || i === 906) {
      const q = { approved: true, selectionHash: hash, position: i + 1, playerId: players[i].playerId,
        requestId: `${id}-search`, originalRequestHash: previous!, approvedAt: new Date().toISOString(), approvalReference: 'synthetic-approved' } as QuarantineApproval
      approvals.push(q)
      if (i === 373 || i === 855) await append({ kind: 'QUARANTINED', id: q.requestId, payload: { ...q, originalState: 'UNKNOWN',
        reconciliation: 'PENDING', retryBlocked: true, reservedRequests: 1, reason: 'RESPONSE_NOT_PRESERVED',
        journalReference: `${String(sequence).padStart(8, '0')}.json` } })
      else approval = q
    } else {
      await append({ kind: 'RESPONSE', id: `${id}-search`, payload: { data: [], observedAt: '2026-10-09T12:00:00Z' } })
      await append({ kind: 'DONE', id, payload: { position: i + 1 } })
    }
    if ((i + 1) % 25 === 0) await append({ kind: 'CHECKPOINT', id: String(i + 1), payload: { batch: Math.ceil((i + 1) / 100) } })
  }
  let calls = 0
  const deps: Dependencies = { valueBindings: syntheticBindings(hash, approvals), wait: async () => {}, preflight: async () => {}, existing: async () => false,
    search: async p => { calls++; assert.equal(p.playerId, players[907].playerId); return { data: [], observedAt: new Date().toISOString() } },
    choose: () => null, profile: async () => { throw Error('FORBIDDEN') }, adapt: () => null,
    write: async () => { throw Error('FORBIDDEN') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
  return { root, bytes, hash, approval, deps, calls: () => calls }
}
test('three quarantines preserve history, skip all requests, checkpoint gaps and restart idempotently', () => fixture(async f => {
  const old = (await readdir(f.root)).sort()
  const originals = await Promise.all(old.map(n => readFile(join(f.root, n), 'utf8')))
  const result = await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  assert.deepEqual(result, { processed: 905, requests: 908, retries: 0, status: 'PARTIAL', quarantined: 3, pending: 3, traversedPosition: 908 })
  assert.equal(f.calls(), 1)
  await runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, f.approval)
  assert.equal(f.calls(), 1)
  for (const [i, n] of old.entries()) assert.equal(await readFile(join(f.root, n), 'utf8'), originals[i])
  const files = (await readdir(f.root)).sort(); let previous = null
  const events = []
  for (const n of files) {
    const e = JSON.parse(await readFile(join(f.root, n), 'utf8'))
    assert.equal(e.hash, sha(JSON.stringify(e.record))); assert.equal(e.record.previous, previous)
    previous = e.hash; events.push(e.record.event)
  }
  assert.equal(events.filter(e => e.kind === 'QUARANTINED').length, 3)
  assert.deepEqual(events.at(-1).payload, { batch: 10, traversedPosition: 908, completed: 905, quarantined: 3 })
}))
test('third quarantine requires exact attempt and consumes original budget', () => fixture(async f => {
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps), /UNKNOWN_REQUEST/)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 17408, { ...f.approval, originalRequestHash: '0'.repeat(64) }), /ATTEMPT_HASH/)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 907, f.approval), /REQUEST_LIMIT/)
  assert.equal(f.calls(), 0)
  await assert.rejects(runGlobal(f.bytes, f.hash, f.root, f.deps, 907), /REQUEST_LIMIT/)
  assert.equal(f.calls(), 0)
}))
