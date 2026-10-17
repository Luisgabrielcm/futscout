import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { executeGlobal as executeConfiguredGlobal, bindContinuation, type ExecutorResources } from './executor'
import { validateValueBindings } from './local-bindings'
import { sha, type Dependencies } from './runner'
import { operationalBalanceRecoveryPolicy, operationalQuarantinePolicy } from './quarantine-policy'

// Explicit synthetic authority for this test harness, never an operational config fallback.
function executeGlobal(options: Parameters<typeof executeConfiguredGlobal>[0]) {
  const parentSelectionHash = sha(options.offlineContinuation?.parentBytes ?? options.bytes)
  const offlineSelectionHash = options.offlineContinuation ? sha(options.bytes) :
    sha(options.continuation?.selectionBytes ?? Buffer.from('synthetic-offline-selection'))
  const valueBindings = validateValueBindings({ schemaVersion: 1, parentSelectionHash, offlineSelectionHash, quarantines: [] })
  return executeConfiguredGlobal({ ...options, valueBindings })
}

test('operational quarantine requires a single exact opt-in flag', () => {
  assert.equal(operationalQuarantinePolicy([]), undefined)
  assert.equal(operationalQuarantinePolicy(['--execute-authorized']), undefined)
  assert.equal(operationalQuarantinePolicy(['--auto-quarantine-v01'])?.enabled, true)
  for (const args of [['--auto-quarantine'], ['--auto-quarantine-v02'], ['--auto-quarantine-v01=false'],
    ['--auto-quarantine-v01', '--auto-quarantine-v01']]) assert.throws(() => operationalQuarantinePolicy(args), /INVALID_AUTO/)
})

