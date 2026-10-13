import { Client } from 'pg'

const currentTable = 'public."PlayerEconomicCurrent"'

type ReadClient = Pick<Client, 'query'>

/** Uses only catalog/privilege reads inside a read-only transaction. */
export async function inspectRuntimeRole(client: ReadClient) {
  let begun = false
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    const table = await client.query<{ table_name: string | null }>('SELECT to_regclass($1)::text AS table_name', [currentTable])
    if (!table.rows[0]?.table_name) throw Error('CURRENT_TABLE_NOT_FOUND')
    const result = await client.query<{ current_user: string; session_user: string; can_select: boolean }>(
      'SELECT current_user, session_user, has_table_privilege(current_user,$1::regclass,\'SELECT\') AS can_select',
      [currentTable],
    )
    const row = result.rows[0]
    if (!row || typeof row.current_user !== 'string' || typeof row.session_user !== 'string' || typeof row.can_select !== 'boolean')
      throw Error('ROLE_RESULT_INVALID')
    await client.query('ROLLBACK')
    begun = false
    return { currentUser: row.current_user, sessionUser: row.session_user, canSelectCurrent: row.can_select }
  } finally {
    if (begun) await client.query('ROLLBACK').catch(() => undefined)
  }
}

/** Output is limited to role names/SELECT privilege or a stable error code; never logs URLs or driver errors. */
export async function runValueRuntimeRoleDiagnostic() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error(JSON.stringify({ diagnostic: 'FUTSCOUT_VALUE_RUNTIME_ROLE', status: 'DATABASE_URL_MISSING' }))
    return
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 })
  try {
    await client.connect()
    const result = await inspectRuntimeRole(client)
    console.info(JSON.stringify({ diagnostic: 'FUTSCOUT_VALUE_RUNTIME_ROLE', status: 'READ_ONLY_OK', ...result }))
  } catch {
    console.error(JSON.stringify({ diagnostic: 'FUTSCOUT_VALUE_RUNTIME_ROLE', status: 'READ_ONLY_FAILED' }))
  } finally {
    await client.end().catch(() => undefined)
  }
}
