import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindings, liveFootballTransport, type ReadOnlyGate } from './integration'
import { capturedDiagnostic, diagnose } from './diagnostics'
import { runGlobal, sha } from './runner'

const context = { requestId: null, stage: 'LIVE_SEARCH' as const, outcomeIndeterminate: true }
for (const [assertion, body] of [
  ['INVALID_ENVELOPE', { success: false, credits_remaining: 100 }],
  ['BALANCE', { success: true, credits_remaining: -1, data: {} }],
  ['UNSAFE_PROVIDER_FIELD', { success: true, credits_remaining: 100, data: { players: [{ name: 'https://private/?key=SECRET' }] } }],
] as const) test(`future ${assertion} remains distinct, sanitized and blocks uncertain restart`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-assertion-'))
  try {
    let calls = 0
    const transport = liveFootballTransport('SECRET', (async () => { calls++; return new Response(JSON.stringify(body)) }) as typeof fetch)
    const gate: ReadOnlyGate = { preflight: async () => {}, existing: async () => false, concurrent: async () => false,
      balance: async () => ({ credits: 20000, observedAt: new Date().toISOString(), official: true }),
      readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
    const deps = bindings(transport, async () => { throw Error('NO_WRITE') }, gate)
    const bytes = Buffer.from(JSON.stringify({ players: [{ playerId: 'synthetic', leagueId: 'league', clubId: 'club', name: 'synthetic' }], excludedIds: [] }))
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), error => {
      const d = capturedDiagnostic(error)!
      assert.equal(d.assertion, assertion); assert.equal(d.code, 'ERR_ASSERTION'); assert.equal(d.stage, 'LIVE_SEARCH')
      assert(d.outcomeIndeterminate); assert(!JSON.stringify(d).includes('SECRET')); assert(!JSON.stringify(d).includes('https'))
      return true
    })
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNKNOWN_REQUEST/)
    assert.equal(calls, 1)
    assert.equal((await readdir(root)).filter(x => /^\d{8}\.json$/.test(x)).length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('pure invalid name validation precedes search reservation and consumes no request budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-before-send-'))
  try {
    let calls = 0
    const gate: ReadOnlyGate = { preflight: async () => {}, existing: async () => false, concurrent: async () => false,
      balance: async () => ({ credits: 20000, observedAt: new Date().toISOString(), official: true }), readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
    const deps = bindings(async () => { calls++; throw Error('FORBIDDEN') }, async () => {}, gate)
    for (const name of ['', '  ', undefined]) {
      const bytes = Buffer.from(JSON.stringify({ players: [{ playerId: 'synthetic', clubId: 'club', leagueId: 'league', name }], excludedIds: [] }))
      await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /NAME/)
      assert.equal((await readdir(root)).filter(x => /^\d{8}\.json$/.test(x)).length, 0)
    }
    assert.equal(calls, 0) // Pure check costs zero player requests; operational balance probes remain separately charged.
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('valid search still passes; arbitrary assertion messages never become persisted diagnostics', async () => {
  const transport = liveFootballTransport('SECRET', (async () => new Response(JSON.stringify({ success: true, credits_remaining: 10,
    data: { players: [{ id: 'synthetic', name: 'Valid' }] } }))) as typeof fetch)
  const response = await transport('player_search', { q: 'Valid' })
  assert(response.data); assert.equal(response.data.creditsRemaining, 10)
  let error: unknown
  try { assert(false, 'SECRET postgres://private https://token') } catch (e) { error = e }
  assert.equal(diagnose(error, context).assertion, undefined)
  assert(!JSON.stringify(diagnose(error, context)).includes('SECRET'))
})