const bytes = Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: 3 }, (_, i) => ({ playerId: `p${i}`, clubId: 'club', leagueId: 'league' })) }))
function continuationFixture() {
  const parentBytes = Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: 3 }, (_, i) => ({
    playerId: `p${i}`, clubId: 'club', leagueId: 'league', order: i + 1 })) }))
  const parentHash = sha(parentBytes), id = `lfglobal-${parentHash.slice(0, 16)}-p1-search`
  const record = { version: 1, selectionHash: parentHash, previous: null, event: { kind: 'REQUEST', id, payload: null } }
  const journal = [JSON.stringify({ record, hash: sha(JSON.stringify(record)) })]
  const child = { schemaVersion: 'value-global-remaining-v1', parentSelectionHash: parentHash,
    parentJournalHash: sha(JSON.stringify(record)), firstOriginalPosition: 3, lastOriginalPosition: 3,
    excludedIds: ['p0', 'p1'], playerIds: ['p2'] }
  const selectionBytes = Buffer.from(JSON.stringify(child))
  const manifest = { schemaVersion: 'value-global-remaining-manifest-v1', selectionHash: sha(selectionBytes),
    parentSelectionHash: parentHash, parentJournalHash: child.parentJournalHash, players: 1,
    firstOriginalPosition: 3, lastOriginalPosition: 3, inheritedRequests: 1, originalCap: 17408, remainingCap: 17407 }
  return { parentBytes, selectionBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)), journal }
}
test('continuation binds original position, request identity and accumulated budget deterministically', () => {
  const f = continuationFixture()
  const bound = bindContinuation(f.parentBytes, f.selectionBytes, f.manifestBytes, f.journal, 0)
  assert.equal(bound.entries[0].originalPosition, 3)
  assert.equal(bound.entries[0].requestId, `lfglobal-${sha(f.parentBytes).slice(0, 16)}-p2`)
  assert.equal(bound.inheritedRequests, 1); assert.equal(bound.remainingCap, 17407)
  assert.equal(bound.executionEnabled, false)
  assert.deepEqual(bindContinuation(f.parentBytes, f.selectionBytes, f.manifestBytes, f.journal, 0), bound)
})
test('continuation rejects hash, budget and original history divergence', () => {
  const f = continuationFixture()
  assert.throws(() => bindContinuation(f.parentBytes, Buffer.from('{}'), f.manifestBytes, f.journal, 0))
  assert.throws(() => bindContinuation(f.parentBytes, f.selectionBytes, f.manifestBytes, f.journal, 1), /CONTINUATION_BUDGET/)
  assert.throws(() => bindContinuation(f.parentBytes, f.selectionBytes, f.manifestBytes, [], 0), /JOURNAL_CHANGED/)
  const changed = JSON.parse(f.journal[0]); changed.record.event.id = 'changed'
  assert.throws(() => bindContinuation(f.parentBytes, f.selectionBytes, f.manifestBytes, [JSON.stringify(changed)], 0), /CORRUPTION/)
  for (const playerIds of [['p2', 'p2'], ['p1'], ['p0']]) {
    const child = { ...JSON.parse(f.selectionBytes.toString()), playerIds }
    const childBytes = Buffer.from(JSON.stringify(child))
    const manifest = { ...JSON.parse(f.manifestBytes.toString()), selectionHash: sha(childBytes) }
    assert.throws(() => bindContinuation(f.parentBytes, childBytes, Buffer.from(JSON.stringify(manifest)), f.journal, 0), /CONTINUATION_ORDER/)
  }
})
test('continuation restart remains fenced before resource creation and leaves parent journal immutable', () => fixture(async root => {
  const f = continuationFixture(), r = resources(), hash = sha(f.parentBytes)
  const dir = join(root, hash, 'journal')
  await mkdir(dir, { recursive: true }); await mkdir(join(root, hash, 'budget'))
  await writeFile(join(dir, '00000001.json'), f.journal[0])
  for (let restart = 0; restart < 2; restart++) {
    await assert.rejects(executeGlobal({ bytes: f.parentBytes, expectedHash: hash, authorizedHost: hostname(), root,
      create: r.create, continuation: { selectionBytes: f.selectionBytes, manifestBytes: f.manifestBytes } }), /REMOTE_FENCE_UNPROVEN/)
    assert.equal(await readFile(join(dir, '00000001.json'), 'utf8'), f.journal[0])
    assert.deepEqual(await readdir(join(root, hash, 'budget')), [])
  }
  assert.equal(r.counts.created, 0); assert.equal(r.counts.probes, 0); assert.equal(r.counts.search, 0)
}))
test('offline continuation inherits parent budget and request identity without modifying parent journal', () => fixture(async root => {
  const f = continuationFixture(), parentHash = sha(f.parentBytes), childHash = sha(f.selectionBytes)
  const parentRoot = join(root, 'parent'), offlineRoot = join(root, 'offline')
  const parentDir = join(parentRoot, parentHash)
  await mkdir(join(parentDir, 'journal'), { recursive: true }); await mkdir(join(parentDir, 'budget'))
  await writeFile(join(parentDir, 'journal', '00000001.json'), f.journal[0])
  const r = resources(), options = { bytes: f.selectionBytes, expectedHash: childHash, root: offlineRoot,
    authorizedHost: hostname(), create: r.create,
    offlineContinuation: { parentBytes: f.parentBytes, manifestBytes: f.manifestBytes, parentRoot, expectedParentHash: parentHash } }
  const result = await executeGlobal(options)
  assert.equal(result.inheritedRequests, 1); assert.equal(result.totalRequests, 3)
  assert.equal(result.processed, 1); assert.equal(r.counts.search, 1)
  const journal = await readdir(join(offlineRoot, childHash, 'journal'))
  const request = JSON.parse(await readFile(join(offlineRoot, childHash, 'journal', journal[0]), 'utf8'))
  assert.equal(request.record.event.id, `lfglobal-${parentHash.slice(0, 16)}-p2-search`)
  assert.equal(await readFile(join(parentDir, 'journal', '00000001.json'), 'utf8'), f.journal[0])
  await executeGlobal(options)
  assert.equal(r.counts.search, 1)
}))

