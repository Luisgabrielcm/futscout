import { Client, type PoolClient } from 'pg'

type QueryClient = Pick<Client, 'query'>

export type IdentityDiagnosticCode =
  | 'VERIFIED' | 'CONFIG_RUNTIME_MISSING' | 'CONFIG_ADMIN_MISSING'
  | 'CONFIG_ADMIN_INVALID' | 'CONFIG_ADMIN_NOT_DEDICATED' | 'CONFIG_ADMIN_TLS'
  | 'CONNECT_RUNTIME_AUTH' | 'CONNECT_RUNTIME' | 'CONNECT_ADMIN_AUTH' | 'CONNECT_ADMIN'
  | 'TX_RUNTIME' | 'TX_ADMIN' | 'READ_ONLY_RUNTIME' | 'READ_ONLY_ADMIN'
  | 'SNAPSHOT_EXPORT' | 'SNAPSHOT_FORMAT' | 'SNAPSHOT_IMPORT'
  | 'DATABASE_NAME_MISMATCH' | 'SCHEMA_MISMATCH' | 'IDENTITY_QUERY'
  | 'CONTEXT_NODE_ENV' | 'CONTEXT_EDGE_RUNTIME' | 'CONTEXT_NOT_NODE'
  | 'CONTEXT_VERCEL_ENV' | 'STARTUP'

export type IdentityDiagnosticOutcome = {
  identity: 'VERIFIED' | 'INCONCLUSIVE'
  code: IdentityDiagnosticCode
}

export class IdentityDiagnosticFailure extends Error {
  constructor(readonly code: IdentityDiagnosticCode) { super(code) }
}

function codeFrom(error: unknown): IdentityDiagnosticCode {
  return error instanceof IdentityDiagnosticFailure ? error.code : 'STARTUP'
}

function connectionCode(error: unknown, side: 'RUNTIME' | 'ADMIN'): IdentityDiagnosticCode {
  const state = (error as { code?: unknown } | null)?.code
  return state === '28P01' || state === '28000' ? `CONNECT_${side}_AUTH` : `CONNECT_${side}`
}

async function queryOrFail<T extends Record<string, unknown>>(
  client: QueryClient, sql: string, code: IdentityDiagnosticCode,
) {
  try { return await client.query<T>(sql) }
  catch { throw new IdentityDiagnosticFailure(code) }
}

/** Importing a live snapshot proves both sessions reached the same PostgreSQL database. */
export async function compareDatabaseSessions(runtime: QueryClient, admin: QueryClient): Promise<IdentityDiagnosticOutcome> {
  let runtimeOpen = false
  let adminOpen = false
  try {
    await queryOrFail(runtime, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'TX_RUNTIME')
    runtimeOpen = true
    const runtimeMode = await queryOrFail<{ read_only: string }>(runtime,
      "SELECT current_setting('transaction_read_only') AS read_only", 'READ_ONLY_RUNTIME')
    if (runtimeMode.rows[0]?.read_only !== 'on') throw new IdentityDiagnosticFailure('READ_ONLY_RUNTIME')

    const exported = await queryOrFail<{ snapshot: string }>(runtime,
      'SELECT pg_export_snapshot() AS snapshot', 'SNAPSHOT_EXPORT')
    const snapshot = exported.rows[0]?.snapshot
    if (!snapshot || !/^[0-9A-Fa-f]+(?:-[0-9A-Fa-f]+)+$/.test(snapshot))
      throw new IdentityDiagnosticFailure('SNAPSHOT_FORMAT')

    await queryOrFail(admin, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'TX_ADMIN')
    adminOpen = true
    // PostgreSQL does not accept a bind parameter here. The strictly validated ID stays in memory.
    try {
      await queryOrFail(admin, `SET TRANSACTION SNAPSHOT '${snapshot}'`, 'SNAPSHOT_IMPORT')
    } catch (importError) {
      // The failed import aborts its transaction. A second READ ONLY transaction can
      // identify different database names, but cannot prove whether equal names
      // belong to the same instance or whether a pooler rejected the import.
      await admin.query('ROLLBACK').catch(() => undefined)
      adminOpen = false
      try {
        await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        adminOpen = true
        const fallbackMode = await admin.query<{ read_only: string }>(
          "SELECT current_setting('transaction_read_only') AS read_only")
        if (fallbackMode.rows[0]?.read_only === 'on') {
          const nameSql = 'SELECT current_database() AS database_name'
          const a = await runtime.query<{ database_name: string }>(nameSql)
          const b = await admin.query<{ database_name: string }>(nameSql)
          if (a.rows[0]?.database_name && b.rows[0]?.database_name &&
              a.rows[0].database_name !== b.rows[0].database_name)
            throw new IdentityDiagnosticFailure('DATABASE_NAME_MISMATCH')
        }
      } catch (error) {
        if (error instanceof IdentityDiagnosticFailure && error.code === 'DATABASE_NAME_MISMATCH') throw error
      }
      throw importError
    }
    const adminMode = await queryOrFail<{ read_only: string }>(admin,
      "SELECT current_setting('transaction_read_only') AS read_only", 'READ_ONLY_ADMIN')
    if (adminMode.rows[0]?.read_only !== 'on') throw new IdentityDiagnosticFailure('READ_ONLY_ADMIN')

    const sql = 'SELECT current_database() AS database_name, current_schema() AS schema_name'
    const runtimeIdentity = await queryOrFail<{ database_name: string; schema_name: string }>(runtime, sql, 'IDENTITY_QUERY')
    const adminIdentity = await queryOrFail<{ database_name: string; schema_name: string }>(admin, sql, 'IDENTITY_QUERY')
    const a = runtimeIdentity.rows[0]
    const b = adminIdentity.rows[0]
    if (!a?.database_name || !b?.database_name || a.database_name !== b.database_name)
      throw new IdentityDiagnosticFailure('DATABASE_NAME_MISMATCH')
    if (!a.schema_name || !b.schema_name || a.schema_name !== b.schema_name)
      throw new IdentityDiagnosticFailure('SCHEMA_MISMATCH')
    return { identity: 'VERIFIED', code: 'VERIFIED' }
  } finally {
    if (adminOpen) await admin.query('ROLLBACK').catch(() => undefined)
    if (runtimeOpen) await runtime.query('ROLLBACK').catch(() => undefined)
  }
}

