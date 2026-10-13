import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldRunValueRuntimeRoleDiagnostic } from '../../instrumentation'
import { inspectRuntimeRole } from './runtime-role-diagnostic'

const ready = { NODE_ENV: 'production', NEXT_RUNTIME: 'nodejs', VERCEL_ENV: 'production', VERCEL_REGION: 'iad1', FUTSCOUT_VALUE_ROLE_DIAGNOSTIC: '1' } as NodeJS.ProcessEnv

test('only an explicit Production Node runtime opt-in can run', () => {
  assert.equal(shouldRunValueRuntimeRoleDiagnostic(ready), true)
  for (const [key, value] of [
    ['NEXT_RUNTIME', 'edge'], ['VERCEL_ENV', 'preview'], ['VERCEL_REGION', ''], ['FUTSCOUT_VALUE_ROLE_DIAGNOSTIC', '0'],
  ]) assert.equal(shouldRunValueRuntimeRoleDiagnostic({ ...ready, [key]: value }), false)
})

test('read-only role inspection checks the actual table, SELECT privilege and rolls back', async () => {
  const sql: string[] = []
  const client = { query: async (query: string, params?: unknown[]) => {
    sql.push(query)
    if (query.includes('to_regclass')) {
      assert.deepEqual(params, ['public."PlayerEconomicCurrent"'])
      return { rows: [{ table_name: '"PlayerEconomicCurrent"' }] }
    }
    if (query.includes('has_table_privilege')) {
      assert.deepEqual(params, ['public."PlayerEconomicCurrent"'])
      return { rows: [{ current_user: 'app_reader', session_user: 'app_reader', can_select: true }] }
    }
    return { rows: [] }
  } }
  assert.deepEqual(await inspectRuntimeRole(client as never), { currentUser: 'app_reader', sessionUser: 'app_reader', canSelectCurrent: true })
  assert.deepEqual(sql, [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    'SELECT to_regclass($1)::text AS table_name',
    'SELECT current_user, session_user, has_table_privilege(current_user,$1::regclass,\'SELECT\') AS can_select',
    'ROLLBACK',
  ])
})

test('missing Current table fails closed and still rolls back', async () => {
  const sql: string[] = []
  const client = { query: async (query: string) => {
    sql.push(query)
    return { rows: query.includes('to_regclass') ? [{ table_name: null }] : [] }
  } }
  await assert.rejects(inspectRuntimeRole(client as never), /CURRENT_TABLE_NOT_FOUND/)
  assert.equal(sql.at(-1), 'ROLLBACK')
  assert.equal(sql.some(query => query.includes('has_table_privilege')), false)
})

test('query failure remains private and still closes read-only transaction', async () => {
  const sql: string[] = []
  const client = { query: async (query: string) => {
    sql.push(query)
    if (query.includes('to_regclass')) throw Error('synthetic-secret-do-not-log')
    return { rows: [] }
  } }
  await assert.rejects(inspectRuntimeRole(client as never), /synthetic-secret-do-not-log/)
  assert.equal(sql.at(-1), 'ROLLBACK')
})