test('offline BALANCE recovery binds one paid receipt to its attempt and survives restart without retry', () => fixture(async root => {
  const f = continuationFixture(), parentHash = sha(f.parentBytes), childHash = sha(f.selectionBytes)
  const parentRoot = join(root, 'parent'), offlineRoot = join(root, 'offline')
  const parentDir = join(parentRoot, parentHash)
  await mkdir(join(parentDir, 'journal'), { recursive: true }); await mkdir(join(parentDir, 'budget'))
  await writeFile(join(parentDir, 'journal', '00000001.json'), f.journal[0])
  const r = resources(), original = r.instance.dependencies
  r.instance.dependencies = (balance, limit) => ({ ...original(balance, limit),
    search: async () => { r.counts.search++; assert.fail('BALANCE') } })
  const options = { bytes: f.selectionBytes, expectedHash: childHash, root: offlineRoot,
    authorizedHost: hostname(), create: r.create,
    autoBalanceRecovery: operationalBalanceRecoveryPolicy(['--auto-balance-recovery-v01']),
    offlineContinuation: { parentBytes: f.parentBytes, manifestBytes: f.manifestBytes, parentRoot, expectedParentHash: parentHash } }
  const first = await executeGlobal(options)
  assert.equal(first.status, 'PARTIAL')
  assert.equal(first.quarantined, 1)
  assert.equal(first.processed, 0)
  assert.equal(first.totalRequests, 4)
  assert.equal(first.balanceRequests, 2)
  const budget = join(offlineRoot, childHash, 'budget')
  const intent = JSON.parse(await readFile(join(budget, '000002.intent.json'), 'utf8'))
  const receipt = JSON.parse(await readFile(join(budget, '000002.receipt.json'), 'utf8'))
  assert.equal(intent.recovery.requestId, `lfglobal-${parentHash.slice(0, 16)}-p2-search`)
  assert.deepEqual(receipt.recovery, intent.recovery)
  assert.equal(receipt.recoveryHash, sha(JSON.stringify({ balance: receipt.balance, recovery: intent.recovery })))
  const second = await executeGlobal(options)
  assert.equal(second.quarantined, 1)
  assert.equal(second.totalRequests, 5) // one new preflight only; no new player or recovery request
  assert.equal(r.counts.search, 1)
  assert.equal(r.counts.probes, 3)
  receipt.recoveryHash = '0'.repeat(64)
  await writeFile(join(budget, '000002.receipt.json'), JSON.stringify(receipt))
  await assert.rejects(executeGlobal(options), /BALANCE_RECOVERY_RECEIPT_HASH/)
  assert.equal(r.counts.probes, 3)
  assert.equal(r.counts.search, 1)
}))
async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'global-executor-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
function resources() {
  const counts = { created: 0, closed: 0, probes: 0, search: 0, checkpoints: 0 }
  const instance: ExecutorResources = {
    dependencies: (balance, limit): Dependencies => ({
      wait: async () => {},
      preflight: async (_, progress) => { const b = await balance(); assert(b.credits >= limit - progress.requests, 'INSUFFICIENT') },
      existing: async () => false,
      search: async () => { counts.search++; return { data: [], observedAt: '2026-10-09T12:00:00Z' } },
      choose: () => null, profile: async () => { throw Error('UNEXPECTED') }, adapt: () => null,
      write: async () => { throw Error('UNEXPECTED') }, readBack: async () => 'UNKNOWN',
      checkpoint: async () => { counts.checkpoints++ },
    }),
    probeBalance: async () => { counts.probes++; return { credits: 39393, observedAt: new Date().toISOString(), official: true } },
    close: async () => { counts.closed++ },
  }
  return { counts, instance, create: async () => { counts.created++; return instance } }
}
test('one shared resource instance, budget includes balance, restart skips consultations', () => fixture(async root => {
  const r = resources(), options = { bytes, expectedHash: sha(bytes), root, authorizedHost: hostname(), create: r.create }
  const first = await executeGlobal(options)
  assert.equal(first.totalRequests, 4); assert.equal(first.balanceRequests, 1)
  const second = await executeGlobal(options)
  assert.equal(second.totalRequests, 5); assert.equal(r.counts.search, 3)
  assert.equal(r.counts.created, 2); assert.equal(r.counts.closed, 2); assert.equal(r.counts.checkpoints, 1)
}))
test('expired balance blocks before search and closes resources', () => fixture(async root => {
  const r = resources()
  r.instance.probeBalance = async () => ({ credits: 39393, observedAt: '2000-01-01T00:00:00Z', official: true })
  const options = { bytes, expectedHash: sha(bytes), root, authorizedHost: hostname(), create: r.create }
  await assert.rejects(executeGlobal(options), /BALANCE_EXPIRED/)
  assert.equal(r.counts.closed, 1); assert.equal(r.counts.search, 0)
  await assert.rejects(executeGlobal(options), /ORPHAN_OR_UNKNOWN_BUDGET_FILE/)
  assert.equal(r.counts.created, 1)
}))
test('staging connection verification fails before paid balance probe and closes resources', () => fixture(async root => {
  const r = resources()
  r.instance.prepare = async () => { throw Error('DEDICATED_WRITER_ROLE_REQUIRED') }
  await assert.rejects(executeGlobal({ bytes, expectedHash: sha(bytes), root, authorizedHost: hostname(), create: r.create }),
    /DEDICATED_WRITER_ROLE_REQUIRED/)
  assert.equal(r.counts.probes, 0)
  assert.equal(r.counts.search, 0)
  assert.equal(r.counts.closed, 1)
}))
test('hash and host divergence cause zero resource creation', () => fixture(async root => {
  const r = resources()
  await assert.rejects(executeGlobal({ bytes, expectedHash: '0'.repeat(64), root, authorizedHost: hostname(), create: r.create }), /SELECTION_HASH/)
  await assert.rejects(executeGlobal({ bytes, root, expectedHash: sha(bytes), authorizedHost: 'other-host', create: r.create }), /HOST/)
  assert.equal(r.counts.created, 0)
}))
test('active global lock blocks a second process composition', () => fixture(async root => {
  const r = resources(); let unblock!: () => void
  const blocked = new Promise<void>(resolve => { unblock = resolve })
  let signal!: () => void
  const entered = new Promise<void>(resolve => { signal = resolve })
  const original = r.instance.probeBalance
  r.instance.probeBalance = async () => { signal(); await blocked; return original() }
  const options = { bytes, root, expectedHash: sha(bytes), authorizedHost: hostname(), create: r.create }
  const first = executeGlobal(options); await entered
  await assert.rejects(executeGlobal(options), /EEXIST/)
  unblock(); await first; assert.equal(r.counts.created, 1)
}))
test('balance transport indeterminate blocks restart, no retry and cleanup', () => fixture(async root => {
  const r = resources(); r.instance.probeBalance = async () => { r.counts.probes++; throw Error('ECONNRESET') }
  const options = { bytes, root, expectedHash: sha(bytes), authorizedHost: hostname(), create: r.create }
  await assert.rejects(executeGlobal(options), /ECONNRESET/)
  await assert.rejects(executeGlobal(options), /ORPHAN_OR_UNKNOWN_BUDGET_FILE/)
  assert.equal(r.counts.probes, 1); assert.equal(r.counts.closed, 1); assert.equal(r.counts.search, 0)
}))
test('insufficient balance prevents all collection requests', () => fixture(async root => {
  const r = resources(); r.instance.probeBalance = async () => ({ credits: 0, observedAt: new Date().toISOString(), official: true })
  await assert.rejects(executeGlobal({ bytes, root, expectedHash: sha(bytes), authorizedHost: hostname(), create: r.create }), /INSUFFICIENT/)
  assert.equal(r.counts.search, 0); assert.equal(r.counts.closed, 1)
}))

