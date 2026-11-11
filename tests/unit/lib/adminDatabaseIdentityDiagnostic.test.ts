import assert from 'node:assert/strict'
import test from 'node:test'
import { adminDatabaseIdentityContextFailure, adminDatabaseIdentityLog, isNodeJsProcess, registerAdminDatabaseIdentityDiagnostic, shouldRunAdminDatabaseIdentityDiagnostic } from '../../../instrumentation'
import { compareDatabaseSessions, connectionCode, runAdminDatabaseIdentityDiagnostic } from '../../../lib/adminDatabaseIdentityDiagnostic.server'

function pair(options: { importFails?: boolean; runtimeReadOnly?: boolean; differentSchema?: boolean;
  differentDatabase?: boolean; exportFails?: boolean; invalidSnapshot?: boolean } = {}) {
  const runtimeSql: string[] = []
  const adminSql: string[] = []
  const runtime = { async query(sql: string) {
    runtimeSql.push(sql)
    if (sql === 'SELECT pg_export_snapshot() AS snapshot') {
      if (options.exportFails) throw Error('private export error')
      return { rows: [{ snapshot: options.invalidSnapshot ? 'private malformed id' : '00000003-0000001B-1' }] }
    }
    if (sql.includes('transaction_read_only')) return { rows: [{ read_only: options.runtimeReadOnly === false ? 'off' : 'on' }] }
    if (sql.includes('current_database()')) return { rows: [{ database_name: 'db', schema_name: 'public' }] }
    return { rows: [] }
  } }
  const admin = { async query(sql: string) {
    adminSql.push(sql)
    if (sql.startsWith('SET TRANSACTION SNAPSHOT') && options.importFails) throw Error('import refused')
    if (sql.includes('transaction_read_only')) return { rows: [{ read_only: 'on' }] }
    if (sql.includes('current_database()')) return { rows: [{
      database_name: options.differentDatabase ? 'other' : 'db',
      schema_name: options.differentSchema ? 'other' : 'public',
    }] }
    return { rows: [] }
  } }
  return { runtime, admin, runtimeSql, adminSql }
}

test('probe requires flag and real Node.js Production context, not a NEXT_RUNTIME value or region', () => {
  const ready = { NODE_ENV: 'production' as const, NEXT_RUNTIME: 'nodejs', VERCEL_ENV: 'production',
    FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '1', DATABASE_URL: 'present', FUTSCOUT_ADMIN_DATABASE_URL: 'present' }
  assert.equal(shouldRunAdminDatabaseIdentityDiagnostic(ready), true)
  assert.equal(isNodeJsProcess(), true)
  assert.equal(shouldRunAdminDatabaseIdentityDiagnostic({ ...ready, VERCEL_REGION: '' }), true)
  assert.equal(shouldRunAdminDatabaseIdentityDiagnostic({ ...ready, NEXT_RUNTIME: undefined }), true)
  assert.equal(shouldRunAdminDatabaseIdentityDiagnostic({ ...ready, NEXT_RUNTIME: 'other' }), true)
  for (const key of Object.keys(ready).filter((key) => key !== 'NEXT_RUNTIME'))
    assert.equal(shouldRunAdminDatabaseIdentityDiagnostic({ ...ready, [key]: '' }), false)
  assert.equal(adminDatabaseIdentityContextFailure({ ...ready, NODE_ENV: '' as never }), 'CONTEXT_NODE_ENV')
  assert.equal(adminDatabaseIdentityContextFailure({ ...ready, NEXT_RUNTIME: 'edge' }), 'CONTEXT_EDGE_RUNTIME')
  assert.equal(adminDatabaseIdentityContextFailure(ready, false), 'CONTEXT_NOT_NODE')
  assert.equal(adminDatabaseIdentityContextFailure({ ...ready, VERCEL_ENV: '' }), 'CONTEXT_VERCEL_ENV')
  assert.equal(adminDatabaseIdentityContextFailure({ ...ready, DATABASE_URL: '' }), 'CONFIG_RUNTIME_MISSING')
  assert.equal(adminDatabaseIdentityContextFailure({ ...ready, FUTSCOUT_ADMIN_DATABASE_URL: '' }), 'CONFIG_ADMIN_MISSING')
})

