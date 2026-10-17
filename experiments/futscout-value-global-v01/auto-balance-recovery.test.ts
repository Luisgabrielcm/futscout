import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { autoBalancePolicyVersion, isBalanceDiagnostic, operationalBalanceRecoveryPolicy, quarantineLimits,
  type AutoBalanceRecoveryPolicy } from './quarantine-policy'
import { runGlobal, sha, type BalanceEvidence, type Dependencies, type Player } from './runner'

const parentHash = 'a'.repeat(64)
const players: Player[] = ['p001', 'p002', 'p003'].map(playerId => ({ playerId, clubId: 'club', leagueId: 'league' }))
const selection = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: players.map(p => p.playerId), excludedIds: [] }))
const selectionHash = sha(selection)
const policy: AutoBalanceRecoveryPolicy = { enabled: true, version: autoBalancePolicyVersion }
const evidence = (): BalanceEvidence => ({ receiptId: '000002', receiptHash: 'b'.repeat(64), credits: 10,
  observedAt: new Date().toISOString(), official: true })

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'value-balance-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
function dependencies(matchedPlayers: Player[] = players) {
  let searchCalls = 0, profileCalls = 0, writeCalls = 0, probeCalls = 0
  const receipts = new Map<string, BalanceEvidence>()
  const deps: Dependencies = {
    offline: { parentHash, players: matchedPlayers }, continuous: true, wait: async () => {},
    preflight: async () => {}, existing: async () => false,
    search: async () => {
      searchCalls++
      if (searchCalls === 1) assert.fail('BALANCE')
      return { data: { players: [] }, observedAt: new Date().toISOString() }
    },
    choose: p => `provider-${p.playerId}`,
    profile: async () => { profileCalls++; return { data: {}, observedAt: new Date().toISOString() } },
    adapt: p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL',
      providerPlayerId: `provider-${p.playerId}`, context: 'REAL_WORLD', snapshotVersion: 'v1',
      presence: 'NULL', amount: null, currency: null, period: null, contractUntil: null,
      datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED',
      status: 'MISSING', metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } }),
    write: async plan => { assert.equal(plan.selectCurrent, false); writeCalls++ },
    readBack: async () => 'CONFIRMED', checkpoint: async () => {},
    balanceRecovery: {
      read: async intent => receipts.get(intent.requestId) ?? null,
      probe: async intent => { probeCalls++; const found = evidence(); receipts.set(intent.requestId, found); return found },
    },
  }
  return { deps, receipts, counts: () => ({ searchCalls, profileCalls, writeCalls, probeCalls }) }
}

test('BALANCE opt-in is separate, exact and default-off; other systemic errors stay blocked', () => {
  assert.equal(operationalBalanceRecoveryPolicy([]), undefined)
  assert.deepEqual(operationalBalanceRecoveryPolicy(['--auto-balance-recovery-v01']), policy)
  assert.throws(() => operationalBalanceRecoveryPolicy(['--auto-balance-recovery-v02']), /INVALID_AUTO_BALANCE_OPT_IN/)
  assert.throws(() => operationalBalanceRecoveryPolicy(['--auto-balance-recovery-v01', '--auto-balance-recovery-v01']), /INVALID_AUTO_BALANCE_OPT_IN/)
  const diagnostic = { schemaVersion: 1 as const, stage: 'LIVE_SEARCH' as const, requestId: 'id',
    outcomeIndeterminate: true, timestamp: new Date().toISOString(), errorClass: 'AssertionError',
    code: 'ERR_ASSERTION', category: 'UNKNOWN', assertion: 'BALANCE', causes: [] }
  assert(isBalanceDiagnostic(diagnostic))
  for (const code of ['HTTP_401', 'HTTP_403', 'HTTP_429', 'P2028', 'ENOTFOUND']) {
    assert(!isBalanceDiagnostic({ ...diagnostic, code, assertion: undefined }))
  }
  assert(!isBalanceDiagnostic({ ...diagnostic, stage: 'WRITE_PLAYER' }))
  assert(!isBalanceDiagnostic({ ...diagnostic, outcomeIndeterminate: false }))
  assert(quarantineLimits([1, 20, 40, 60, 80], 2))
  assert(!quarantineLimits([1, 20, 40, 60, 80, 99], 1))
  assert(!quarantineLimits([1], 3))
})