test('operational opt-in spans batches, checkpoints gaps and restarts without repeating requests', () => fixture(async root => {
  const selection = Buffer.from(JSON.stringify({ excludedIds: [], players: Array.from({ length: 101 }, (_, i) => ({
    playerId: `p${String(i + 1).padStart(3, '0')}`, clubId: 'club', leagueId: 'league',
  })) }))
  const r = resources(), original = r.instance.dependencies, calls: string[] = []
  r.instance.dependencies = (balance, limit) => ({ ...original(balance, limit), search: async p => {
    calls.push(p.playerId)
    if (p.playerId === 'p025' || p.playerId === 'p100') throw Object.assign(new Error('private'), {
      code: p.playerId === 'p025' ? 'ETIMEDOUT' : 'ECONNRESET',
    })
    return { data: [], observedAt: new Date().toISOString() }
  } })
  const options = { bytes: selection, expectedHash: sha(selection), root, authorizedHost: hostname(), create: r.create,
    autoQuarantine: operationalQuarantinePolicy(['--auto-quarantine-v01']) }
  const first = await executeGlobal(options)
  assert.equal(first.status, 'PARTIAL'); assert.equal(first.processed, 99); assert.equal(first.quarantined, 2)
  assert.equal(first.pending, 2); assert.equal(first.totalRequests, 102); assert.equal(r.counts.checkpoints, 5)
  const dir = join(root, sha(selection), 'journal')
  const snapshot = async () => Promise.all((await readdir(dir)).sort().map(async file => [file, await readFile(join(dir, file), 'utf8')]))
  const before = await snapshot()
  const second = await executeGlobal(options)
  assert.equal(second.totalRequests, 103); assert.equal(second.quarantined, 2)
  assert.equal(calls.length, 101); assert.equal(new Set(calls).size, 101)
  assert.deepEqual(await snapshot(), before); assert.equal(r.counts.closed, 2)
}))

test('operational opt-in cannot retroactively quarantine historical unknown or probe balance on restart', () => fixture(async root => {
  const r = resources(), original = r.instance.dependencies
  r.instance.dependencies = (balance, limit) => ({ ...original(balance, limit), search: async () => {
    r.counts.search++; throw Object.assign(new Error('private'), { code: 'ERR_ASSERTION' })
  } })
  const options = { bytes, expectedHash: sha(bytes), root, authorizedHost: hostname(), create: r.create }
  await assert.rejects(executeGlobal(options))
  await assert.rejects(executeGlobal({ ...options, autoQuarantine: operationalQuarantinePolicy(['--auto-quarantine-v01']) }), /UNKNOWN_REQUEST/)
  assert.equal(r.counts.probes, 1); assert.equal(r.counts.search, 1); assert.equal(r.counts.closed, 2)
}))
