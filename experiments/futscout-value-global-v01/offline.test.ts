import { approvedManualAttempt, validateValueBindings } from './local-bindings'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGlobal, sha, type Dependencies, type Player, type QuarantineApproval } from './runner'
import { failureClass } from './quarantine-policy'
import { offlineEvidenceStore, offlineResources } from './operational'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'value-offline-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

const players: Player[] = ['p001', 'p002', 'p003'].map(playerId => ({ playerId, clubId: 'club', leagueId: 'league' }))
const parentHash = 'a'.repeat(64)
const selection = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: players.map(p => p.playerId), excludedIds: [] }))
const selectionHash = sha(selection)

for (const kind of ['SEARCH', 'PROFILE_503', 'BALANCE'] as const) test(`synthetic ${kind} approval binds every identity and hash exactly`, () => {
  const childHash = '1'.repeat(64), originalHash = '2'.repeat(64)
  const approval: QuarantineApproval = { approved: true, selectionHash: childHash, position: 2,
    playerId: 'synthetic-player', requestId: `lfglobal-${originalHash.slice(0, 16)}-synthetic-player-${kind === 'PROFILE_503' ? 'profile' : 'search'}`,
    originalRequestHash: '3'.repeat(64), approvedAt: new Date().toISOString(), approvalReference: 'synthetic-approval' }
  const config = validateValueBindings({ schemaVersion: 1, parentSelectionHash: originalHash, offlineSelectionHash: childHash,
    quarantines: [{ selectionHash: childHash, parentSelectionHash: originalHash, position: approval.position,
      playerId: approval.playerId, requestId: approval.requestId, originalRequestHash: approval.originalRequestHash,
      approvalReference: approval.approvalReference, kind, extraManualSlot: false }] })
  assert(approvedManualAttempt(approval, childHash, originalHash, config))
  for (const patch of [{ playerId: 'other' }, { requestId: 'other' }, { originalRequestHash: '0'.repeat(64) },
    { position: 3 }, { approvalReference: 'other' }, { selectionHash: '0'.repeat(64) }]) {
    assert(!approvedManualAttempt({ ...approval, ...patch }, childHash, originalHash, config))
  }
  assert(!approvedManualAttempt(approval, '0'.repeat(64), originalHash, config))
  assert(!approvedManualAttempt(approval, childHash, '0'.repeat(64), config))
  assert.throws(() => approvedManualAttempt(approval, childHash, originalHash), /VALUE_BINDINGS_REQUIRED/)
  assert.equal(failureClass({ schemaVersion: 1, requestId: approval.requestId, stage: 'LIVE_SEARCH', outcomeIndeterminate: true,
    timestamp: new Date().toISOString(), errorClass: 'AssertionError', code: 'ERR_ASSERTION', category: 'UNKNOWN',
    assertion: 'BALANCE', causes: [] }), 'D_SYSTEMIC')
})
test('offline preflight invokes the fresh balance callback before collection', async () => {
  const resources = offlineResources('fixture-key', 'unused-fixture-path', selectionHash,
    parentHash, new Map(), validateValueBindings({ schemaVersion: 1, parentSelectionHash: parentHash,
      offlineSelectionHash: selectionHash, quarantines: [] }))
  let probes = 0
  const deps = resources.dependencies(async () => {
    probes++
    return { credits: 10, observedAt: new Date().toISOString(), official: true }
  }, 5)
  await deps.preflight(players, { completed: [], writes: [], requests: 0 })
  assert.equal(probes, 1)
})
function state(playerId: string, presence: 'VALUE' | 'NULL'): EconomicWrite['state'] {
  return { playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: `provider-${playerId}`,
    context: 'REAL_WORLD', snapshotVersion: 'v1', presence, amount: presence === 'VALUE' ? '100.00' : null,
    currency: presence === 'VALUE' ? 'EUR' : null, period: null, contractUntil: null, datePrecision: null,
    providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: presence === 'VALUE' ? 'VALID' : 'MISSING',
    metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } }
}

