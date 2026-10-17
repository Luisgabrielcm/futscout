import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGlobal, sha, type Dependencies } from './runner'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { economicFingerprint } from '../../lib/economicData/value'

const selection = (n = 1) => Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: n }, (_, i) => ({
  playerId: `p${String(i).padStart(3, '0')}`, clubId: 'club', leagueId: 'league',
})) }))
test('continuous durable identity queue spans checkpoints and never repeats on restart', () => fixture(async root => {
  const bytes = selection(26), deps = bindings()
  deps.continuous = true
  let calls = 0
  deps.search = async () => { calls++; return { data: [], observedAt: '2026-10-09T12:00:00Z' } }
  const result = await runGlobal(bytes, sha(bytes), root, deps)
  assert.equal(result.processed, 0); assert.equal(result.pending, 26); assert.equal(result.status, 'PARTIAL')
  assert.equal(result.requests, 26); assert.equal(result.pendingByType?.IDENTITY_PENDING, 26)
  assert.equal(result.pendingQueue?.length, 26)
  assert(result.pendingQueue?.every(p => p.retryBlocked && p.reconciliation === 'PENDING' && /^[a-f0-9]{64}$/.test(p.evidenceHash)))
  assert.deepEqual(await runGlobal(bytes, sha(bytes), root, deps), result)
  assert.equal(calls, 26)
}))
function bindings(): Dependencies {
  return { wait: async () => {}, preflight: async () => {}, existing: async () => false,
    search: async () => ({ data: [], observedAt: '2026-10-09T12:00:00Z' }), choose: () => null,
    profile: async () => { throw Error('UNEXPECTED_PROFILE') }, adapt: () => null,
    write: async () => { throw Error('UNEXPECTED_WRITE') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
}
async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'futscout-global-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
test('multiple batches, checkpoints, restart skips confirmed consultations', () => fixture(async root => {
  const bytes = selection(101), deps = bindings(), checkpoints: number[] = []
  deps.checkpoint = async p => { checkpoints.push(p) }
  assert.deepEqual(await runGlobal(bytes, sha(bytes), root, deps), { processed: 101, requests: 101, retries: 0 })
  assert.deepEqual(checkpoints, [25, 50, 75, 100, 101])
  deps.search = async () => { throw Error('REPEATED') }
  await runGlobal(bytes, sha(bytes), root, deps)
  assert.equal(checkpoints.length, 5)
}))
test('budget never issues an extra request', () => fixture(async root => {
  const bytes = selection(2)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, bindings(), 1), /REQUEST_LIMIT/)
}))
test('network failure remains indeterminate and cannot replay automatically', () => fixture(async root => {
  const bytes = selection(), deps = bindings(); let calls = 0
  deps.search = async () => { calls++; throw Error('ECONNRESET') }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /ECONNRESET/)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNKNOWN_REQUEST/)
  assert.equal(calls, 1)
}))
test('concurrent runner is excluded', () => fixture(async root => {
  await writeFile(join(root, 'execution.lock'), 'operator review')
  const bytes = selection()
  await assert.rejects(runGlobal(bytes, sha(bytes), root, bindings()), /EEXIST/)
}))
test('hash mismatch and duplicate identity rejected before effects', () => fixture(async root => {
  const bytes = selection()
  await assert.rejects(runGlobal(bytes, 'bad', root, bindings()), /SELECTION_HASH/)
  const duplicate = Buffer.from(JSON.stringify({ excludedIds: [], players: Array(2).fill(JSON.parse(bytes.toString()).players[0]) }))
  await assert.rejects(runGlobal(duplicate, sha(duplicate), root, bindings()), /DUPLICATE_PLAYER/)
}))
test('existing value is never overwritten', () => fixture(async root => {
  const bytes = selection(), deps = bindings(); deps.existing = async () => true
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /EXISTING_VALUE/)
}))
test('generation staging confirms Observation without selecting Current and restart does not repeat requests', () => fixture(async root => {
  const bytes = selection(), deps = bindings()
  deps.stagingGeneration = 'g1'
  let searches = 0, stored: EconomicWrite | null = null
  deps.search = async () => { searches++; return { data: [], observedAt: '2026-10-09T12:00:00Z' } }
  deps.choose = () => 'provider1'
  deps.profile = async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' })
  deps.adapt = p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: 'provider1',
    context: 'REAL_WORLD', snapshotVersion: 'v1', presence: 'NULL', amount: null, currency: null, period: null,
    contractUntil: null, datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED',
    status: 'MISSING', metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } })
  deps.write = async plan => { assert.equal(plan.selectCurrent, false); stored = plan }
  deps.readBack = async plan => stored?.requestId === plan.requestId ? 'CONFIRMED' : 'NOT_STARTED'
  const result = await runGlobal(bytes, sha(bytes), root, deps)
  assert.equal(result.processed, 1); assert.equal(result.requests, 2)
  assert.deepEqual(await runGlobal(bytes, sha(bytes), root, deps), result)
  assert.equal(searches, 1)
}))
test('indeterminate staging write remains pending across restart', () => fixture(async root => {
  const bytes = selection(), deps = bindings()
  deps.stagingGeneration = 'g1'
  deps.choose = () => 'provider1'
  deps.profile = async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' })
  deps.adapt = p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: 'provider1',
    context: 'REAL_WORLD', snapshotVersion: 'v1', presence: 'NULL', amount: null, currency: null, period: null,
    contractUntil: null, datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED',
    status: 'MISSING', metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } })
  let writes = 0
  deps.write = async () => { writes++; throw Error('WRITE_ACK_UNKNOWN') }
  deps.readBack = async () => 'NOT_STARTED'
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /WRITE_ACK_UNKNOWN/)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNCERTAIN_WRITE_REQUIRES_REVIEW/)
  assert.equal(writes, 1)
  const files = (await import('node:fs/promises')).readdir
  const events = await Promise.all((await files(root)).filter(file => file.endsWith('.json')).map(async file =>
    JSON.parse(await readFile(join(root, file), 'utf8')).record.event.kind as string))
  assert(!events.includes('DONE'))
}))
test('staging rejects a legacy publishing journal before any new request', () => fixture(async root => {
  const bytes = selection(), hash = sha(bytes), deps = bindings()
  deps.stagingGeneration = 'g1'
  const record = { version: 1, selectionHash: hash, previous: null,
    event: { kind: 'WRITE', id: `lfglobal-${hash.slice(0, 16)}-p000`, payload: { selectCurrent: true } } }
  await writeFile(join(root, '00000001.json'), JSON.stringify({ record, hash: sha(JSON.stringify(record)) }))
  let searches = 0
  deps.search = async () => { searches++; throw Error('REPEATED_REQUEST') }
  await assert.rejects(runGlobal(bytes, hash, root, deps), /LEGACY_WRITE_IN_STAGING_JOURNAL/)
  assert.equal(searches, 0)
}))
test('journal corruption and changed selection block restart', () => fixture(async root => {
  const bytes = selection(); await runGlobal(bytes, sha(bytes), root, bindings())
  const changed = selection(2)
  await assert.rejects(runGlobal(changed, sha(changed), root, bindings()), /SELECTION_CHANGED/)
  const path = join(root, '00000001.json'), envelope = JSON.parse(await readFile(path, 'utf8'))
  envelope.hash = 'corrupted'; await writeFile(path, JSON.stringify(envelope))
  await assert.rejects(runGlobal(bytes, sha(bytes), root, bindings()), /CORRUPTION/)
}))
for (const presence of ['VALUE', 'NULL'] as const) test(`commit receipt lost reconciles ${presence} without repeated write`, () => fixture(async root => {
  const bytes = selection(), deps = bindings(); let writes = 0; let reads = 0
  deps.choose = () => 'provider1'
  deps.profile = async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' })
  deps.adapt = p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: 'provider1',
    context: 'REAL_WORLD', snapshotVersion: 'v1', presence, amount: presence === 'VALUE' ? '0.00' : null,
    currency: presence === 'VALUE' ? 'EUR' : null, period: null, contractUntil: null, datePrecision: null,
    providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: presence === 'VALUE' ? 'VALID' : 'MISSING',
    metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } })
  deps.write = async (plan: EconomicWrite) => {
    writes++; assert.equal(plan.expectedRevision, null); assert.equal(plan.selectCurrent, true)
    assert.equal(plan.observedAt, '2026-10-09T12:00:00Z')
    throw Error('COMMIT_ACK_LOST')
  }
  deps.readBack = async () => { reads++; return 'CONFIRMED' }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /COMMIT_ACK_LOST/)
  await runGlobal(bytes, sha(bytes), root, deps)
  assert.equal(writes, 1); assert.equal(reads, 1)
}))
test('unconfirmed write never repeats', () => fixture(async root => {
  const bytes = selection(), deps = bindings()
  // A request with an unproven outcome is intentionally blocked on restart.
  deps.search = async () => { throw Error('timeout') }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /timeout/)
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNKNOWN_REQUEST/)
}))

