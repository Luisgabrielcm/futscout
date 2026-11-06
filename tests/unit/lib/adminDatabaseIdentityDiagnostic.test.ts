import assert from 'node:assert/strict'
import test from 'node:test'
import { adminDatabaseIdentityLog, registerAdminDatabaseIdentityDiagnostic, shouldRunAdminDatabaseIdentityDiagnostic } from '../../../instrumentation'
import { compareDatabaseSessions } from '../../../lib/adminDatabaseIdentityDiagnostic.server'

function pair(options: { importFails?: boolean; runtimeReadOnly?: boolean; differentSchema?: boolean } = {}) {
  const runtimeSql: string[] = []
  const adminSql: string[] = []
  const runtime = { async query(sql: string) {
    runtimeSql.push(sql)
    if (sql === 'SELECT pg_export_snapshot() AS snapshot') return { rows: [{ snapshot: '00000003-0000001B-1' }] }
    if (sql.includes('transaction_read_only')) return { rows: [{ read_only: options.runtimeReadOnly === false ? 'off' : 'on' }] }
    if (sql.includes('current_database()')) return { rows: [{ database_name: 'db', schema_name: 'public' }] }
    return { rows: [] }
  } }
  const admin = { async query(sql: string) {
    adminSql.push(sql)
    if (sql.startsWith('SET TRANSACTION SNAPSHOT') && options.importFails) throw Error('import refused')
    if (sql.includes('transaction_read_only')) return { rows: [{ read_only: 'on' }] }
    if (sql.includes('current_database()')) return { rows: [{ database_name: 'db', schema_name: options.differentSchema ? 'other' : 'public' }] }
    return { rows: [] }
  } }
  return { runtime, admin, runtimeSql, adminSql }
}

test('probe is disabled unless explicitly enabled in Production Node runtime with both connections', () => {
  const ready = { NODE_ENV: 'production' as const, NEXT_RUNTIME: 'nodejs', VERCEL_ENV: 'production', VERCEL_REGION: 'gru1',
    FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '1', DATABASE_URL: 'present', FUTSCOUT_ADMIN_DATABASE_URL: 'present' }
  assert.equal(shouldRunAdminDatabaseIdentityDiagnostic(ready), true)
  for (const key of Object.keys(ready)) assert.equal(shouldRunAdminDatabaseIdentityDiagnostic({ ...ready, [key]: '' }), false)
})

test('local log capture recovers only VERIFIED or INCONCLUSIVE, including failed guards', async () => {
  const ready = { NODE_ENV: 'production' as const, NEXT_RUNTIME: 'nodejs', VERCEL_ENV: 'production', VERCEL_REGION: 'gru1',
    FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '1', DATABASE_URL: 'private-runtime-url', FUTSCOUT_ADMIN_DATABASE_URL: 'private-admin-url' }
  const lines: string[] = []
  await registerAdminDatabaseIdentityDiagnostic(ready, async () => 'VERIFIED', (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, VERCEL_REGION: '' }, async () => {
    throw Error('must not run')
  }, (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic(ready, async () => { throw Error('private driver error') },
    (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '' },
    async () => { throw Error('must not run') }, (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, NEXT_RUNTIME: 'edge' },
    async () => { throw Error('must not run') }, (line) => lines.push(line))
  assert.deepEqual(lines.map((line) => JSON.parse(line).identity), ['VERIFIED', 'INCONCLUSIVE', 'INCONCLUSIVE'])
  assert.ok(lines.every((line) => line === adminDatabaseIdentityLog(JSON.parse(line).identity)))
  assert.ok(lines.every((line) => !/private-runtime-url|private-admin-url|driver error|snapshot/i.test(line)))
})

test('snapshot import proves same database and both sessions roll back', async () => {
  const { runtime, admin, runtimeSql, adminSql } = pair()
  const result = await compareDatabaseSessions(runtime as never, admin as never)
  assert.equal(result.identity, 'VERIFIED')
  assert.deepEqual(result, { identity: 'VERIFIED' })
  assert.ok(adminSql.includes("SET TRANSACTION SNAPSHOT '00000003-0000001B-1'"))
  assert.ok(!JSON.stringify(result).includes('00000003-0000001B-1'))
  assert.ok(![...runtimeSql, ...adminSql].some((sql) => sql.includes('_prisma_migrations')))
  assert.equal(runtimeSql.at(-1), 'ROLLBACK')
  assert.equal(adminSql.at(-1), 'ROLLBACK')
  assert.ok([...runtimeSql, ...adminSql].every((sql) => !/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)))
})

test('refused import fails closed and rolls back', async () => {
  const { runtime, admin, runtimeSql, adminSql } = pair({ importFails: true })
  await assert.rejects(compareDatabaseSessions(runtime as never, admin as never))
  assert.ok(!adminSql.some((sql) => sql.includes('current_database()')))
  assert.equal(runtimeSql.at(-1), 'ROLLBACK')
  assert.equal(adminSql.at(-1), 'ROLLBACK')
})

test('read-only or schema mismatch fails closed', async () => {
  for (const options of [{ runtimeReadOnly: false }, { differentSchema: true }]) {
    const { runtime, admin, adminSql } = pair(options)
    await assert.rejects(compareDatabaseSessions(runtime as never, admin as never))
    assert.ok(!adminSql.some((sql) => sql.includes('_prisma_migrations')))
  }
})
