// Synthetic, disposable PostgreSQL only. Never load .env or Production URLs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { Client } from 'pg'
import { generationConnections } from './generation-connections'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'

assert(process.argv.includes('--disposable-authorized'), 'DISPOSABLE_TEST_FLAG_REQUIRED')
const bin = 'C:/Program Files/PostgreSQL/14/bin'
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-generation-connections-'))
const safe = () => {
  assert.equal(path.dirname(path.resolve(cluster)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
  assert(path.basename(cluster).startsWith('fs-generation-connections-'))
}
safe()
const command = (name: string, args: string[], accepted = [0]) => new Promise<void>((resolve, reject) => {
  const child = spawn(path.join(bin, `${name}.exe`), args, { windowsHide: true, stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', code => accepted.includes(code ?? -1) ? resolve() : reject(Error(`${name}:${code}`)))
})
let started = false
let admin: Client | undefined
let binding: ReturnType<typeof generationConnections> | undefined
let checks = 0
const check = async (name: string, run: () => Promise<void>) => { await run(); checks++; console.log(`PASS ${name}`) }

try {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  await command('initdb', ['-D', cluster, '-U', 'proof_admin', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
  await command('pg_ctl', ['-D', cluster, '-l', path.join(cluster, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
  started = true
  const url = (role: string) => `postgresql://${role}:synthetic-secret@127.0.0.1:${port}/postgres`
  admin = new Client({ connectionString: url('proof_admin'), ssl: false })
  await admin.connect()
  assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^14\./)
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
  await admin.query('CREATE TABLE "Player" (id text PRIMARY KEY); INSERT INTO "Player" VALUES (\'p\')')
  await admin.query(fs.readFileSync('prisma/migrations/20261006000000_player_economic_data_v1/migration.sql', 'utf8'))
  await admin.query(fs.readFileSync('experiments/futscout-value-global-v01/generation-writer-role.candidate.sql', 'utf8'))
  await admin.query(fs.readFileSync('experiments/futscout-value-global-v01/generation-install.candidate.sql', 'utf8'))
  await admin.query('ALTER ROLE futscout_economic_writer LOGIN') // disposable trust only
  await admin.query('CREATE ROLE proof_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS')
  await admin.query('GRANT USAGE ON SCHEMA public TO proof_runtime')
  await admin.query('GRANT SELECT ON "PlayerEconomicCurrent","PlayerEconomicObservation","PlayerEconomicState" TO proof_runtime')
  await admin.query(`INSERT INTO "EconomicCollectionGeneration"(id,field) VALUES ('g1','MARKET_VALUE')`)
  await admin.query(`INSERT INTO "EconomicCollectionFence"(field,generation,token,enabled) VALUES ('MARKET_VALUE','g1',1,true)`)
  const options = { runtimeUrl: url('proof_runtime'), writerUrl: url('futscout_economic_writer'),
    administrationUrl: url('proof_admin'), generation: 'g1', token: 1,
    grants: [{ provider: 'SYNTHETIC', context: 'REAL_WORLD' as const, field: 'MARKET_VALUE' as const, evidenceRef: 'synthetic/test' }] }
  await check('credentials and roles remain separate', async () => {
    assert.throws(() => generationConnections({ ...options, writerUrl: options.administrationUrl }), /DEDICATED_WRITER_ROLE_REQUIRED/)
    assert.throws(() => generationConnections({ ...options, runtimeUrl: options.administrationUrl }), /RUNTIME_ADMIN_ROLE_COLLISION/)
  })
  binding = generationConnections(options)
  const plan = (id: string, selectCurrent: boolean): EconomicWrite => ({ requestId: id, observedAt: '2026-01-01T00:00:00.123Z',
    selectCurrent, expectedRevision: null, selectionReason: 'SYNTHETIC', policyVersion: 'v1', state: {
      playerId: 'p', field: 'MARKET_VALUE', provider: 'SYNTHETIC', providerPlayerId: 'p', context: 'REAL_WORLD', snapshotVersion: 'v1',
      presence: 'VALUE', amount: '100.00', currency: 'EUR', period: null, contractUntil: null, datePrecision: null,
      providerEffectiveAt: null, confidence: 'HIGH', matchState: 'MATCHED', status: 'VALID', metadata: { source: 'synthetic/test' },
    } })
  await check('write is blocked until both connections are verified', async () => {
    assert.throws(() => binding!.write(plan('early', false)), /DEDICATED_CONNECTION_NOT_VERIFIED/)
  })
  await check('public read and restricted writer effective privileges', async () => {
    assert.deepEqual(await binding!.verify(), { runtimeRole: 'proof_runtime', writerRole: 'futscout_economic_writer', readOnlyRollback: true })
  })
  await check('staging binding refuses automatic Current publication', async () => {
    assert.throws(() => binding!.write(plan('must-not-publish', true)), /GENERATION_STAGING_MUST_NOT_PUBLISH_CURRENT/)
    assert.equal((await admin!.query('SELECT count(*)::int n FROM "PlayerEconomicObservation"')).rows[0].n, 0)
  })
  await check('authorized staging write preserves Current', async () => {
    await binding!.write(plan('stage', false))
    assert.equal((await admin!.query('SELECT count(*)::int n FROM "PlayerEconomicObservation"')).rows[0].n, 1)
    assert.equal((await admin!.query('SELECT count(*)::int n FROM "EconomicObservationGeneration"')).rows[0].n, 1)
    assert.equal((await admin!.query('SELECT count(*)::int n FROM "PlayerEconomicCurrent"')).rows[0].n, 0)
  })
  await check('public role cannot write or manage policy', async () => {
    const reader = new Client({ connectionString: options.runtimeUrl, ssl: false })
    await reader.connect()
    try {
      await assert.rejects(reader.query('INSERT INTO "PlayerEconomicCurrent" DEFAULT VALUES'), error => (error as { code: string }).code === '42501')
      await assert.rejects(reader.query('UPDATE "EconomicCollectionFence" SET enabled=false'), error => (error as { code: string }).code === '42501')
    } finally { await reader.end() }
  })
  await check('writer cannot disable guard or create tables', async () => {
    const writer = new Client({ connectionString: options.writerUrl, ssl: false })
    await writer.connect()
    try {
      await assert.rejects(writer.query('ALTER TABLE "PlayerEconomicCurrent" DISABLE TRIGGER ALL'), error => (error as { code: string }).code === '42501')
      await assert.rejects(writer.query('CREATE TABLE forbidden(id int)'), error => (error as { code: string }).code === '42501')
    } finally { await writer.end() }
  })
  await check('cleanup closes writer pool', async () => {
    await binding!.close()
    await binding!.close()
    assert.throws(() => binding!.write(plan('late', false)), /DEDICATED_CONNECTION_NOT_VERIFIED/)
  })
  console.log(JSON.stringify({ status: 'GENERATION_CONNECTIONS_DISPOSABLE_PASS', checks, productionTouched: false }))
} finally {
  try { await binding?.close(); await admin?.end() } finally {
    if (started || fs.existsSync(path.join(cluster, 'postmaster.pid'))) await command('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop'])
    await command('pg_ctl', ['-D', cluster, 'status'], [3])
    safe()
    fs.rmSync(cluster, { recursive: true, force: true })
    assert(!fs.existsSync(cluster))
    console.log('DISPOSABLE_STOPPED_AND_REMOVED')
  }
}
