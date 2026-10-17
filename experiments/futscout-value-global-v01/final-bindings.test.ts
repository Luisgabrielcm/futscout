import test from 'node:test'
import assert from 'node:assert/strict'
import { postgresGate, type ReadClient } from './postgres-gate'
import { officialBalance, paidOfficialBalanceProbe } from './balance'
import { bindings } from './integration'

function fixture(fail = false) {
  const queries: string[] = []; let closed = 0
  const client: ReadClient = {
    connect: async () => {}, end: async () => { closed++ },
    query: async sql => {
      queries.push(sql)
      if (sql.startsWith('SHOW')) return { rows: [{ transaction_read_only: 'on' }] }
      if (sql.includes('current_database() db')) return { rows: [{ db: 'test' }] }
      if (sql.includes('pg_stat_activity')) return { rows: [{ n: 0 }] }
      if (fail && sql.includes('FROM "Player"')) throw Error('ENOTFOUND')
      if (sql === 'SELECT count(*)::int n FROM "Player"') return { rows: [{ n: 16228 }] }
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] }
      return { rows: [] }
    },
  }
  const gate = postgresGate({ client: () => client, database: 'test', baseline: [], consultedIds: async () => new Set(),
    balance: async () => ({ credits: 39394, observedAt: new Date().toISOString(), official: true }) })
  return { gate, queries, closed: () => closed }
}
test('PostgreSQL gate uses READ ONLY and always ROLLBACK + close; no DML', async () => {
  const f = fixture()
  await f.gate.preflight([], { completed: [], writes: [], requests: 0 })
  assert.equal(f.closed(), 2)
  assert.equal(f.queries.filter(q => q === 'ROLLBACK').length, 2)
  assert(!f.queries.some(q => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|COMMIT)/.test(q)))
})
test('connection/query failure still closes and rolls back', async () => {
  const f = fixture(true)
  await assert.rejects(f.gate.preflight([], { completed: [], writes: [], requests: 0 }), /ENOTFOUND/)
  assert.equal(f.closed(), 2); assert.equal(f.queries.at(-1), 'ROLLBACK')
})
test('read-back with no observation never claims confirmation', async () => {
  const f = fixture()
  assert.equal(await f.gate.readBack({ requestId: 'synthetic' } as Parameters<typeof f.gate.readBack>[0]), 'NOT_STARTED')
  assert.equal(f.closed(), 1)
})
test('unapproved paid balance probe is never called', async () => {
  let calls = 0
  await assert.rejects(officialBalance({ authorizedPaidProbe: false, probe: async () => { calls++; return { success: true, credits_remaining: 20 } }, record: async () => {} }), /AUTHORIZATION_REQUIRED/)
  assert.equal(calls, 0)
})
test('mock official balance captures timestamp and sanitized receipt', async () => {
  const receipts: unknown[] = []
  const balance = await officialBalance({ authorizedPaidProbe: true, probe: async () => ({ success: true, credits_remaining: 39394 }), record: async r => { receipts.push(r) } })
  assert.equal(balance.credits, 39394); assert(balance.official); assert.equal(receipts.length, 1)
  assert(Math.abs(Date.now() - Date.parse(balance.observedAt)) < 1000)
})
test('balance transport error has zero retry', async () => {
  let calls = 0
  await assert.rejects(officialBalance({ authorizedPaidProbe: true, probe: async () => { calls++; throw Error('timeout') }, record: async () => {} }), /timeout/)
  assert.equal(calls, 1)
})
test('concrete official probe uses documented leagues endpoint with mocked HTTP only', async () => {
  let calls = 0
  const probe = paidOfficialBalanceProbe('synthetic', (async url => {
    calls++; assert.equal(new URL(String(url)).pathname, '/api/v1/leagues')
    return new Response(JSON.stringify({ success: true, credits_remaining: 39393, data: { ignored: true } }))
  }) as typeof fetch)
  const receipt = await officialBalance({ authorizedPaidProbe: true, probe, record: async () => {} })
  assert.equal(calls, 1); assert.equal(receipt.credits, 39393)
})
test('insufficient fresh official budget blocks before collection', async () => {
  const f = fixture()
  const deps = bindings(async () => { throw Error('NO_COLLECTION') }, async () => {}, {
    ...f.gate, balance: async () => ({ credits: 1, official: true, observedAt: new Date().toISOString() }),
  })
  await assert.rejects(deps.preflight([], { completed: [], writes: [], requests: 0 }), /BALANCE_UNCONFIRMED/)
})
