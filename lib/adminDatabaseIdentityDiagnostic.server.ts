import { Client, type PoolClient } from 'pg'

type QueryClient = Pick<Client, 'query'>

/** Importing a live snapshot proves both sessions reached the same PostgreSQL database. */
export async function compareDatabaseSessions(runtime: QueryClient, admin: QueryClient) {
  let runtimeOpen = false
  let adminOpen = false
  try {
    await runtime.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    runtimeOpen = true
    const runtimeMode = await runtime.query<{ read_only: string }>(
      "SELECT current_setting('transaction_read_only') AS read_only",
    )
    if (runtimeMode.rows[0]?.read_only !== 'on') throw Error('RUNTIME_NOT_READ_ONLY')

    const exported = await runtime.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot')
    const snapshot = exported.rows[0]?.snapshot
    if (!snapshot || !/^[0-9A-Fa-f]+(?:-[0-9A-Fa-f]+)+$/.test(snapshot)) throw Error('SNAPSHOT_INVALID')

    await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    adminOpen = true
    // SET TRANSACTION SNAPSHOT accepts a literal, not a bind parameter.
    await admin.query(`SET TRANSACTION SNAPSHOT '${snapshot}'`)
    const adminMode = await admin.query<{ read_only: string }>(
      "SELECT current_setting('transaction_read_only') AS read_only",
    )
    if (adminMode.rows[0]?.read_only !== 'on') throw Error('ADMIN_NOT_READ_ONLY')

    const runtimeIdentity = await runtime.query<{ database_name: string; schema_name: string }>(
      'SELECT current_database() AS database_name, current_schema() AS schema_name',
    )
    const adminIdentity = await admin.query<{ database_name: string; schema_name: string }>(
      'SELECT current_database() AS database_name, current_schema() AS schema_name',
    )
    const a = runtimeIdentity.rows[0]
    const b = adminIdentity.rows[0]
    if (!a?.database_name || !a.schema_name || a.database_name !== b?.database_name || a.schema_name !== b?.schema_name)
      throw Error('DATABASE_CONTEXT_MISMATCH')

    return { identity: 'VERIFIED' as const }
  } finally {
    if (adminOpen) await admin.query('ROLLBACK').catch(() => undefined)
    if (runtimeOpen) await runtime.query('ROLLBACK').catch(() => undefined)
  }
}

/** Opt-in startup probe. Only an identity status reaches private Vercel logs. */
export async function runAdminDatabaseIdentityDiagnostic() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return
  const runtime = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000,
    statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 })
  let admin: PoolClient | undefined
  try {
    await runtime.connect()
    const { adminPool } = await import('../services/adminAuth.server')
    admin = await adminPool().connect()
    const result = await compareDatabaseSessions(runtime, admin)
    console.info(JSON.stringify({ diagnostic: 'FUTSCOUT_ADMIN_DATABASE_IDENTITY', ...result }))
  } catch {
    console.error(JSON.stringify({ diagnostic: 'FUTSCOUT_ADMIN_DATABASE_IDENTITY', identity: 'INCONCLUSIVE' }))
  } finally {
    admin?.release()
    await runtime.end().catch(() => undefined)
  }
}