test('local log capture recovers only VERIFIED or INCONCLUSIVE, including failed guards', async () => {
  const ready = { NODE_ENV: 'production' as const, NEXT_RUNTIME: 'nodejs', VERCEL_ENV: 'production',
    FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '1', DATABASE_URL: 'private-runtime-url', FUTSCOUT_ADMIN_DATABASE_URL: 'private-admin-url' }
  const lines: string[] = []
  await registerAdminDatabaseIdentityDiagnostic(ready, async () => ({ identity: 'VERIFIED', code: 'VERIFIED' }), (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, VERCEL_REGION: '' }, async () => ({ identity: 'VERIFIED', code: 'VERIFIED' }),
    (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, NEXT_RUNTIME: undefined },
    async () => ({ identity: 'VERIFIED', code: 'VERIFIED' }), (line) => lines.push(line))
  for (const [env, code] of [
    [{ ...ready, NODE_ENV: '' as never }, 'CONTEXT_NODE_ENV'],
    [{ ...ready, VERCEL_ENV: '' }, 'CONTEXT_VERCEL_ENV'],
    [{ ...ready, DATABASE_URL: '' }, 'CONFIG_RUNTIME_MISSING'],
    [{ ...ready, FUTSCOUT_ADMIN_DATABASE_URL: '' }, 'CONFIG_ADMIN_MISSING'],
  ] as const) {
    await registerAdminDatabaseIdentityDiagnostic(env, async () => {
      throw Error('must not run')
    }, (line) => lines.push(line))
    assert.equal(JSON.parse(lines.at(-1)!).code, code)
  }
  await registerAdminDatabaseIdentityDiagnostic(ready, async () => { throw Error('must not run') },
    (line) => lines.push(line), false)
  await registerAdminDatabaseIdentityDiagnostic(ready, async () => { throw Error('private driver error') },
    (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC: '' },
    async () => { throw Error('must not run') }, (line) => lines.push(line))
  await registerAdminDatabaseIdentityDiagnostic({ ...ready, NEXT_RUNTIME: 'edge' },
    async () => { throw Error('must not run') }, (line) => lines.push(line))
  assert.deepEqual(lines.map((line) => JSON.parse(line).code),
    ['VERIFIED', 'VERIFIED', 'VERIFIED', 'CONTEXT_NODE_ENV', 'CONTEXT_VERCEL_ENV',
      'CONFIG_RUNTIME_MISSING', 'CONFIG_ADMIN_MISSING', 'CONTEXT_NOT_NODE', 'STARTUP'])
  assert.ok(lines.every((line) => line === adminDatabaseIdentityLog(JSON.parse(line))))
  assert.ok(lines.every((line) => !/private-runtime-url|private-admin-url|driver error|snapshot/i.test(line)))
})

test('snapshot import proves same database and both sessions roll back', async () => {
  const { runtime, admin, runtimeSql, adminSql } = pair()
  const result = await compareDatabaseSessions(runtime as never, admin as never)
  assert.equal(result.identity, 'VERIFIED')
  assert.deepEqual(result, { identity: 'VERIFIED', code: 'VERIFIED' })
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
  assert.equal(adminSql.filter((sql) => sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 2)
  assert.ok(adminSql.includes('SELECT current_database() AS database_name'))
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

test('snapshot and identity failure codes never contain private errors or snapshot IDs', async () => {
  const scenarios = [
    [{ exportFails: true }, 'SNAPSHOT_EXPORT'],
    [{ invalidSnapshot: true }, 'SNAPSHOT_FORMAT'],
    [{ importFails: true }, 'SNAPSHOT_IMPORT'],
    [{ differentDatabase: true }, 'DATABASE_NAME_MISMATCH'],
    [{ differentSchema: true }, 'SCHEMA_MISMATCH'],
  ] as const
  for (const [options, expected] of scenarios) {
    const { runtime, admin } = pair(options)
    await assert.rejects(compareDatabaseSessions(runtime as never, admin as never),
      (error: { code: string }) => error.code === expected)
  }
})

test('configuration and connection stages produce only fixed internal codes', async () => {
  const env = { NODE_ENV: 'production' as const, DATABASE_URL: 'private-runtime-url', FUTSCOUT_ADMIN_DATABASE_URL: 'private-admin-url' }
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env: { NODE_ENV: 'production' } })).code, 'CONFIG_RUNTIME_MISSING')
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env: { NODE_ENV: 'production', DATABASE_URL: 'present' } })).code, 'CONFIG_ADMIN_MISSING')
  const runtimePool = (connectError?: unknown) => ({
    async connect() { if (connectError) throw connectError; return { ...pair().runtime, release() {} } },
    async end() {},
  })
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env, createRuntimePool: () => runtimePool({ code: '28P01' }) as never })).code,
    'CONNECT_RUNTIME_AUTH')
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env, createRuntimePool: () => runtimePool() as never,
    connectAdmin: async () => { throw Error('ADMIN_CONNECTION_TLS_REQUIRED') } })).code, 'CONFIG_ADMIN_TLS')
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env, createRuntimePool: () => runtimePool() as never,
    connectAdmin: async () => { throw Error('ADMIN_CONNECTION_INVALID') } })).code, 'CONFIG_ADMIN_INVALID')
  assert.equal((await runAdminDatabaseIdentityDiagnostic({ env, createRuntimePool: () => runtimePool() as never,
    connectAdmin: async () => { throw { code: '28P01', message: 'private password' } } })).code, 'CONNECT_ADMIN_AUTH')
})

test('connection failures use fixed categories without leaking driver messages', () => {
  const failures = [
    [{ code: 'EAI_AGAIN', message: 'private host' }, 'DNS'],
    [{ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'private certificate' }, 'TLS'],
    [{ message: 'self-signed certificate in private chain' }, 'TLS'],
    [{ message: 'Connection terminated due to connection timeout' }, 'TIMEOUT'],
    [{ message: 'private pgbouncer failure' }, 'POOLER'],
    [{ code: '08P01', message: 'unsupported startup parameter: statement_timeout' }, 'POOLER'],
    [{ code: 'ECONNRESET', message: 'private host' }, 'NETWORK'],
    [{ cause: { code: 'ECONNREFUSED', message: 'private host' } }, 'NETWORK'],
    [{ code: 'ERR_INVALID_URL', message: 'private URL' }, 'CONFIG'],
    [{ message: 'private unclassified error' }, 'UNKNOWN'],
  ] as const
  for (const [error, suffix] of failures) {
    for (const side of ['RUNTIME', 'ADMIN'] as const) {
      const code = connectionCode(error, side)
      assert.equal(code, `CONNECT_${side}_${suffix}`)
      assert.ok(!code.includes('private'))
    }
  }
})