test('pending database write blocks next player across restart without extra budget or checkpoint', () => fixture(async root => {
  const bytes = selection(2), deps = bindings()
  let searches = 0, writes = 0, checkpoints = 0
  deps.search = async () => { searches++; return { data: [], observedAt: '2026-10-09T12:00:00Z' } }
  deps.choose = () => 'synthetic-provider'
  deps.profile = async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' })
  deps.adapt = p => ({ playerId: p.playerId, providerPlayerId: 'synthetic-provider',
    provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', snapshotVersion: 'v1',
    presence: 'NULL', amount: null, currency: null, period: null, contractUntil: null,
    datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED',
    status: 'MISSING', metadata: { source: 'synthetic', evidenceRef: 'synthetic' } })
  deps.write = async () => { writes++; throw Error('P2028_SYNTHETIC') }
  deps.checkpoint = async () => { checkpoints++ }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /P2028_SYNTHETIC/)
  const original = await readFile(join(root, '00000005.json'), 'utf8')
  for (const outcome of ['NOT_STARTED', 'UNKNOWN'] as const) {
    deps.readBack = async () => outcome
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNCERTAIN_WRITE_REQUIRES_REVIEW/)
    assert.equal(await readFile(join(root, '00000005.json'), 'utf8'), original)
  }
  assert.equal(searches, 1); assert.equal(writes, 1); assert.equal(checkpoints, 0)
}))

