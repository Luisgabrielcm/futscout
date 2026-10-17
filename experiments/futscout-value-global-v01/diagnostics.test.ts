import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { capturedDiagnostic, diagnose, persistDiagnostic } from './diagnostics'
import { liveFootballTransport } from './integration'
import { runGlobal, sha, type Dependencies } from './runner'
import { executeGlobal } from './executor'
import { syntheticBindings } from './synthetic-bindings.fixture'

const context = { requestId: 'lfglobal-0123456789abcdef-synthetic-search', stage: 'LIVE_SEARCH' as const, outcomeIndeterminate: true }
for (const code of ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT']) test(`nested ${code} survives transport sanitization`, async () => {
  let calls = 0
  const transport = liveFootballTransport('SECRET_TOKEN', (async () => {
    calls++; throw new TypeError('fetch failed https://host/?api_key=SECRET_TOKEN', { cause: Object.assign(new Error('private payload'), { code }) })
  }) as typeof fetch)
  await assert.rejects(transport('player_search', { q: 'synthetic' }), error => {
    const d = diagnose(error, context)
    assert.equal(d.code, code); assert.equal(d.errorClass, 'TypeError'); assert.equal(d.causes[0].code, code)
    assert.equal(d.stage, 'LIVE_SEARCH'); assert.equal(d.outcomeIndeterminate, true)
    assert(!JSON.stringify(d).includes('SECRET_TOKEN')); return true
  })
  assert.equal(calls, 1)
})
test('AbortSignal TimeoutError classified without copying stack or message', () => {
  const d = diagnose(new DOMException('secret timeout', 'TimeoutError'), context)
  assert.equal(d.category, 'TIMEOUT'); assert.equal(d.code, 'ETIMEDOUT')
  assert(!JSON.stringify(d).includes('secret'))
})
for (const status of [429, 401, 403]) test(`HTTP ${status} preserves code without retries`, async () => {
  let calls = 0
  const transport = liveFootballTransport('SECRET', (async () => { calls++; return new Response('', { status }) }) as typeof fetch)
  await assert.rejects(transport('player', { player_id: 'synthetic' }), error => {
    const d = diagnose(error, { ...context, stage: 'LIVE_PROFILE' })
    assert.equal(d.code, `HTTP_${status}`)
    assert.equal(d.category, status === 429 ? 'RATE_LIMIT' : 'AUTHENTICATION'); return true
  })
  assert.equal(calls, 1)
})
test('PostgreSQL codes and Prisma nested causes remain distinct from transport', () => {
  for (const code of ['P1001', 'P2028', '40001', '28P01']) {
    const d = diagnose(Object.assign(new Error('postgresql://user:password@db/private'), { code }), { ...context, stage: 'WRITE_PLAYER' })
    assert.equal(d.code, code); assert.equal(d.category, 'POSTGRESQL')
    assert(!JSON.stringify(d).includes('password'))
  }
})
test('unknown and cyclic errors never copy credentials, arbitrary class/code, stack or payload', () => {
  const e = Object.assign(new Error('Bearer secret https://host/path?api_key=TOKEN'), { name: 'PRIVATE_NAME', code: 'SECRET', payload: { token: 'TOKEN' }, cause: {} })
  e.cause = e
  const d = diagnose(e, context), encoded = JSON.stringify(d)
  assert.equal(d.code, 'UNKNOWN'); assert.equal(d.errorClass, 'Error')
  for (const secret of ['Bearer', 'secret', 'http', 'TOKEN', 'PRIVATE_NAME', 'payload', 'stack']) assert(!encoded.includes(secret))
  assert(Number.isFinite(Date.parse(d.timestamp))); assert.equal(d.causes.length, 0)
  assert.throws(() => diagnose(e, { ...context, requestId: 'https://secret' }), /UNSAFE/)
})
test('durable diagnostic sidecar preserves journal hashes; UNKNOWN restart makes no provider call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-diagnostic-'))
  try {
    const bytes = Buffer.from(JSON.stringify({ players: [{ playerId: 'synthetic', clubId: 'club', leagueId: 'league' }], excludedIds: [] }))
    let calls = 0, failure: unknown
    const deps: Dependencies = { preflight: async () => {}, existing: async () => false,
      search: async () => { calls++; throw Object.assign(new Error('SECRET'), { cause: Object.assign(new Error('private'), { code: 'ENOTFOUND' }) }) },
      choose: () => null, profile: async () => { throw Error('FORBIDDEN') }, adapt: () => null,
      write: async () => { throw Error('FORBIDDEN') }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
    try { await runGlobal(bytes, sha(bytes), root, deps) } catch (e) { failure = e }
    const d = capturedDiagnostic(failure)!
    assert.equal(d.requestId, `lfglobal-${sha(bytes).slice(0, 16)}-synthetic-search`)
    assert.equal(d.stage, 'LIVE_SEARCH'); assert.equal(d.code, 'ENOTFOUND'); assert(d.outcomeIndeterminate)
    const original = await readFile(join(root, '00000001.json'), 'utf8')
    const hash = await persistDiagnostic(root, d)
    const files = await readdir(join(root, 'diagnostics'))
    assert.equal(files.length, 1)
    const envelope = JSON.parse(await readFile(join(root, 'diagnostics', files[0]), 'utf8'))
    assert.equal(envelope.hash, hash); assert.equal(hash, sha(JSON.stringify(envelope.record)))
    assert.equal(envelope.record.timestamp, d.timestamp)
    await persistDiagnostic(root, d); assert.equal((await readdir(join(root, 'diagnostics'))).length, 2)
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNKNOWN_REQUEST/)
    assert.equal(calls, 1); assert.equal(await readFile(join(root, '00000001.json'), 'utf8'), original)
    assert.equal((await readdir(root)).filter(x => /^\d{8}\.json$/.test(x)).length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('write failure captures requestId, stage and indeterminate result without a fake receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-write-diagnostic-'))
  try {
    const bytes = Buffer.from(JSON.stringify({ players: [{ playerId: 'synthetic', clubId: 'club', leagueId: 'league' }], excludedIds: [] }))
    const deps: Dependencies = { wait: async () => {}, preflight: async () => {}, existing: async () => false,
      search: async () => ({ data: [], observedAt: new Date().toISOString() }), choose: () => 'remote',
      profile: async () => ({ data: {}, observedAt: new Date().toISOString() }),
      adapt: p => ({ playerId: p.playerId, field: 'MARKET_VALUE', provider: 'LIVE_FOOTBALL', providerPlayerId: 'remote',
        context: 'REAL_WORLD', snapshotVersion: 'v1', presence: 'NULL', amount: null, currency: null, period: null,
        contractUntil: null, datePrecision: null, providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: 'MISSING',
        metadata: { source: 'LIVE_FOOTBALL', evidenceRef: 'synthetic' } }),
      write: async () => { throw Object.assign(new Error('private db'), { code: 'P1001' }) }, readBack: async () => 'UNKNOWN', checkpoint: async () => {} }
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), e => {
      const d = capturedDiagnostic(e)!
      assert.equal(d.stage, 'WRITE_PLAYER'); assert.equal(d.code, 'P1001'); assert(d.outcomeIndeterminate)
      assert.equal(d.requestId, `lfglobal-${sha(bytes).slice(0, 16)}-synthetic`); return true
    })
    await assert.rejects(runGlobal(bytes, sha(bytes), root, deps), /UNCERTAIN_WRITE/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('executor cleanup failure cannot mask the original request failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-cleanup-diagnostic-'))
  try {
    const bytes = Buffer.from(JSON.stringify({ players: [{ playerId: 'synthetic', clubId: 'club', leagueId: 'league' }], excludedIds: [] }))
    const primary = Object.assign(new Error('private request'), { code: 'ECONNRESET' })
    await assert.rejects(executeGlobal({ bytes, expectedHash: sha(bytes), valueBindings: syntheticBindings(sha(bytes), []), root, authorizedHost: hostname(), create: async () => ({
      dependencies: () => ({ preflight: async () => {}, existing: async () => false,
        search: async () => { throw primary }, choose: () => null, adapt: () => null,
        profile: async () => { throw Error('FORBIDDEN') }, write: async () => { throw Error('FORBIDDEN') },
        readBack: async () => 'UNKNOWN', checkpoint: async () => {} }),
      probeBalance: async () => { throw Error('FORBIDDEN') }, close: async () => { throw Object.assign(new Error('private cleanup'), { code: 'P1001' }) },
    }) }), error => {
      assert.equal(error, primary)
      const d = capturedDiagnostic(error)!
      assert.equal(d.code, 'ECONNRESET'); assert.equal(d.stage, 'LIVE_SEARCH'); assert.equal(d.cleanup![0].code, 'P1001')
      assert(!JSON.stringify(d).includes('private')); return true
    })
  } finally { await rm(root, { recursive: true, force: true }) }
})
