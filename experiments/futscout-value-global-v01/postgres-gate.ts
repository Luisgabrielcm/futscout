import assert from 'node:assert/strict'
import { Client } from 'pg'
import { economicFingerprint } from '../../lib/economicData/value'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import type { ReadOnlyGate } from './integration'
import type { Player } from './runner'

export interface ReadClient {
  connect(): Promise<unknown>
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  end(): Promise<unknown>
}
const currentSQL = `SELECT s.id "stateId",s."playerId",s.field,s.provider,s.context,s.confidence,s."matchState",s.presence,s.amount::text,s.currency,s."contentHash",o.id "observationId",o."requestId",o."observedAt",c.revision
 FROM "PlayerEconomicCurrent" c JOIN "PlayerEconomicObservation" o ON o.id=c."observationId" AND o."playerId"=c."playerId" AND o.field=c.field
 JOIN "PlayerEconomicState" s ON s.id=o."stateId" AND s."playerId"=o."playerId" AND s.field=o.field ORDER BY s."playerId",s.field`
const canonical = (row: Record<string, unknown>): Record<string, unknown> => ({ ...row, observedAt: row.observedAt instanceof Date ? row.observedAt.toISOString() : row.observedAt })
export function postgresGate(config: {
  client: () => ReadClient; database: string; baseline: Record<string, unknown>[]
  consultedIds: () => Promise<Set<string>>; balance: ReadOnlyGate['balance']
  stagingGeneration?: string
}): ReadOnlyGate {
  if (config.stagingGeneration) assert(/^g[1-9][0-9]*$/.test(config.stagingGeneration), 'STAGING_GENERATION')
  async function ro<T>(fn: (client: ReadClient) => Promise<T>) {
    const db = config.client(); let begun = false
    try {
      await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); begun = true
      assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on')
      assert.equal((await db.query('SELECT current_database() db')).rows[0].db, config.database, 'WRONG_DATABASE')
      return await fn(db)
    } finally { try { if (begun) await db.query('ROLLBACK') } finally { await db.end() } }
  }
  let frozen: Player[] = []
  let permitted: EconomicWrite[] = []
  async function concurrent() {
    return ro(async db => Number((await db.query(`SELECT count(*)::int n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database() AND state='active' AND query ~* '(INSERT|UPDATE|DELETE).*PlayerEconomic'`)).rows[0].n) > 0)
  }
  async function reconcile(db: ReadClient, players: Player[], plans: EconomicWrite[]) {
    const counts: Record<string, number> = {}
    for (const table of ['Player', 'PlayerEconomicState', 'PlayerEconomicObservation', 'PlayerEconomicCurrent']) {
      counts[table] = Number((await db.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n)
    }
    assert.equal(counts.Player, 16228, 'PLAYER_COUNT')
    const rows = (await db.query(currentSQL)).rows.map(canonical)
    assert.equal(rows.length, counts.PlayerEconomicCurrent, 'BROKEN_CURRENT_JOIN')
    for (const prior of config.baseline) assert.deepEqual(rows.find(r => r.playerId === prior.playerId && r.field === prior.field), canonical(prior), 'PRIOR_CHANGED')
    if (config.stagingGeneration) {
      assert.equal(rows.length, config.baseline.length, 'STAGING_CURRENT_CHANGED')
      assert(plans.every(p => !p.selectCurrent), 'STAGING_PLAN_MUST_NOT_PUBLISH')
      const staged = (await db.query(`SELECT o.id "observationId",o."requestId",o."playerId",o.field,o."observedAt",
        s."contentHash",g.generation,c."observationId" "currentObservationId"
        FROM "EconomicObservationGeneration" g JOIN "PlayerEconomicObservation" o ON o.id=g.observation_id
        JOIN "PlayerEconomicState" s ON s.id=o."stateId"
        LEFT JOIN "PlayerEconomicCurrent" c ON c."playerId"=o."playerId" AND c.field=o.field
        WHERE g.generation=$1 ORDER BY o."requestId"`, [config.stagingGeneration])).rows.map(canonical)
      assert.equal(new Set(staged.map(r => r.requestId)).size, staged.length, 'STAGING_DUPLICATE_REQUEST')
      assert.equal(staged.length, plans.length, 'STAGING_OBSERVATION_COUNT')
      for (const row of staged) {
        const plan = plans.find(p => p.requestId === row.requestId)
        assert(plan, 'UNEXPECTED_STAGING_WRITE')
        assert.equal(row.playerId, plan.state.playerId)
        assert.equal(row.field, plan.state.field)
        assert.equal(row.contentHash, economicFingerprint(plan.state))
        assert.equal(row.observedAt, plan.observedAt)
        assert.equal(row.generation, config.stagingGeneration)
        assert.notEqual(row.currentObservationId, row.observationId, 'STAGING_PUBLISHED')
      }
      assert.equal(counts.PlayerEconomicObservation, config.baseline.length + staged.length, 'STAGING_OBSERVATION_DIVERGENCE')
      assert(counts.PlayerEconomicState >= config.baseline.length && counts.PlayerEconomicState <= counts.PlayerEconomicObservation, 'STAGING_STATE_DIVERGENCE')
    } else {
    const added = rows.filter(r => !config.baseline.some(b => b.playerId === r.playerId && b.field === r.field))
    for (const row of added) {
      const plan = plans.find(p => p.requestId === row.requestId)
      assert(plan, 'UNEXPECTED_WRITE')
      assert.equal(row.playerId, plan.state.playerId); assert.equal(row.field, 'MARKET_VALUE')
      assert.equal(row.contentHash, economicFingerprint(plan.state)); assert.equal(row.observedAt, plan.observedAt)
      assert.equal(row.revision, 1); assert.equal(row.provider, 'LIVE_FOOTBALL'); assert.equal(row.confidence, 'HIGH')
    }
    for (const table of ['PlayerEconomicState', 'PlayerEconomicObservation', 'PlayerEconomicCurrent']) {
      assert.equal(counts[table], config.baseline.length + added.length, 'ECONOMIC_COUNT_DIVERGENCE')
    }
    }
    const inputs = (await db.query(`SELECT p.id "playerId",p.name,p."externalId",p."dateOfBirth",p.nationality,p.position,p."officialOverall" ovr,p."clubId",cl."leagueId",cl.name club
      FROM "Player" p JOIN "Club" cl ON cl.id=p."clubId" WHERE p.id=ANY($1::text[])`, [players.map(p => p.playerId)])).rows
    assert.equal(inputs.length, players.length, 'MISSING_PLAYER_CONTEXT')
    for (const p of players) {
      const row = inputs.find(r => r.playerId === p.playerId)!
      for (const key of ['name', 'externalId', 'nationality', 'position', 'ovr', 'clubId', 'leagueId', 'club']) assert.equal(row[key], p[key], 'INPUT_CHANGED')
      assert.equal((row.dateOfBirth as Date).toISOString(), p.dateOfBirth, 'DOB_CHANGED')
    }
  }
  return {
    balance: config.balance, concurrent,
    preflight: async (players, progress) => {
      frozen = players; permitted = progress.writes
      const history = await config.consultedIds()
      for (const p of players) assert(!history.has(p.playerId), 'NEW_EXTERNAL_CONSULTATION')
      assert(!await concurrent(), 'CONCURRENT_WRITE')
      await ro(db => reconcile(db, players, permitted))
    },
    existing: async p => ro(async db => {
      const n = (await db.query(`SELECT count(*)::int n FROM "PlayerEconomicObservation" WHERE "playerId"=$1 AND field='MARKET_VALUE'`, [p.playerId])).rows[0].n
      return Number(n) > 0 || (await config.consultedIds()).has(p.playerId)
    }),
    readBack: async plan => ro(async db => {
      if (config.stagingGeneration) {
        if (plan.selectCurrent) return 'CONFLICT'
        const rows = (await db.query(`SELECT o.id "observationId",o."playerId",o.field,o."observedAt",s."contentHash",
          g.generation,c."observationId" "currentObservationId" FROM "PlayerEconomicObservation" o
          JOIN "PlayerEconomicState" s ON s.id=o."stateId"
          LEFT JOIN "EconomicObservationGeneration" g ON g.observation_id=o.id
          LEFT JOIN "PlayerEconomicCurrent" c ON c."playerId"=o."playerId" AND c.field=o.field
          WHERE o."requestId"=$1`, [plan.requestId])).rows.map(canonical)
        if (!rows.length) return 'NOT_STARTED'
        if (rows.length !== 1) return 'CONFLICT'
        const row = rows[0]
        if (row.playerId !== plan.state.playerId || row.field !== plan.state.field ||
          row.observedAt !== plan.observedAt || row.contentHash !== economicFingerprint(plan.state) ||
          row.generation !== config.stagingGeneration || row.currentObservationId === row.observationId) return 'CONFLICT'
        if (!permitted.some(p => p.requestId === plan.requestId)) permitted.push(plan)
        return 'CONFIRMED'
      }
      const rows = (await db.query(`SELECT o."playerId",o.field,o."observedAt",s."contentHash",c.revision,c."observationId",o.id FROM "PlayerEconomicObservation" o
        JOIN "PlayerEconomicState" s ON s.id=o."stateId" LEFT JOIN "PlayerEconomicCurrent" c ON c."playerId"=o."playerId" AND c.field=o.field WHERE o."requestId"=$1`, [plan.requestId])).rows
      if (rows.length === 0) return 'NOT_STARTED'
      if (rows.length !== 1) return 'CONFLICT'
      const r = canonical(rows[0])
      if (r.playerId !== plan.state.playerId || r.field !== plan.state.field || r.contentHash !== economicFingerprint(plan.state) ||
          r.observedAt !== plan.observedAt || r.revision !== 1 || r.observationId !== r.id) return 'CONFLICT'
      if (!permitted.some(p => p.requestId === plan.requestId)) permitted.push(plan)
      return 'CONFIRMED'
    }),
    checkpoint: async () => ro(db => reconcile(db, frozen, permitted)),
  }
}
/** Caller supplies DIRECT_URL explicitly; never logs it or loads ambient credentials. */
export const productionReadClient = (connectionString: string): ReadClient => new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 30000 })
