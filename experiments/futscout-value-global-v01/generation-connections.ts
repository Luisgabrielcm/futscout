import assert from 'node:assert/strict'
import { Client, Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../app/generated/prisma/client'
import { createPlayerEconomicWriter, type EconomicAuthorization, type EconomicWrite } from '../../services/playerEconomicPersistence'
import { generationClient } from './generation-binding'

type Options = Readonly<{
  runtimeUrl: string
  writerUrl: string
  administrationUrl: string
  generation: string
  token: number
  grants: readonly EconomicAuthorization[]
}>

function identity(url: string) {
  const parsed = new URL(url)
  assert(['postgres:', 'postgresql:'].includes(parsed.protocol), 'POSTGRES_URL_REQUIRED')
  assert(parsed.username && parsed.hostname && parsed.pathname.length > 1, 'POSTGRES_URL_INCOMPLETE')
  return { user: decodeURIComponent(parsed.username), database: decodeURIComponent(parsed.pathname.slice(1)) }
}

/** Candidate-only staging binding. The legacy executor is not generation-aware. */
export function generationConnections(options: Options) {
  const runtime = identity(options.runtimeUrl)
  const writer = identity(options.writerUrl)
  const administration = identity(options.administrationUrl)
  assert.equal(writer.user, 'futscout_economic_writer', 'DEDICATED_WRITER_ROLE_REQUIRED')
  assert.notEqual(runtime.user, writer.user, 'RUNTIME_WRITER_ROLE_COLLISION')
  assert.notEqual(runtime.user, administration.user, 'RUNTIME_ADMIN_ROLE_COLLISION')
  assert.notEqual(writer.user, administration.user, 'WRITER_ADMIN_ROLE_COLLISION')
  assert.equal(runtime.database, writer.database, 'DATABASE_MISMATCH')
  assert.equal(writer.database, administration.database, 'DATABASE_MISMATCH')

  const pool = new Pool({ connectionString: options.writerUrl, max: 1, connectionTimeoutMillis: 10000, query_timeout: 20000,
    options: '-c timezone=UTC' })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) })
  const persist = createPlayerEconomicWriter(generationClient(prisma, options.generation, options.token, undefined, 'candidate'), options.grants)
  let verified = false
  let closed = false

  async function inspect(connectionString: string) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 20000 })
    let begun = false
    try {
      await client.connect()
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      begun = true
      const { rows: [access] } = await client.query(`SELECT current_database() database, current_user role, session_user session_role,
        r.rolsuper superuser, r.rolcreatedb create_database, r.rolcreaterole create_role, r.rolbypassrls bypass_rls,
        has_schema_privilege(current_user,'public','CREATE') schema_create,
        has_table_privilege(current_user,'public."PlayerEconomicCurrent"','SELECT') current_select,
        has_table_privilege(current_user,'public."PlayerEconomicCurrent"','INSERT') current_insert,
        has_table_privilege(current_user,'public."PlayerEconomicCurrent"','UPDATE') current_update,
        has_table_privilege(current_user,'public."PlayerEconomicCurrent"','DELETE') current_delete,
        has_table_privilege(current_user,'public."PlayerEconomicCurrent"','TRUNCATE') current_truncate,
        has_table_privilege(current_user,'public."PlayerEconomicState"','INSERT') state_insert,
        has_table_privilege(current_user,'public."PlayerEconomicObservation"','INSERT') observation_insert,
        has_table_privilege(current_user,'public."EconomicObservationGeneration"','INSERT') membership_insert,
        has_table_privilege(current_user,'public."EconomicCollectionFence"','UPDATE') fence_update
        FROM pg_roles r WHERE r.rolname=current_user`)
      assert(access, 'ROLE_INSPECTION_FAILED')
      await client.query('SELECT 1 FROM public."PlayerEconomicCurrent" WHERE false')
      await client.query('ROLLBACK')
      begun = false
      return access as Record<string, string | boolean>
    } finally {
      if (begun) await client.query('ROLLBACK').catch(() => undefined)
      await client.end().catch(() => undefined)
    }
  }

  async function verify() {
    assert(!closed, 'CONNECTIONS_CLOSED')
    const publicAccess = await inspect(options.runtimeUrl)
    const writerAccess = await inspect(options.writerUrl)
    assert.equal(publicAccess.database, runtime.database, 'RUNTIME_DATABASE_MISMATCH')
    assert.equal(writerAccess.database, writer.database, 'WRITER_DATABASE_MISMATCH')
    assert.equal(publicAccess.role, runtime.user, 'RUNTIME_ROLE_MISMATCH')
    assert.equal(publicAccess.session_role, runtime.user, 'RUNTIME_SESSION_ROLE_MISMATCH')
    assert.equal(writerAccess.role, writer.user, 'WRITER_ROLE_MISMATCH')
    assert.equal(writerAccess.session_role, writer.user, 'WRITER_SESSION_ROLE_MISMATCH')
    for (const access of [publicAccess, writerAccess]) {
      for (const key of ['superuser', 'create_database', 'create_role', 'bypass_rls', 'schema_create', 'current_delete', 'current_truncate', 'fence_update'])
        assert.equal(access[key], false, `FORBIDDEN_PRIVILEGE_${key}`)
      assert.equal(access.current_select, true, 'CURRENT_READ_REQUIRED')
    }
    for (const key of ['current_insert', 'current_update', 'state_insert', 'observation_insert', 'membership_insert']) {
      assert.equal(publicAccess[key], false, `PUBLIC_ECONOMIC_WRITE_FORBIDDEN_${key}`)
      assert.equal(writerAccess[key], true, `WRITER_PRIVILEGE_REQUIRED_${key}`)
    }
    verified = true
    return { runtimeRole: publicAccess.role as string, writerRole: writerAccess.role as string, readOnlyRollback: true }
  }

  return {
    verify,
    write: (plan: EconomicWrite) => {
      assert(verified && !closed, 'DEDICATED_CONNECTION_NOT_VERIFIED')
      assert.equal(plan.selectCurrent, false, 'GENERATION_STAGING_MUST_NOT_PUBLISH_CURRENT')
      return persist(plan)
    },
    close: async () => {
      if (closed) return
      closed = true
      try { await prisma.$disconnect() } finally { await pool.end() }
    },
  }
}
