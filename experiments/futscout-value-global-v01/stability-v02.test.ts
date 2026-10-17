import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectEnvelope, validateRejected } from './response-v02'
import { runGlobal, sha, type Dependencies } from './runner'
import { liveFootballTransport } from './integration'

const invalid = { success: false, data: {}, credits_remaining: 10 }
test('third consecutive rejection blocks and historical UNKNOWN is never retried', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stability-limits-'))
  try {
    const bytes = Buffer.from(JSON.stringify({ excludedIds: [], players: [0, 1, 2].map(i => ({ playerId: `p${i}`, clubId: 'c', leagueId: 'l' })) }))
    let calls = 0
    const forbidden = async () => { throw Error('FORBIDDEN') }
    const d: Dependencies = { wait: async () => {}, preflight: async () => {}, existing: async () => false,
      search: async () => { calls++; return inspectEnvelope(invalid, 'player_search', 'SECRET')! },
      choose: () => { throw Error('FORBIDDEN') }, profile: forbidden, adapt: () => null, write: forbidden, readBack: async () => 'UNKNOWN', checkpoint: forbidden }
    await assert.rejects(runGlobal(bytes, sha(bytes), root, d), /RESPONSE_FAILURE_LIMIT/)
    await assert.rejects(runGlobal(bytes, sha(bytes), root, d), /UNKNOWN_REQUEST/)
    assert.equal(calls, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('complete invalid envelope is preserved exactly with hash, valid response is SUCCESS', () => {
  const r = inspectEnvelope(invalid, 'player_search', 'SECRET')!
  assert.equal(r.outcome, 'REJECTED_RESPONSE'); assert.equal(r.evidence.body, JSON.stringify(invalid)); validateRejected(r)
  assert.equal(inspectEnvelope({ ...invalid, success: true, data: { players: [] } }, 'player_search', 'SECRET'), null)
  assert.throws(() => validateRejected({ ...r, evidence: { ...r.evidence, contentHash: 'bad' } }), /REJECTED_HASH/)
})
for (const body of [null, {}, { success: false, data: null, credits_remaining: 10 }, { ...invalid, credits_remaining: -1 },
  { ...invalid, message: 'SECRET' }]) test(`incomplete/unsafe response blocks: ${JSON.stringify(body)}`, () => {
  assert.throws(() => inspectEnvelope(body, 'player_search', 'SECRET'))
})
test('parsing and HTTP auth/429 block with exactly one fetch', async () => {
  for (const [status, body] of [[200, '{'], [401, '{}'], [429, '{}']] as const) {
    let calls = 0
    const transport = liveFootballTransport('SECRET', (async () => { calls++; return new Response(body, { status }) }) as typeof fetch)
    await assert.rejects(transport('player_search', { q: 'synthetic' })); assert.equal(calls, 1)
  }
})
test('multi-context rejection persists, checkpoints count gap, restart never repeats and budget remains consumed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stability-v02-'))
  try {
    const bytes = Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: 3 }, (_, i) => ({ playerId: `p${i}`, clubId: `c${i}`, leagueId: `l${i}` })) }))
    let calls = 0, writes = 0
    const d: Dependencies = { wait: async () => {}, preflight: async () => {}, existing: async () => false,
      search: async p => { calls++; return p.playerId === 'p1' ? inspectEnvelope(invalid, 'player_search', 'SECRET')! : { data: [], observedAt: new Date().toISOString() } },
      choose: () => null, profile: async () => { throw Error('FORBIDDEN') }, adapt: () => null,
      write: async () => { writes++; throw Error('FORBIDDEN') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
    const result = await runGlobal(bytes, sha(bytes), root, d, 3)
    assert.equal(result.rejected, 1); assert.equal(result.processed, 2); assert.equal(result.status, 'PARTIAL'); assert.equal(result.requests, 3)
    const snapshot = async () => Promise.all((await readdir(root)).sort().map(n => readFile(join(root, n), 'utf8')))
    const before = await snapshot()
    await runGlobal(bytes, sha(bytes), root, d, 3)
    assert.deepEqual(await snapshot(), before); assert.equal(calls, 3); assert.equal(writes, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
