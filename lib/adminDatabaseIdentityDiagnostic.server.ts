import { Pool, type PoolClient } from 'pg'

type QueryClient = Pick<PoolClient, 'query'>

type ConnectionSide = 'RUNTIME' | 'ADMIN'
type ConnectionReason = 'AUTH' | 'DNS' | 'TLS' | 'TIMEOUT' | 'POOLER' | 'NETWORK' | 'CONFIG' | 'UNKNOWN'

export type IdentityDiagnosticCode =
  | 'VERIFIED' | 'CONFIG_RUNTIME_MISSING' | 'CONFIG_ADMIN_MISSING'
  | 'CONFIG_ADMIN_INVALID' | 'CONFIG_ADMIN_NOT_DEDICATED' | 'CONFIG_ADMIN_TLS'
  | `CONNECT_${ConnectionSide}_${ConnectionReason}`
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

export function connectionCode(error: unknown, side: ConnectionSide): IdentityDiagnosticCode {
  const fields = error as { code?: unknown; message?: unknown } | null
  const code = typeof fields?.code === 'string' ? fields.code.toUpperCase() : ''
  // Only fixed categories leave this function. Driver messages and URLs never reach logs.
  const message = typeof fields?.message === 'string' ? fields.message : ''
  if (['28P01', '28000'].includes(code)) return `CONNECT_${side}_AUTH`
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code) || /getaddrinfo|name resolution/i.test(message))
    return `CONNECT_${side}_DNS`
  if (['ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED'].includes(code) ||
    /(?:SSL|TLS|certificate).*(?:verify|expired|self.signed|invalid)/i.test(message))
    return `CONNECT_${side}_TLS`
  if (['ETIMEDOUT', 'ETIMEOUT'].includes(code) || /connection timeout|timed out/i.test(message))
    return `CONNECT_${side}_TIMEOUT`
  if (/pooler|pgbouncer|transaction pooling/i.test(message)) return `CONNECT_${side}_POOLER`
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', '08001', '08006'].includes(code))
    return `CONNECT_${side}_NETWORK`
  if (['ERR_INVALID_URL', 'ERR_INVALID_PROTOCOL'].includes(code)) return `CONNECT_${side}_CONFIG`
  return `CONNECT_${side}_UNKNOWN`
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
  createRuntimePool?: (connectionString: string) => Pick<Pool, 'connect' | 'end'>
  connectAdmin?: () => Promise<PoolClient>
}

/** Opt-in startup probe. Only a fixed status and code may reach private logs. */
export async function runAdminDatabaseIdentityDiagnostic(
  { env = process.env, createRuntimePool = (connectionString) => new Pool({ connectionString,
    max: 1, connectionTimeoutMillis: 10_000, query_timeout: 5000 }),
  connectAdmin = async () => {
    const { adminPool } = await import('../services/adminAuth.server')
    return adminPool().connect()
  } }: DiagnosticDependencies = {},
): Promise<IdentityDiagnosticOutcome> {
  if (!env.DATABASE_URL) return { identity: 'INCONCLUSIVE', code: 'CONFIG_RUNTIME_MISSING' }
  if (!env.FUTSCOUT_ADMIN_DATABASE_URL) return { identity: 'INCONCLUSIVE', code: 'CONFIG_ADMIN_MISSING' }
  let runtimePool: ReturnType<NonNullable<DiagnosticDependencies['createRuntimePool']>> | undefined
  let runtime: PoolClient | undefined
  let admin: PoolClient | undefined
  try {
    try { runtimePool = createRuntimePool(env.DATABASE_URL) }
    catch (error) { throw new IdentityDiagnosticFailure(connectionCode(error, 'RUNTIME')) }
    try { runtime = await runtimePool.connect() }
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
    runtime?.release()
    await runtimePool?.end().catch(() => undefined)
  }
}