type DiagnosticDependencies = {
  env?: NodeJS.ProcessEnv
  createRuntime?: (connectionString: string) => Pick<Client, 'connect' | 'end' | 'query'>
  connectAdmin?: () => Promise<PoolClient>
}

/** Opt-in startup probe. Only a fixed status and code may reach private logs. */
export async function runAdminDatabaseIdentityDiagnostic(
  { env = process.env, createRuntime = (connectionString) => new Client({ connectionString,
    connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000,
    idle_in_transaction_session_timeout: 5000 }),
  connectAdmin = async () => {
    const { adminPool } = await import('../services/adminAuth.server')
    return adminPool().connect()
  } }: DiagnosticDependencies = {},
): Promise<IdentityDiagnosticOutcome> {
  if (!env.DATABASE_URL) return { identity: 'INCONCLUSIVE', code: 'CONFIG_RUNTIME_MISSING' }
  if (!env.FUTSCOUT_ADMIN_DATABASE_URL) return { identity: 'INCONCLUSIVE', code: 'CONFIG_ADMIN_MISSING' }
  let runtime: ReturnType<NonNullable<DiagnosticDependencies['createRuntime']>> | undefined
  let admin: PoolClient | undefined
  try {
    try { runtime = createRuntime(env.DATABASE_URL) }
    catch { throw new IdentityDiagnosticFailure('CONNECT_RUNTIME') }
    try { await runtime.connect() }
    catch (error) { throw new IdentityDiagnosticFailure(connectionCode(error, 'RUNTIME')) }
    try { admin = await connectAdmin() }
    catch (error) {
      const message = (error as { message?: unknown } | null)?.message
      const configCodes: Record<string, IdentityDiagnosticCode> = {
        ADMIN_CONNECTION_INVALID: 'CONFIG_ADMIN_INVALID',
        ADMIN_CONNECTION_NOT_CONFIGURED: 'CONFIG_ADMIN_MISSING',
        ADMIN_CONNECTION_NOT_DEDICATED: 'CONFIG_ADMIN_NOT_DEDICATED',
        ADMIN_CONNECTION_TLS_REQUIRED: 'CONFIG_ADMIN_TLS',
      }
      throw new IdentityDiagnosticFailure(typeof message === 'string' && configCodes[message]
        ? configCodes[message] : connectionCode(error, 'ADMIN'))
    }
    return await compareDatabaseSessions(runtime, admin)
  } catch (error) {
    return { identity: 'INCONCLUSIVE', code: codeFrom(error) }
  } finally {
    admin?.release()
    await runtime?.end().catch(() => undefined)
  }
}
