// Explicit opt-in integration. Fresh in-memory PostgreSQL WASM; no URLs or dotenv.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createFutscoutPotentialWriter, PotentialTransactionFailure, PotentialWriteConflict } from '../../services/futscoutPotentialWriter'
import type { PotentialTransactionStore, PotentialSqlTransaction, PotentialWritePlan } from '../../services/futscoutPotentialWriter'
import { FUTSCOUT_E_V1_REGISTRATION as model } from '../../lib/futscoutPotential/registeredEV1'
import { fingerprintFutscoutPotential } from '../../lib/futscoutPotential/fingerprint'

test('isolated PostgreSQL writer contract', async t => {
  const db = new PGlite()
  await db.waitReady
  try {
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0)
    console.log('Target: new PGlite(), memory only, empty public schema; no Production connection')
    for (const migration of readdirSync('prisma/migrations').sort()) {
      if (/^\d/.test(migration)) await db.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
    }
    const at = '2026-09-29T00:00:00.000Z'
    const input = { birthDate: '2000-01-01T00:00:00.000Z', referenceAt: at, overall: 80, primaryPosition: 'MC' }
    for (const id of ['one', 'rollback', 'unknown']) await db.query('INSERT INTO "Player" (id,slug,name,position,"officialOverall","updatedAt","dateOfBirth","externalId",potential) VALUES ($1,$1,$1,\'MC\',80,$2,$3,$1,92)', [id, at, input.birthDate])
    const originalPlayers = (await db.query('SELECT * FROM "Player" ORDER BY id')).rows
    let attempts = 0
    let fault: 'none' | 'insert-count' | 'readback' | 'current-readback' | 'cas' | 'lost-commit' = 'none'
    const store: PotentialTransactionStore = {
      async transaction(work, options) {
        assert.deepEqual(options, { isolation: 'Serializable', timeoutMs: 30000 }); attempts++
        let result
        try {
          result = await db.transaction(async raw => {
            await raw.exec("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL statement_timeout='30s'")
            const tx: PotentialSqlTransaction = {
              async query<Row extends Record<string, unknown>>(sql: string, values?: unknown[]) {
                const result = await raw.query<Row>(sql, values)
                if (fault === 'insert-count' && sql.startsWith('INSERT INTO "PlayerFutscoutPotentialEstimate"')) return { rows: [] }
                if (fault === 'readback' && sql.includes('Estimate" WHERE id=')) return { rows: [] }
                if (fault === 'current-readback' && sql.startsWith('SELECT "estimateId",version') && !sql.includes('FOR UPDATE')) return { rows: [] }
                if (fault === 'cas' && sql.startsWith('UPDATE "PlayerFutscoutPotentialCurrent"')) return { rows: [] }
                return { rows: result.rows }
              },
            }
            return work(tx)
          })
        } catch (error) {
          throw new PotentialTransactionFailure('ROLLED_BACK', error instanceof PotentialWriteConflict ? error.reason : 'DATABASE_ERROR')
        }
        if (fault === 'lost-commit') throw new PotentialTransactionFailure('COMMIT_INDETERMINATE', 'CONNECTION_LOST')
        return result
      },
    }
    const write = createFutscoutPotentialWriter(store, model)
    const plan: PotentialWritePlan = { playerId: 'one', expectedExternalId: 'one', expectedPlayerUpdatedAt: at, input, expectedCurrent: null, operationAt: at, decisionRef: 'disposable-test-only' }
    const snapshot = async () => {
      const result = []
      for (const table of ['Player', 'FutscoutPotentialModel', 'PlayerFutscoutPotentialEstimate', 'PlayerFutscoutPotentialCurrent']) result.push((await db.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows)
      return result
    }
    let current: PotentialWritePlan['expectedCurrent'] = null
    await t.test('first write, immutable estimate, legacy unchanged', async () => {
      const receipt = await write(plan)
      assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.transactionState, 'COMMIT_CONFIRMED')
      assert.deepEqual(receipt.counts, { modelsCreated: 1, estimatesCreated: 1, currentChanges: 1 })
      current = receipt.current!
      assert.equal((await db.query<{ potential: number }>('SELECT potential FROM "Player" WHERE id=\'one\'')).rows[0].potential, 92)
    })
    await t.test('fresh CAS replay is no-op, including timestamps', async () => {
      const before = await snapshot()
      assert.equal((await write({ ...plan, expectedCurrent: current, operationAt: '2026-09-30T00:00:00.000Z' })).status, 'NO_OP')
      assert.deepEqual(await snapshot(), before)
    })
    await t.test('stale CAS, identity, player state and missing player reject', async () => {
      const before = await snapshot()
      for (const change of [{ expectedCurrent: null }, { expectedExternalId: 'wrong' }, { expectedPlayerUpdatedAt: '2026-09-30T00:00:00.000Z' }, { playerId: 'missing' }]) {
        const receipt = await write({ ...plan, expectedCurrent: current, ...change })
        assert.equal(receipt.status, 'REJECTED'); assert.equal(receipt.transactionState, 'ROLLED_BACK')
      }
      assert.deepEqual(await snapshot(), before)
    })
    await t.test('new input creates history and advances current; old estimate reusable', async () => {
      const original = current!.estimateId
      const receipt = await write({ ...plan, expectedCurrent: current, input: { ...input, referenceAt: '2026-09-30T00:00:00.000Z' } })
      assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.current!.version, 2)
      assert.notEqual(receipt.estimateId, original)
      const reused = await write({ ...plan, expectedCurrent: receipt.current! })
      assert.equal(reused.estimateId, original); assert.equal(reused.counts!.estimatesCreated, 0); assert.equal(reused.current!.version, 3)
      current = reused.current!
    })
    await t.test('insert/read-back/CAS failure rolls back all effects', async () => {
      for (const mode of ['insert-count', 'readback', 'current-readback', 'cas'] as const) {
        const before = await snapshot(); fault = mode
        const receipt = await write({ ...plan, expectedCurrent: current, input: { ...input, referenceAt: '2026-10-01T00:00:00.000Z' } })
        fault = 'none'
        assert.equal(receipt.status, 'REJECTED'); assert.deepEqual(receipt.counts, { modelsCreated: 0, estimatesCreated: 0, currentChanges: 0 })
        assert.equal(receipt.reason, { 'insert-count': 'ESTIMATE_INSERT_MISMATCH', readback: 'ESTIMATE_READ_BACK_MISMATCH', 'current-readback': 'CURRENT_READ_BACK_MISMATCH', cas: 'CURRENT_CAS_CONFLICT' }[mode])
        assert.deepEqual(await snapshot(), before)
      }
    })
    await t.test('new model registration also rolls back; valid second version coexists', async () => {
      const second = createFutscoutPotentialWriter(store, { ...model, version: 'synthetic-test-v2', artifactHash: 'a'.repeat(64), calculate: () => ({ status: 'EXPERIMENTAL', modelVersion: 'synthetic-test-v2', potential: { raw: 81, rounded: 81, season: 1 } }) })
      const before = await snapshot(); fault = 'readback'
      assert.equal((await second({ ...plan, expectedCurrent: current })).status, 'REJECTED')
      fault = 'none'; assert.deepEqual(await snapshot(), before)
      const receipt = await second({ ...plan, expectedCurrent: current })
      assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.counts!.modelsCreated, 1)
      current = receipt.current!
      assert.equal((await db.query<{ n: number }>('SELECT count(*)::int n FROM "FutscoutPotentialModel"')).rows[0].n, 2)
    })
    await t.test('registered version cannot change artifact; historical mutation forbidden', async () => {
      const before = await snapshot()
      const wrong = createFutscoutPotentialWriter(store, { ...model, artifactHash: 'b'.repeat(64) })
      assert.equal((await wrong({ ...plan, expectedCurrent: current })).reason, 'MODEL_CONFLICT')
      await assert.rejects(db.query('UPDATE "PlayerFutscoutPotentialEstimate" SET "potentialRaw"=82 WHERE "playerId"=\'one\''))
      assert.deepEqual(await snapshot(), before)
    })
    await t.test('INVALID performs no transaction', async () => {
      const before = attempts
      assert.equal((await write({ ...plan, input: { ...input, overall: NaN } })).status, 'INVALID')
      assert.equal(attempts, before)
    })
    await t.test('existing INVALID estimate is never selected or overwritten', async () => {
      const hash = fingerprintFutscoutPotential(model, input).inputHash
      await db.query(`INSERT INTO "PlayerFutscoutPotentialEstimate" (id,"playerId","modelVersion","inputHash","inputSnapshot","referenceAt",provenance,status,"invalidReason","computedAt") VALUES ('invalid-existing','rollback',$1,$2,'{}',$3,'{"kind":"FUTSCOUT_ESTIMATE"}','INVALID','SYNTHETIC_TEST',$3)`, [model.version, hash, at])
      const before = await snapshot()
      const receipt = await write({ ...plan, playerId: 'rollback', expectedExternalId: 'rollback' })
      assert.equal(receipt.reason, 'ESTIMATE_CONTENT_CONFLICT'); assert.equal(receipt.status, 'REJECTED')
      assert.deepEqual(await snapshot(), before)
    })
    await t.test('lost commit confirmation stays indeterminate; never retries', async () => {
      const before = attempts; fault = 'lost-commit'
      const receipt = await write({ ...plan, playerId: 'unknown', expectedExternalId: 'unknown' })
      fault = 'none'
      assert.equal(receipt.status, 'COMMIT_INDETERMINATE'); assert.equal(receipt.counts, null); assert.equal(attempts, before + 1)
      const read = (await db.query<{ estimateId: string; version: number }>('SELECT "estimateId",version FROM "PlayerFutscoutPotentialCurrent" WHERE "playerId"=\'unknown\'')).rows[0]
      assert.equal((await write({ ...plan, playerId: 'unknown', expectedExternalId: 'unknown', expectedCurrent: read })).status, 'NO_OP')
    })
    assert.deepEqual((await db.query('SELECT potential FROM "Player" ORDER BY id')).rows, [{ potential: 92 }, { potential: 92 }, { potential: 92 }])
    assert.deepEqual((await db.query('SELECT * FROM "Player" ORDER BY id')).rows, originalPlayers)
  } finally { await db.close() }
})
