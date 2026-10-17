import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindings, liveFootballTransport, type ReadOnlyGate } from './integration'
import { acquireGlobalLock, inspectGlobalLock } from './global-lock'
import { runGlobal, sha } from './runner'

const p = { playerId: 'player1', clubId: 'club1', leagueId: 'league1', name: 'Alex Example', nationality: 'Netherlands', dateOfBirth: '1995-01-02' }
const profile = { player_id: 'remote1', name: p.name, birthdate: '1995-01-02', nationality: 'Holland', market_value: '100€' }
function gate(): ReadOnlyGate {
  return { preflight: async () => {}, existing: async () => false, readBack: async () => 'CONFIRMED', checkpoint: async () => {},
    concurrent: async () => false, balance: async () => ({ credits: 39394, observedAt: new Date().toISOString(), official: true }) }
}
test('existing matcher and adapter preserve NL alias, null, zero and observedAt', async () => {
  const deps = bindings(async () => ({ data: {}, observedAt: '2026-10-09T12:00:00Z' }), async () => {}, gate())
  for (const value of ['100€', null, '0€', undefined]) {
    const state = deps.adapt(p, 'remote1', { data: { ...profile, market_value: value }, observedAt: '2026-10-09T12:00:00Z' })
    assert(state); assert.equal(state.confidence, 'HIGH')
    assert.equal(state.presence, value === null ? 'NULL' : value === undefined ? 'ABSENT' : 'VALUE')
    if (value === '0€') assert.equal(state.amount, '0.00')
  }
  assert.equal(deps.adapt(p, 'remote1', { data: { ...profile, birthdate: '1994-01-02' }, observedAt: '2026-10-09T12:00:00Z' }), null)
})
test('mocked integration, read-back and restart do not repeat provider calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-binding-'))
  try {
    let calls = 0, writes = 0
    const deps = bindings(async endpoint => { calls++; return { data: endpoint === 'player_search' ? { players: [{ id: 'remote1', name: p.name }] } : profile,
      observedAt: '2026-10-09T12:00:00Z' } }, async plan => {
      writes++; assert.equal(plan.observedAt, '2026-10-09T12:00:00Z'); assert.equal(plan.expectedRevision, null)
    }, gate())
    deps.wait = async () => {}
    const bytes = Buffer.from(JSON.stringify({ players: [p], excludedIds: [] }))
    await runGlobal(bytes, sha(bytes), root, deps); await runGlobal(bytes, sha(bytes), root, deps)
    assert.equal(calls, 2); assert.equal(writes, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('fresh balance, concurrency and existing records fail closed', async () => {
  const g = gate(), deps = bindings(async () => { throw Error('NO_HTTP') }, async () => {}, g)
  g.balance = async () => ({ credits: 39394, observedAt: '2020-01-01T00:00:00Z', official: true })
  await assert.rejects(deps.preflight([p], { completed: [], writes: [], requests: 0 }), /BALANCE_STALE/)
  g.concurrent = async () => true
  await assert.rejects(deps.preflight([p], { completed: [], writes: [], requests: 0 }), /CONCURRENT/)
})
test('global lock spans receipt directories and never removes a live lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-lock-'))
  try {
    const release = await acquireGlobalLock(root, 'a'.repeat(64))
    assert.equal((await inspectGlobalLock(root)).state, 'ACTIVE_OR_PID_REUSED')
    await assert.rejects(acquireGlobalLock(root, 'b'.repeat(64)), /EEXIST/)
    await release()
    const next = await acquireGlobalLock(root, 'b'.repeat(64)); await next()
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('HTTP client uses official endpoints, sanitizes and never retries 429', async () => {
  let calls = 0
  const transport = liveFootballTransport('synthetic-secret', (async url => {
    calls++; assert.equal(new URL(String(url)).pathname, '/api/v1/player')
    return new Response(JSON.stringify({ success: true, credits_remaining: 100, data: { ...profile, api_key: 'do-not-save' } }))
  }) as typeof fetch)
  assert(!JSON.stringify(await transport('player', { player_id: 'remote1' })).includes('do-not-save'))
  const failed = liveFootballTransport('synthetic-secret', (async () => { calls++; return new Response('', { status: 429 }) }) as typeof fetch)
  await assert.rejects(failed('player', { player_id: 'remote1' }), /LIVE_FOOTBALL_REQUEST_FAILED/)
  assert.equal(calls, 2)
})