test('offline positive/null receipts survive restart without PostgreSQL or repeated consultations', () => fixture(async root => {
  const store = offlineEvidenceStore(root, selectionHash, parentHash, new Map(players.map((p, i) => [p.playerId, i + 1058])))
  await store.prepare()
  let calls = 0
  const deps: Dependencies = { offline: { parentHash, players }, continuous: true, wait: async () => {},
    preflight: async () => {}, existing: async () => false,
    search: async () => { calls++; return { data: { players: [] }, observedAt: '2026-10-13T00:00:00Z' } },
    choose: p => p.playerId === 'p003' ? null : `provider-${p.playerId}`,
    profile: async () => { calls++; return { data: {}, observedAt: '2026-10-13T00:00:01Z' } },
    adapt: p => state(p.playerId, p.playerId === 'p001' ? 'VALUE' : 'NULL'),
    write: store.write, readBack: store.readBack, checkpoint: async () => {} }
  const journal = join(root, 'journal')
  const result = await runGlobal(selection, selectionHash, journal, deps, 5)
  assert.equal(result.processed, 2); assert.equal(result.requests, 5); assert.equal(result.pendingByType?.IDENTITY_PENDING, 1)
  assert.equal(calls, 5)
  const receipts = await readdir(join(root, 'receipts'))
  assert.equal(receipts.length, 2)
  const stored = await Promise.all(receipts.map(async file => JSON.parse(await readFile(join(root, 'receipts', file), 'utf8'))))
  assert.deepEqual(stored.map(r => r.plan.state.presence).sort(), ['NULL', 'VALUE'])
  assert(stored.every(r => r.selectCurrent === false && r.hash === sha(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'hash'))))))
  deps.search = async () => { throw Error('REPEATED_SEARCH') }
  deps.profile = async () => { throw Error('REPEATED_PROFILE') }
  assert.deepEqual(await runGlobal(selection, selectionHash, journal, deps, 5), result)
  assert.equal(calls, 5)
}))

test('offline receipt hash or content divergence never confirms an uncertain result', () => fixture(async root => {
  const store = offlineEvidenceStore(root, selectionHash, parentHash, new Map([['p001', 1058]]))
  await store.prepare()
  const plan: EconomicWrite = { requestId: `lfglobal-${parentHash.slice(0, 16)}-p001`, observedAt: '2026-10-13T00:00:00Z',
    selectCurrent: false, expectedRevision: null, selectionReason: 'AUTHORIZED_GLOBAL', policyVersion: 'global-v1',
    state: state('p001', 'VALUE') }
  await store.write(plan)
  assert.equal(await store.readBack(plan), 'CONFIRMED')
  const file = join(root, 'receipts', `${plan.requestId}.json`), receipt = JSON.parse(await readFile(file, 'utf8'))
  receipt.plan.state.amount = '999.00'
  await writeFile(file, JSON.stringify(receipt))
  assert.equal(await store.readBack(plan), 'CONFLICT')
  await assert.rejects(store.write(plan), /OFFLINE_RECEIPT_ALREADY_EXISTS/)
}))

test('offline timeout is UNKNOWN and restart cannot retry', () => fixture(async root => {
  let calls = 0
  const deps: Dependencies = { offline: { parentHash, players }, wait: async () => {}, continuous: true,
    preflight: async () => {}, existing: async () => false,
    search: async () => { calls++; throw Error('ETIMEDOUT') }, choose: () => null,
    profile: async () => { throw Error('UNEXPECTED') }, adapt: () => null,
    write: async () => { throw Error('POSTGRESQL_MUST_NOT_BE_USED') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
  await assert.rejects(runGlobal(selection, selectionHash, root, deps, 5), /ETIMEDOUT/)
  await assert.rejects(runGlobal(selection, selectionHash, root, deps, 5), /UNKNOWN_REQUEST_REQUIRES_RECONCILIATION/)
  assert.equal(calls, 1)
}))

test('offline budget and frozen selection reject before any external effect', () => fixture(async root => {
  let calls = 0
  const deps: Dependencies = { offline: { parentHash, players }, wait: async () => {},
    preflight: async () => {}, existing: async () => false,
    search: async () => { calls++; return { data: {}, observedAt: new Date().toISOString() } }, choose: () => null,
    profile: async () => { throw Error('UNEXPECTED') }, adapt: () => null,
    write: async () => { throw Error('POSTGRESQL_MUST_NOT_BE_USED') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
  await assert.rejects(runGlobal(selection, 'bad', root, deps, 5), /SELECTION_HASH/)
  const changed = Buffer.from(JSON.stringify({ parentSelectionHash: parentHash, playerIds: ['wrong'], excludedIds: [] }))
  await assert.rejects(runGlobal(changed, sha(changed), root, deps, 5), /OFFLINE_SELECTION_ORDER/)
  await assert.rejects(runGlobal(selection, selectionHash, root, deps, 0), /REQUEST_LIMIT/)
  assert.equal(calls, 0)
}))