test('fresh valid balance isolates only the failed player, preserves hashes and restarts without retry', () => fixture(async root => {
  const f = dependencies()
  const result = await runGlobal(selection, selectionHash, root, f.deps, 6, undefined, undefined, policy)
  assert.equal(result.processed, 2)
  assert.equal(result.quarantined, 1)
  assert.equal(result.requests, 5)
  assert.deepEqual(f.counts(), { searchCalls: 3, profileCalls: 2, writeCalls: 2, probeCalls: 1 })
  const files = (await readdir(root)).filter(name => /^\d{8}\.json$/.test(name)).sort()
  let previous: string | null = null
  const events = []
  for (const file of files) {
    const envelope = JSON.parse(await readFile(join(root, file), 'utf8'))
    assert.equal(envelope.record.previous, previous)
    assert.equal(envelope.hash, sha(JSON.stringify(envelope.record)))
    previous = envelope.hash
    events.push(envelope.record.event)
  }
  const quarantine = events.find(e => e.kind === 'QUARANTINED')!
  assert.equal(quarantine.payload.originalState, 'UNKNOWN')
  assert.equal(quarantine.payload.reconciliation, 'PENDING')
  assert.equal(quarantine.payload.retryBlocked, true)
  assert.deepEqual(quarantine.payload.balanceEvidence, f.receipts.get(quarantine.id))
  assert(!events.some(e => e.kind === 'RESPONSE' && e.id === quarantine.id))
  assert.deepEqual(await runGlobal(selection, selectionHash, root, f.deps, 5, undefined, undefined, policy),
    { ...result, requests: result.requests })
  assert.equal(f.counts().probeCalls, 1)
}))

test('missing balance receipt blocks restart; confirmed receipt resumes without a second probe', () => fixture(async root => {
  const f = dependencies(players.slice(0, 1))
  const one = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: ['p001'], excludedIds: [] }))
  f.deps.balanceRecovery!.probe = async intent => { f.receipts.set(intent.requestId, evidence()); throw Error('RECEIPT_ACK_LOST') }
  await assert.rejects(runGlobal(one, sha(one), root, f.deps, 3, undefined, undefined, policy), /RECEIPT_ACK_LOST/)
  f.receipts.clear()
  await assert.rejects(runGlobal(one, sha(one), root, f.deps, 2, undefined, undefined, policy), /BALANCE_RECEIPT_UNCERTAIN_NO_RETRY/)
  assert.equal(f.counts().searchCalls, 1)
  const id = `lfglobal-${parentHash.slice(0, 16)}-p001-search`
  f.receipts.set(id, evidence())
  const resumed = await runGlobal(one, sha(one), root, f.deps, 2, undefined, undefined, policy)
  assert.equal(resumed.quarantined, 1)
  assert.equal(resumed.processed, 0)
  assert.equal(f.counts().searchCalls, 1)
}))

test('insufficient, negative and invalid balances block without quarantining', async () => {
  for (const credits of [0, -1, Number.NaN]) await fixture(async root => {
    const f = dependencies(players.slice(0, 1))
    const one = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: ['p001'], excludedIds: [] }))
    f.deps.balanceRecovery!.probe = async intent => {
      const invalid = { ...evidence(), credits }
      f.receipts.set(intent.requestId, invalid)
      return invalid
    }
    await assert.rejects(runGlobal(one, sha(one), root, f.deps, 3, undefined, undefined, policy), /BALANCE_INSUFFICIENT/)
    const files = (await readdir(root)).filter(name => /^\d{8}\.json$/.test(name))
    assert.equal(files.length, 2)
    assert.equal(f.counts().searchCalls, 1)
  })
})

test('third consecutive BALANCE blocks before a third balance probe', () => fixture(async root => {
  const f = dependencies()
  f.deps.search = async () => { assert.fail('BALANCE') }
  await assert.rejects(runGlobal(selection, selectionHash, root, f.deps, 8, undefined, undefined, policy),
    /AUTO_BALANCE_LIMIT/)
  assert.equal(f.counts().probeCalls, 2)
  const files = (await readdir(root)).filter(name => /^\d{8}\.json$/.test(name)).sort()
  const events = await Promise.all(files.map(async file =>
    (JSON.parse(await readFile(join(root, file), 'utf8')) as { record: { event: { kind: string } } }).record.event))
  assert.equal(events.filter(event => event.kind === 'QUARANTINED').length, 2)
  assert.equal(events.filter(event => event.kind === 'BALANCE_RECOVERY_INTENT').length, 2)
}))

test('historical UNKNOWN is never retroactively quarantined by new opt-in', () => fixture(async root => {
  const f = dependencies(players.slice(0, 1))
  const one = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: ['p001'], excludedIds: [] }))
  await assert.rejects(runGlobal(one, sha(one), root, f.deps, 3), /BALANCE/)
  await assert.rejects(runGlobal(one, sha(one), root, f.deps, 3, undefined, undefined, policy),
    /UNKNOWN_REQUEST_REQUIRES_RECONCILIATION/)
  assert.equal(f.counts().searchCalls, 1)
  assert.equal(f.counts().probeCalls, 0)
}))
