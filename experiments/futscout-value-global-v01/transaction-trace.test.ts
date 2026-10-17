import test from 'node:test'
import assert from 'node:assert/strict'
import { p2028Subtype, newTransactionTrace, traceClient } from './transaction-trace'
import { capturedDiagnostic } from './diagnostics'
import type { PrismaClient } from '../../app/generated/prisma/client'
const requestId = 'lfglobal-0123456789abcdef-synthetic'
test('P2028 subtype allowlist never copies raw metadata or secrets', () => {
  for (const [reason, expected] of [['Unable to start a transaction in the given time.', 'START_TIMEOUT'],
    ['A query cannot be executed on an expired transaction.', 'EXPIRED'], ['Transaction already closed.', 'CLOSED'],
    ['SECRET postgres://private', 'UNKNOWN']]) assert.equal(p2028Subtype({ code: 'P2028', meta: { error: reason } }), expected)
  assert.equal(p2028Subtype({ code: 'P1001' }), null)
})
test('start failure has no invented execution, commit or rollback', async () => {
  const observer = newTransactionTrace(requestId, { total: 1, idle: 0, waiting: 1 })
  const error = Object.assign(new Error('SECRET'), { code: 'P2028', meta: { error: 'Unable to start a transaction in the given time.' } })
  const client = { $transaction: async () => { throw error } } as unknown as Pick<PrismaClient, '$transaction'>
  await assert.rejects(traceClient(client, observer).$transaction(async () => {}), e => e === error)
  assert.deepEqual(observer.trace.events.map(e => [e.phase, e.status]), [['BEGIN', 'REQUESTED'], ['BEGIN', 'FAILED']])
  assert.equal(capturedDiagnostic(error)?.transaction?.p2028Subtype, 'START_TIMEOUT')
  assert(!JSON.stringify(capturedDiagnostic(error)).includes('SECRET'))
})