for (const termination of ['UNPROVEN', 'COMMIT_ACKNOWLEDGED', 'ROLLBACK_ACKNOWLEDGED', 'CONFLICT'] as const)
test(`durable write isolation ${termination}, restart and original hashes`, () => fixture(async root => {
  const bytes = selection(2), deps = bindings()
  let writes = 0, searches = 0
  deps.search = async () => { searches++; return { data: [], observedAt: '2026-10-09T12:00:00Z' } }
  deps.choose = p => p.playerId === 'p000' ? 'synthetic' : null
  deps.profile = async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' })
  deps.adapt = p => ({ playerId: p.playerId, providerPlayerId: 'synthetic', provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE',
    context: 'REAL_WORLD', snapshotVersion: 'v1', presence: 'NULL', amount: null, currency: null, period: null,
    contractUntil: null, datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED',
    status: 'MISSING', metadata: { source: 'synthetic', evidenceRef: 'synthetic' } })
  deps.write = async () => { writes++; throw Error('ACK_LOST') }
  await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /ACK_LOST/)
  const original = await readFile(join(root, '00000005.json'), 'utf8')
  const envelope = JSON.parse(original), plan = envelope.record.event.payload as EconomicWrite
  deps.writeIsolation = { playerId: 'p000', position: 1, requestId: plan.requestId, originalAttemptHash: envelope.hash,
    contentHash: economicFingerprint(plan.state), inputHash: sha(JSON.stringify(plan)), approvedAt: new Date().toISOString(),
    originalState: 'WRITE_INDETERMINATE', reconciliation: 'PENDING', retryBlocked: true }
  deps.verifyWriteTermination = async isolation => termination === 'UNPROVEN' ? null : ({
    requestId: isolation.requestId, originalAttemptHash: isolation.originalAttemptHash, contentHash: isolation.contentHash, inputHash: isolation.inputHash,
    outcome: termination === 'ROLLBACK_ACKNOWLEDGED' ? termination : 'COMMIT_ACKNOWLEDGED', evidenceRef: 'synthetic/ack', verifiedAt: new Date().toISOString() })
  deps.readBack = async () => termination === 'ROLLBACK_ACKNOWLEDGED' ? 'NOT_STARTED' : termination === 'CONFLICT' ? 'CONFLICT' : 'CONFIRMED'
  for (let restart = 0; restart < 2; restart++) {
    if (termination === 'UNPROVEN' || termination === 'CONFLICT') {
      await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /WRITE_TERMINATION_UNPROVEN|WRITE_ISOLATION_READ_BACK_CONFLICT/)
      assert.equal(searches, 1)
    } else {
      const result = await runGlobal(bytes, sha(bytes), root, deps)
      assert.equal(result.status, 'PARTIAL'); assert.equal(result.processed, 1); assert.equal(result.pending, 1)
      assert.equal(result.writeIsolated, 1); assert.equal(result.requests, 3); assert.equal(searches, 2)
    }
    assert.equal(writes, 1)
    assert.equal(await readFile(join(root, '00000005.json'), 'utf8'), original)
  }
  const isolated = JSON.parse(await readFile(join(root, '00000006.json'), 'utf8'))
  assert.equal(isolated.record.event.kind, 'WRITE_ISOLATED')
  assert.equal(isolated.record.event.payload.reconciliation, 'PENDING')
}))
