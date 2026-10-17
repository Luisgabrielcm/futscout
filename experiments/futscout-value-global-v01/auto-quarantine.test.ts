import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGlobal, sha, type Dependencies } from './runner'
import { autoPolicyVersion, failureClass, quarantineLimits } from './quarantine-policy'
import { diagnose } from './diagnostics'

const policy = { enabled: true, version: autoPolicyVersion } as const
async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'value-auto-quarantine-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
const selection = (n = 3) => Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: n }, (_, i) => ({
  playerId: `p${String(i + 1).padStart(3, '0')}`, clubId: 'club', leagueId: 'league',
})) }))
function deps(failures: Map<string, string>, calls: string[]): Dependencies {
  return { wait: async () => {}, preflight: async () => {}, existing: async () => false,
    search: async p => { calls.push(p.playerId); const code = failures.get(p.playerId); if (code) throw Object.assign(new Error('SECRET'), { code })
      return { data: [], observedAt: new Date().toISOString() } }, choose: () => null,
    profile: async () => { throw Error('FORBIDDEN') }, adapt: () => null, write: async () => { throw Error('FORBIDDEN') },
    readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
}
async function events(root: string) {
  return Promise.all((await readdir(root)).filter(n => /^\d{8}\.json$/.test(n)).sort().map(async n => JSON.parse(await readFile(join(root, n), 'utf8'))))
}
test('timeout after intent quarantines durably, checkpoint has gap, restart skips without retry', () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map([['p002', 'ETIMEDOUT']]), calls)
  const result = await runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy)
  assert.deepEqual(result, { processed: 2, requests: 3, retries: 0, status: 'PARTIAL', quarantined: 1, pending: 1, traversedPosition: 3 })
  const original = await events(root), q = original.find(e => e.record.event.kind === 'QUARANTINED')!.record.event.payload
  assert.equal(q.originalState, 'UNKNOWN'); assert.equal(q.reconciliation, 'PENDING'); assert(q.retryBlocked)
  assert.equal(q.diagnostic.code, 'ETIMEDOUT'); assert.equal(q.reservedRequests, 1)
  assert(!JSON.stringify(q).includes('SECRET')); assert(!('observedAt' in q))
  assert.deepEqual(original.at(-1).record.event.payload, { batch: 1, traversedPosition: 3, completed: 2, quarantined: 1 })
  await runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy)
  assert.deepEqual(await events(root), original); assert.equal(calls.length, 3)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d), /QUARANTINE_SCOPE/)
}))
for (const code of ['ENOTFOUND', 'HTTP_429', 'HTTP_401', 'P1001', 'ERR_ASSERTION', 'UNKNOWN']) test(`${code} stops, never auto quarantines`, () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map([['p001', code]]), calls)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy))
  assert.equal((await events(root)).filter(e => e.record.event.kind === 'QUARANTINED').length, 0)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /UNKNOWN_REQUEST/)
  assert.equal(calls.length, 1)
}))
test('pure local failure has no request reservation and no quarantine', () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map(), calls)
  d.validateSearch = () => { assert(false, 'NAME') }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /NAME/)
  assert.equal((await events(root)).length, 0); assert.equal(calls.length, 0)
  assert.equal(failureClass(diagnose(Object.assign(new Error('NAME'), { code: 'ERR_ASSERTION' }), {
    requestId: null, stage: 'EXISTING', outcomeIndeterminate: false })), 'A_LOCAL')
}))
test('third consecutive unknown stops; both previous quarantines and third intent remain budgeted', () => fixture(async root => {
  const bytes = selection(4), calls: string[] = [], d = deps(new Map([['p001', 'ECONNRESET'], ['p002', 'ETIMEDOUT'], ['p003', 'ECONNRESET']]), calls)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /AUTO_QUARANTINE_LIMIT/)
  const e = await events(root)
  assert.equal(e.filter(x => x.record.event.kind === 'QUARANTINED').length, 2)
  assert.equal(e.filter(x => x.record.event.kind === 'REQUEST').length, 3)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /UNKNOWN_REQUEST/)
  assert.equal(calls.length, 3)
}))
test('sixth isolated failure in rolling 100 stops; successes reset only consecutive counter', () => fixture(async root => {
  const bytes = selection(12), calls: string[] = [], failures = new Map(Array.from({ length: 6 }, (_, i) => [`p${String(i * 2 + 1).padStart(3, '0')}`, 'ECONNRESET']))
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps(failures, calls), 17408, undefined, policy), /AUTO_QUARANTINE_LIMIT/)
  assert.equal((await events(root)).filter(x => x.record.event.kind === 'QUARANTINED').length, 5)
  assert.equal(calls.length, 11)
  assert(quarantineLimits([1, 20, 40, 60, 80, 101], 1)); assert(!quarantineLimits([1, 20, 40, 60, 80, 100], 1))
}))
test('default disabled and old UNKNOWN cannot be retroactively auto quarantined', () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map([['p001', 'ECONNRESET']]), calls)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d))
  const original = await events(root)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /UNKNOWN_REQUEST/)
  assert.deepEqual(await events(root), original); assert.equal(calls.length, 1)
}))
test('budget and historical hash chain preserved across automatic quarantine', () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map([['p001', 'ECONNRESET']]), calls)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 1, undefined, policy), /REQUEST_LIMIT/)
  const e = await events(root); assert.equal(calls.length, 1)
  assert.equal(e.length, 2); assert.equal(e[1].record.previous, e[0].hash)
  assert.equal(e[1].record.event.payload.originalRequestHash, e[0].hash)
  for (const x of e) assert.equal(x.hash, sha(JSON.stringify(x.record)))
}))
test('write uncertainty is C, never quarantine, and requires read-back on restart', () => fixture(async root => {
  const bytes = selection(1), calls: string[] = [], d = deps(new Map(), calls)
  d.choose = () => 'remote'
  d.profile = async () => ({ data: {}, observedAt: new Date().toISOString() })
  d.adapt = p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: 'remote', context: 'REAL_WORLD',
    snapshotVersion: 'v1', presence: 'NULL', amount: null, currency: null, period: null, contractUntil: null, datePrecision: null,
    providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: 'MISSING', metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } })
  let writes = 0
  d.write = async () => { writes++; throw Object.assign(new Error('uncertain'), { code: 'P1001' }) }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy))
  assert.equal((await events(root)).filter(x => x.record.event.kind === 'QUARANTINED').length, 0)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy), /UNCERTAIN_WRITE/)
  assert.equal(writes, 1); assert.equal(calls.length, 1)
}))
test('profile timeout uses original profile intent and does not repeat search/profile after restart', () => fixture(async root => {
  const bytes = selection(1), calls: string[] = [], d = deps(new Map(), calls)
  let profiles = 0
  d.choose = () => 'remote'
  d.profile = async () => { profiles++; throw Object.assign(new Error('private'), { code: 'ETIMEDOUT' }) }
  const result = await runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy)
  assert.equal(result.processed, 0); assert.equal(result.requests, 2); assert.equal(result.quarantined, 1)
  const q = (await events(root)).find(e => e.record.event.kind === 'QUARANTINED')!.record.event.payload
  assert(q.requestId.endsWith('-profile')); assert.equal(q.diagnostic.stage, 'LIVE_PROFILE')
  await runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy)
  assert.equal(profiles, 1); assert.equal(calls.length, 1)
}))
test('systemic preflight stops before requests and hash corruption blocks before dependencies', () => fixture(async root => {
  const bytes = selection(), calls: string[] = [], d = deps(new Map(), calls)
  d.preflight = async () => { throw Object.assign(new Error('db down'), { code: 'P1001' }) }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, d, 17408, undefined, policy))
  assert.equal((await events(root)).length, 0); assert.equal(calls.length, 0)
  await assert.rejects(runGlobal(bytes, '0'.repeat(64), root, d, 17408, undefined, policy), /SELECTION_HASH/)
  assert.equal(calls.length, 0)
}))
