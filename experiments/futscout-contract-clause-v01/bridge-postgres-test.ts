// Opt-in disposable PG14 only. No dotenv, runtime client, DATABASE_URL or DIRECT_URL.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../app/generated/prisma/client'
import { createPlayerEconomicWriter, type EconomicWrite } from '../../services/playerEconomicPersistence'
import { type EconomicStateInput } from '../../lib/economicData/value'
import { ImmutableEvidenceCatalog, type EvidenceInput } from './evidence-catalog'
import { createRegistry } from './source-registry'
import { proposeContractWrite, runContractProposal, reconcileContractWrite, type ReadBack } from './economic-bridge'
import { durableNativeScenarios } from './durable-reconciliation-native'

function proposal(until = '2027-06-30') {
  const registry = createRegistry([{ id: 'synthetic', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'v1',
    permissionReference: 'synthetic/license', permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'CONFIRMED', commercialUse: 'CONFIRMED' } }])
  const input: EvidenceInput = { playerId: 'p1', clubId: 'c1', context: 'REAL_WORLD', season: '2026', evidenceId: 'e1',
    sourceId: 'synthetic', sourceReference: 'synthetic/fact', sourceUrl: null, sourceType: 'SYNTHETIC', sourcePolicyVersion: 'v1',
    publishedAt: null, observedAt: '2026-10-08T12:00:00.123Z', observationProofRef: 'synthetic/capture', providerEffectiveAt: null,
    eventType: 'CONTRACT', facts: { signedAt: { value: null, datePrecision: 'UNKNOWN' }, contractUntil: { value: until, datePrecision: 'DAY' },
      contractStatus: 'UNKNOWN', extensionOptions: null, releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null,
        activationConditions: null, sourceReference: null, explicitEvidence: null } }, periodQualifier: null,
    evidenceStatus: 'OFFICIAL_EXPLICIT', identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC', supersedesEvidenceId: null }
  const catalog = new ImmutableEvidenceCatalog(registry), record = catalog.append(input), catalogJson = catalog.exportJson()
  return proposeContractWrite({ registry, catalogJson, catalogHash: JSON.parse(catalogJson).artifactHash, evidenceId: 'e1',
    evidenceRef: catalog.evidenceRef('e1').evidenceRef, review: { playerId: 'p1', clubId: 'c1', context: 'REAL_WORLD', season: '2026',
      evidenceRecordHash: record.recordHash, providerPlayerId: 'synthetic-p1', identityConfidence: 'HIGH', identityProofRef: 'synthetic/identity',
      clubProofRef: 'synthetic/club', providerIdentityProofRef: 'synthetic/provider', observationProofRef: input.observationProofRef,
      observedAt: input.observedAt, temporalLink: 'CONSISTENT', reviewedAt: '2026-10-09T12:00:00Z' } })
}
const bin = 'C:/Program Files/PostgreSQL/14/bin'
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
for (const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
function command(name: string, args: string[], accepted = [0]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(path.join(bin, `${name}.exe`), args, { env, windowsHide: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', code => accepted.includes(code ?? -1) ? resolve() : reject(new Error(`${name}:${code}`)))
  })
}
async function main() {
  const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-contract-pg14-'))
  const resolved = path.resolve(cluster)
  assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
  assert.ok(path.basename(resolved).startsWith('fs-contract-pg14-'))
  const server = net.createServer()
  let db: Client | undefined, admin: Client | undefined, prisma: PrismaClient | undefined, started = false
  let checks = 0
  const check = async (name: string, run: () => Promise<void>) => { await run(); checks++; console.log(`PASS ${name}`) }
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as net.AddressInfo).port
    await new Promise<void>(resolve => server.close(() => resolve()))
    await command('initdb', ['-D',cluster,'-U','contract_test','-A','trust','--no-locale','-E','UTF8'])
    await command('pg_ctl', ['-D',cluster,'-l',path.join(cluster,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])
    started = true
    const config = { host: '127.0.0.1', port, user: 'contract_test', database: 'contract_bridge_test', ssl: false as const,
      connectionTimeoutMillis: 5000, max: 4 }
    admin = new Client({ ...config, database: 'postgres' }); await admin.connect()
    const proof = (await admin.query("SELECT current_setting('data_directory') dir, inet_server_port() port, current_user usr, current_setting('server_version') version")).rows[0]
    assert.equal(path.resolve(proof.dir).toLowerCase(), resolved.toLowerCase()); assert.equal(proof.port, port)
    assert.equal(proof.usr, 'contract_test'); assert.match(proof.version, /^14\./)
    console.log(`POSTGRES ${proof.version}`)
    await admin.query('CREATE DATABASE contract_bridge_test')
    db = new Client(config); await db.connect()
    assert.equal((await db.query('SELECT current_database() name')).rows[0].name, 'contract_bridge_test')
    await db.query('CREATE TABLE "Club" (id TEXT PRIMARY KEY); CREATE TABLE "Player" (id TEXT PRIMARY KEY, "clubId" TEXT REFERENCES "Club"(id), "marketValue" BIGINT)')
    await db.query(fs.readFileSync('prisma/migrations/20261006000000_player_economic_data_v1/migration.sql','utf8'))
    await db.query(`INSERT INTO "Club" VALUES ('c1'); INSERT INTO "Player" VALUES ('p1','c1',777),('p2','c1',888)`)
    // Test-only trigger observes actual server isolation, not merely the options passed to Prisma.
    await db.query(`CREATE FUNCTION test_isolation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'NOT_SERIALIZABLE'; END IF;
      IF NEW."requestId"='rollback_probe' THEN RAISE EXCEPTION 'FORCED_ROLLBACK'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER test_isolation BEFORE INSERT ON "PlayerEconomicObservation" FOR EACH ROW EXECUTE FUNCTION test_isolation()`)
    prisma = new PrismaClient({ adapter: new PrismaPg(config) })
    const client = prisma
    const rawWriter = createPlayerEconomicWriter(client, [{ provider: 'SYNTHETIC', context: 'REAL_WORLD', field: 'CONTRACT_UNTIL', evidenceRef: 'synthetic/license' }])
    let active = 0, writes = 0
    const writer = async (cmd: EconomicWrite) => {
      assert.equal(cmd.selectCurrent, false); active++; writes++
      try { return await rawWriter(cmd) } finally { active-- }
    }
    const readBack = async (requestId: string): Promise<ReadBack> => {
      if (active > 0) return { kind: 'INDETERMINATE' }
      const observation = await client.playerEconomicObservation.findUnique({ where: { requestId }, include: { state: true } })
      if (!observation) return { kind: 'ABSENT', transactionsSettled: true } // Only this isolated single test coordinator owns attempts.
      const s = observation.state
      const state: EconomicStateInput = { playerId: s.playerId, field: s.field as EconomicStateInput['field'], provider: s.provider,
        providerPlayerId: s.providerPlayerId, context: s.context as EconomicStateInput['context'], snapshotVersion: s.snapshotVersion,
        presence: s.presence as EconomicStateInput['presence'], amount: s.amount?.toFixed(2) ?? null, currency: s.currency,
        period: s.period as EconomicStateInput['period'], contractUntil: s.contractUntil?.toISOString().slice(0,10) ?? null,
        datePrecision: s.datePrecision as EconomicStateInput['datePrecision'], providerEffectiveAt: s.providerEffectiveAt?.toISOString() ?? null,
        confidence: s.confidence as EconomicStateInput['confidence'], matchState: s.matchState as EconomicStateInput['matchState'],
        status: s.status as EconomicStateInput['status'], metadata: s.metadata as EconomicStateInput['metadata'] }
      return { kind: 'FOUND', stateId: s.id, observationId: observation.id, requestId, observedAt: observation.observedAt.toISOString(), state, contentHash: s.contentHash }
    }
    const counts = async () => [await client.playerEconomicState.count(), await client.playerEconomicObservation.count(), await client.playerEconomicCurrent.count()]
    const p = proposal()
    await check('bridge creates state/observation under Serializable without current', async () => {
      assert.equal((await runContractProposal(p, { writer, readBack })).status, 'CONFIRMED'); assert.deepEqual(await counts(), [1,1,0])
    })
    await check('exact timestamps, content hash and DAY read-back', async () => {
      const rb = await readBack(p.command.requestId); assert.equal(reconcileContractWrite(p, rb).status, 'CONFIRMED')
      assert.equal(rb.kind, 'FOUND'); if (rb.kind === 'FOUND') {
        assert.equal(rb.observedAt, '2026-10-08T12:00:00.123Z'); assert.equal(rb.state.contractUntil, '2027-06-30')
        assert.equal(rb.state.providerEffectiveAt, null); assert.equal(rb.contentHash, p.contentHash)
      }
    })
    await check('request replay does not write or invent observation', async () => {
      const before = writes; assert.equal((await runContractProposal(p, { writer, readBack })).status, 'CONFIRMED')
      assert.equal(writes, before); assert.deepEqual(await counts(), [1,1,0])
    })
    await check('same content, separately supplied synthetic observation deduplicates state', async () => {
      await writer({ ...p.command, requestId: 'second_capture', observedAt: '2026-10-09T10:00:00.456Z' })
      assert.deepEqual(await counts(), [1,2,0])
    })
    await check('real uniqueness rejection rolls back new state; conflict not success', async () => {
      const changed = proposal('2028-06-30')
      await assert.rejects(writer({ ...changed.command, requestId: p.command.requestId }), (error: unknown) => (error as { code: string }).code === 'P2002')
      assert.deepEqual(await counts(), [1,2,0])
      const rb = await readBack(p.command.requestId)
      assert.equal(reconcileContractWrite(changed, rb).status, 'CONFLICT')
    })
    await check('forced observation failure rolls back both records', async () => {
      await assert.rejects(writer({ ...proposal('2029-06-30').command, requestId: 'rollback_probe' }))
      assert.deepEqual(await counts(), [1,2,0]); assert.equal((await readBack('rollback_probe')).kind, 'ABSENT')
    })
    await check('lost acknowledgement reconciles committed result, then replay skips', async () => {
      const changed = proposal('2030-06-30')
      assert.equal((await runContractProposal(changed, { readBack, writer: async cmd => { await writer(cmd); throw new Error('LOST_ACK') } })).status, 'CONFIRMED')
      const before = writes; await runContractProposal(changed, { readBack, writer }); assert.equal(writes, before)
      assert.deepEqual(await counts(), [2,3,0])
    })
    await check('unresolved attempt blocks resubmission until settlement', async () => {
      const before = writes; active++
      try { assert.equal((await runContractProposal(p, { readBack, writer })).status, 'INDETERMINATE') } finally { active-- }
      assert.equal(writes, before); assert.equal(reconcileContractWrite(p, await readBack(p.command.requestId)).status, 'CONFIRMED')
    })
    await check('concurrent same request commits exactly once, no retries', async () => {
      const cmd = { ...p.command, requestId: 'concurrent_capture' }, before = writes
      const outcomes = await Promise.allSettled([writer(cmd),writer(cmd)])
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1)
      assert.equal(outcomes.filter(o => o.status === 'rejected').length, 1); assert.equal(writes-before, 2)
      const rejected = outcomes.find(o => o.status === 'rejected') as PromiseRejectedResult
      assert.ok(['P2002','P2034'].includes(rejected.reason.code))
      assert.deepEqual(await counts(), [2,4,0])
      assert.equal((await readBack(cmd.requestId)).kind, 'FOUND')
    })
    await check('composite FK rejects observation for a different player', async () => {
      const row = await client.playerEconomicObservation.findUniqueOrThrow({ where: { requestId: p.command.requestId } })
      await assert.rejects(client.$transaction(tx => tx.playerEconomicObservation.create({ data: { stateId: row.stateId,
        playerId: 'p2', field: 'CONTRACT_UNTIL', observedAt: row.observedAt, requestId: 'bad_fk' } }), { isolationLevel: 'Serializable' }))
      assert.deepEqual(await counts(), [2,4,0])
    })
    await check('history immutable; no automatic currents; synthetic Player preserved', async () => {
      await assert.rejects(db!.query('UPDATE "PlayerEconomicState" SET "contractUntil"=DATE \'2040-01-01\''))
      await assert.rejects(db!.query('DELETE FROM "PlayerEconomicObservation"'))
      assert.deepEqual(await counts(), [2,4,0])
      assert.deepEqual((await db!.query('SELECT id,"clubId","marketValue"::text value FROM "Player" ORDER BY id')).rows,
        [{ id: 'p1', clubId: 'c1', value: '777' },{ id: 'p2', clubId: 'c1', value: '888' }])
    })
    await check('real blocked transaction remains indeterminate until server commit', async () => {
      const pending = proposal('2031-06-30')
      assert.match(pending.command.requestId, /^contract_[a-f0-9]{64}$/)
      await db!.query(`CREATE FUNCTION test_pending() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW."requestId"='${pending.command.requestId}' THEN PERFORM pg_advisory_xact_lock(781963); END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER test_pending BEFORE INSERT ON "PlayerEconomicObservation" FOR EACH ROW EXECUTE FUNCTION test_pending()`)
      await db!.query('SELECT pg_advisory_lock(781963)')
      const attempt = writer(pending.command).then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error }))
      try {
        let waiting = false
        for (let i = 0; i < 100; i++) { // Bounded local barrier observation, not a retry of the write.
          waiting = Number((await db!.query("SELECT count(*) n FROM pg_stat_activity WHERE datname='contract_bridge_test' AND wait_event='advisory'")).rows[0].n) > 0
          if (waiting) break
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        assert.equal(waiting, true)
        assert.equal((await client.playerEconomicObservation.findUnique({ where: { requestId: pending.command.requestId } })), null)
        const before = writes
        assert.equal((await runContractProposal(pending, { readBack, writer })).status, 'INDETERMINATE')
        assert.equal(writes, before)
      } finally { await db!.query('SELECT pg_advisory_unlock(781963)') }
      const settled = await attempt; assert.equal(settled.error, null)
      assert.equal(reconcileContractWrite(pending, await readBack(pending.command.requestId)).status, 'CONFIRMED')
      const before = writes; await runContractProposal(pending, { readBack, writer }); assert.equal(writes, before)
      assert.deepEqual(await counts(), [3,5,0])
    })
    console.log(`CONTRACT_BRIDGE_NATIVE_PASS scenarios=${checks} states=3 observations=5 currents=0`)
    await durableNativeScenarios({ root: path.join(cluster,'durable-attempts'), proposal, ports: { writer, readBack }, counts,
      injectAbort: async (requestId, terminate) => {
        assert.match(requestId, /^contract_[a-f0-9]{64}$/)
        await db!.query(`CREATE OR REPLACE FUNCTION test_durable_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW."requestId"='${requestId}' THEN ${terminate ? 'PERFORM pg_terminate_backend(pg_backend_pid());' : "RAISE EXCEPTION 'SYNTHETIC_ROLLBACK';"} END IF;
          RETURN NEW; END $$`)
        await db!.query('DROP TRIGGER IF EXISTS test_durable_abort ON "PlayerEconomicObservation"')
        await db!.query('CREATE TRIGGER test_durable_abort BEFORE INSERT ON "PlayerEconomicObservation" FOR EACH ROW EXECUTE FUNCTION test_durable_abort()')
      } })
  } finally {
    try { await prisma?.$disconnect() } finally {
      try { await db?.end(); await admin?.end() } finally {
        if (started || fs.existsSync(path.join(cluster,'postmaster.pid'))) await command('pg_ctl', ['-D',cluster,'-m','immediate','-w','stop'])
        if (fs.existsSync(path.join(cluster,'PG_VERSION'))) await command('pg_ctl', ['-D',cluster,'status'], [3])
        assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
        assert.ok(path.basename(resolved).startsWith('fs-contract-pg14-'))
        fs.rmSync(resolved, { recursive: true, force: true }); assert.equal(fs.existsSync(resolved), false)
        console.log('POSTGRES_STOPPED_AND_TEMP_CLUSTER_REMOVED')
      }
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'NATIVE_TEST_FAILED'); process.exitCode = 1 })
