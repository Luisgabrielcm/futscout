// Opt-in Windows PostgreSQL 14 integration. Creates its OWN cluster/database.
// Never loads dotenv, accepts a URL, or connects to the user's existing service.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { nativePotentialStore } from './nativePotentialStore'
import type { NativeTestHooks, NativeTrace } from './nativePotentialStore'
import { createFutscoutPotentialWriter } from '../../services/futscoutPotentialWriter'
import type { PotentialWritePlan, PotentialWriteReceipt, RegisteredPotentialCalculator } from '../../services/futscoutPotentialWriter'
import { FUTSCOUT_E_V1_REGISTRATION as model } from '../../lib/futscoutPotential/registeredEV1'
import { fingerprintFutscoutPotential } from '../../lib/futscoutPotential/fingerprint'

const root = process.cwd()
const bin = 'C:/Program Files/PostgreSQL/14/bin'
const runId = randomUUID()
const out = path.resolve('audit/output/potential-native-20260929', runId)
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-pg14-'))
const database = 'futscout_potential_test_' + runId.replaceAll('-', '')
assert(/^futscout_potential_test_[a-f0-9]{32}$/.test(database))
fs.mkdirSync(out, { recursive: true })
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
for (const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')
const protectedFiles = ['lib/futscoutPotential/modelEV1.ts','lib/futscoutPotential/types.ts','lib/futscoutPotential/fingerprint.ts','services/futscoutPotentialWriter.ts','prisma/schema.prisma','prisma/migrations/20260929120000_futscout_potential_estimates/migration.sql']
const beforeHashes = Object.fromEntries(protectedFiles.map(p => [p, hash(fs.readFileSync(p))]))
const report: Record<string, unknown> = { runId, database, cluster, productionAccess: false, tests: [], traces: [], commands: [], createdAt: new Date().toISOString() }
const traces = report.traces as NativeTrace[]
async function command(exe: string, args: string[], extraEnv = {}, allowed = [0]) {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(exe, args, { env: { ...env, ...extraEnv }, cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill(), 60000)
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('exit', code => {
      clearTimeout(timer)
      // pg_ctl's Windows server can inherit pipe handles after pg_ctl exits.
      // Waiting for 'close' would wait for the server itself, not the launcher.
      setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); resolve({ code, stdout, stderr }) }, 100)
    })
  })
  ;(report.commands as unknown[]).push({ executable: path.basename(exe), args, ...result })
  assert(allowed.includes(result.code ?? -1), `${path.basename(exe)} failed: ${result.stderr || result.stdout}`)
  return result
}
async function freePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}
function barrier(count: number) {
  let arrived = 0, release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  return async () => { if (++arrived === count) release(); await wait }
}
async function main() {
  let started = false, admin: Client | undefined, observer: Client | undefined
  const open = new Set<Client>()
  const port = await freePort()
  let systemId: string | undefined
  async function connect(db = database) {
    assert(db === database || db === 'postgres')
    const client = new Client({ host: '127.0.0.1', port, database: db, user: 'futscout_test', password: '', ssl: false, connectionTimeoutMillis: 5000, application_name: 'futscout_disposable_' + runId })
    client.on('error', () => { /* caller classifies query failure; no secret logs */ })
    await client.connect(); open.add(client); client.once('end', () => open.delete(client))
    const proof = (await client.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,current_database() db,current_user usr,current_setting('server_version_num') version,current_setting('data_directory') directory,(SELECT system_identifier::text FROM pg_control_system()) system_id`)).rows[0]
    assert.equal(proof.host, '127.0.0.1'); assert.equal(proof.port, port); assert.equal(proof.db, db); assert.equal(proof.usr, 'futscout_test')
    assert(Number(proof.version) >= 140000 && Number(proof.version) < 150000)
    assert.equal(path.resolve(proof.directory).toLowerCase(), path.resolve(cluster).toLowerCase())
    if (systemId) assert.equal(proof.system_id, systemId); else systemId = proof.system_id
    report.targetProof = { ...proof, createdFreshCluster: true, dotenvLoaded: false, productionURLsUsed: false }
    return client
  }
  async function check(name: string, run: () => Promise<unknown>) {
    const result = await run()
    ;(report.tests as unknown[]).push({ name, status: 'PASS', result })
    console.log(JSON.stringify({ test: name, status: 'PASS' }))
  }
  try {
    for (const executable of ['postgres','psql','pg_config']) {
      const version = await command(path.join(bin, executable + '.exe'), ['--version'])
      assert.match(version.stdout, /14\./)
    }
    await command(path.join(bin,'initdb.exe'), ['-D',cluster,'-U','futscout_test','-A','trust','--encoding=UTF8','--no-locale'])
    await command(path.join(bin,'pg_ctl.exe'), ['-D',cluster,'-l',path.join(out,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])
    started = true
    admin = await connect('postgres')
    report.bootstrapProof = report.targetProof
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount, 0)
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`)
    observer = await connect()
    console.log(JSON.stringify({ isolatedTarget: report.targetProof }))
    assert.equal(Number((await observer.query("SELECT count(*) n FROM pg_tables WHERE schemaname='public'")).rows[0].n), 0)
    const config = path.join(out,'prisma.config.ts')
    fs.writeFileSync(config, `import {defineConfig} from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(path.join(root,'prisma/schema.prisma'))},datasource:{url:${JSON.stringify(`postgresql://futscout_test@127.0.0.1:${port}/${database}?sslmode=disable`)}}});\n`)
    const prisma = (args: string[]) => command(process.execPath, [path.join(root,'node_modules/prisma/build/index.js'),...args,'--config',config], {}, [0,2])
    const migration = '20260929120000_futscout_potential_estimates'
    const dirs = fs.readdirSync('prisma/migrations').filter(n => /^\d/.test(n)).sort()
    assert.equal(dirs.at(-1), migration)
    let base = fs.readFileSync('prisma/schema.prisma','utf8')
    for (const name of ['FutscoutPotentialModel','PlayerFutscoutPotentialEstimate','PlayerFutscoutPotentialCurrent','FutscoutPotentialEstimateStatus']) base = base.replace(new RegExp(`(?:model|enum) ${name} \\{[^}]*\\}`, 'g'), '')
    base = base.replace(/^.*futscoutPotentialEstimates PlayerFutscoutPotentialEstimate\[\].*\r?\n/m,'').replace(/^.*currentFutscoutPotential\s+PlayerFutscoutPotentialCurrent\?.*\r?\n/m,'')
    const basePath = path.join(out,'before.prisma'); fs.writeFileSync(basePath,base)
    for (const dir of dirs.filter(n => n !== migration)) await observer.query(fs.readFileSync(`prisma/migrations/${dir}/migration.sql`,'utf8'))
    const driftBefore = await prisma(['migrate','diff','--from-config-datasource','--to-schema',basePath,'--script','--exit-code'])
    assert(driftBefore.stdout.trim())
    await observer.query(fs.readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'))
    const driftAfter = await prisma(['migrate','diff','--from-config-datasource','--to-schema',path.join(root,'prisma/schema.prisma'),'--script','--exit-code'])
    assert.equal(driftAfter.code, driftBefore.code); assert.equal(driftAfter.stdout, driftBefore.stdout)
    report.drift = { ownDomainAdditionalDrift: false, historicalExitCode: driftAfter.code, sql: driftAfter.stdout }
    const tables = ['FutscoutPotentialModel','PlayerFutscoutPotentialEstimate','PlayerFutscoutPotentialCurrent']
    report.catalog = {
      constraints: (await observer.query('SELECT conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname=ANY($1)) ORDER BY conname',[tables])).rows,
      indexes: (await observer.query('SELECT indexname,indexdef FROM pg_indexes WHERE tablename=ANY($1) ORDER BY indexname',[tables])).rows,
      triggers: (await observer.query('SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relname=ANY($1)) AND NOT tgisinternal ORDER BY tgname',[tables])).rows,
    }
    const at = '2026-09-29T00:00:00.000Z'
    const makePlan = (id: string, old = false): PotentialWritePlan => ({ playerId:id,expectedExternalId:id,expectedPlayerUpdatedAt:at,input:{birthDate:old?'1988-01-01T00:00:00.000Z':'2000-01-01T00:00:00.000Z',referenceAt:at,overall:80,primaryPosition:'MC'},expectedCurrent:null,operationAt:at,decisionRef:'NATIVE_DISPOSABLE_TEST' })
    for (const id of ['same','different','versions','race-a','race-b','lock','statement','deadline','dead-a','dead-b','unknown','decline']) {
      await observer.query('INSERT INTO "Player" (id,slug,name,"externalId",position,"officialOverall","dateOfBirth","updatedAt",potential) VALUES ($1,$1,$1,$1,\'MC\',80,$2,$3,93)',[id,makePlan(id,id==='decline').input.birthDate,at])
    }
    const originalPlayers = (await observer.query('SELECT row_to_json(p)::text value FROM "Player" p ORDER BY id')).rows
    const snapshot = async () => {
      const all = []
      for (const table of tables) all.push((await observer!.query(`SELECT row_to_json(t)::text value FROM "${table}" t ORDER BY 1`)).rows)
      return all
    }
    const current = async (id: string) => (await observer!.query('SELECT "estimateId",version FROM "PlayerFutscoutPotentialCurrent" WHERE "playerId"=$1',[id])).rows[0] ?? null
    const history = async (id: string) => (await observer!.query('SELECT * FROM "PlayerFutscoutPotentialEstimate" WHERE "playerId"=$1 ORDER BY "createdAt",id',[id])).rows
    const writer = (hooks: NativeTestHooks = {}, binding: RegisteredPotentialCalculator = model) => createFutscoutPotentialWriter(nativePotentialStore(() => connect(), traces, hooks), binding)
    const race = async (plans: PotentialWritePlan[], bindings: RegisteredPotentialCalculator[] = [model,model]) => {
      const sync = barrier(2)
      const start = traces.length
      const receipts = await Promise.all(plans.map((plan,i) => writer({afterQuery:async sql => { if(sql.includes('FROM "Player" WHERE')) await sync() }},bindings[i])(plan)))
      const pair = traces.slice(start)
      assert.equal(new Set(pair.map(t=>t.pid)).size,2)
      assert(pair.every(t=>t.isolation==='serializable'))
      assert.equal(receipts.filter(r=>r.status==='COMMITTED').length,1)
      assert.equal(receipts.filter(r=>r.status==='REJECTED' && r.transactionState==='ROLLED_BACK').length,1)
      assert(receipts.every(r=>r.retries===0))
      return {receipts,pids:pair.map(t=>t.pid)}
    }
    await check('same input/current absent concurrent creation',async()=>{
      const result=await race([makePlan('same'),makePlan('same')])
      assert.equal((await history('same')).length,1); assert.equal((await current('same')).version,1)
      const replay=await writer()({...makePlan('same'),expectedCurrent:await current('same')}); assert.equal(replay.status,'NO_OP')
      const stale=await writer()(makePlan('same')); assert.equal(stale.reason,'CURRENT_CAS_CONFLICT')
      return {...result,replay,stale}
    })
    await check('different fingerprints, same existing revision',async()=>{
      assert.equal((await writer()(makePlan('different'))).status,'COMMITTED')
      const expectedCurrent=await current('different')
      const p=makePlan('different')
      const result=await race([1,2].map(day=>({...p,expectedCurrent,input:{...p.input,referenceAt:`2026-10-0${day}T00:00:00.000Z`}})))
      assert.equal((await history('different')).length,2); assert.equal((await current('different')).version,2)
      return {...result,historyCount:2,note:'The losing transaction rolls back its new estimate atomically; prior history and winning input coexist.'}
    })
    const fictitious = {...model,version:'synthetic-native-v2',artifactHash:'c'.repeat(64),calculate:()=>({status:'EXPERIMENTAL' as const,modelVersion:'synthetic-native-v2',potential:{raw:81,rounded:81,season:1}})}
    await check('different versions and immutable history',async()=>{
      assert.equal((await writer()(makePlan('versions'))).status,'COMMITTED')
      assert.equal((await writer({},fictitious)({...makePlan('versions'),expectedCurrent:await current('versions')})).status,'COMMITTED')
      const p=makePlan('versions'), expectedCurrent=await current('versions')
      const result=await race([1,2].map(day=>({...p,expectedCurrent,input:{...p.input,referenceAt:`2026-10-0${day}T00:00:00.000Z`}})),[model,fictitious])
      const rows=await history('versions'); assert.equal(new Set(rows.map(r=>r.modelVersion)).size,2); assert.equal(rows.length,3)
      assert.equal((await current('versions')).version,3)
      await assert.rejects(observer!.query('UPDATE "PlayerFutscoutPotentialEstimate" SET "potentialRaw"=82 WHERE "playerId"=\'versions\''),{code:'23514'})
      return result
    })
    await check('model registration race',async()=>{
      const binding={...fictitious,version:'synthetic-registration',calculate:()=>({...fictitious.calculate(),modelVersion:'synthetic-registration'})}
      const result=await race([makePlan('race-a'),makePlan('race-b')],[binding,binding])
      assert.equal((await observer!.query('SELECT * FROM "FutscoutPotentialModel" WHERE version=$1',[binding.version])).rowCount,1)
      return result
    })
    for (const [id,settings,expectedReason] of [['lock',{lockTimeoutMs:200,statementTimeoutMs:5000},'LOCK_TIMEOUT'],['statement',{lockTimeoutMs:5000,statementTimeoutMs:200},'STATEMENT_TIMEOUT']] as const) {
      await check(`${id} timeout rolls back`,async()=>{
        const blocker=await connect(); await blocker.query('BEGIN'); await blocker.query('SELECT id FROM "Player" WHERE id=$1 FOR UPDATE',[id])
        const before=await snapshot()
        let receipt: PotentialWriteReceipt
        try { receipt=await writer(settings)(makePlan(id)) } finally { await blocker.query('ROLLBACK'); await blocker.end() }
        assert.equal(receipt!.reason,expectedReason); assert.equal(receipt!.transactionState,'ROLLED_BACK'); assert.deepEqual(await snapshot(),before)
        return receipt!
      })
    }
    await check('total transaction 30s deadline across individually fast statements',async()=>{
      const before=await snapshot(), start=traces.length
      const receipt=await writer({afterWork:async tx=>{for(let i=0;i<40;i++) await tx.query('SELECT pg_sleep(1)')}})(makePlan('deadline'))
      assert.equal(receipt.reason,'TRANSACTION_TIMEOUT'); assert.equal(receipt.transactionState,'ROLLED_BACK')
      assert(traces[start].elapsedMs>=29500 && traces[start].elapsedMs<35000)
      assert.deepEqual(await snapshot(),before)
      return {receipt,elapsedMs:traces[start].elapsedMs,individualStatementSeconds:1}
    })
    await check('real deterministic deadlock, one rollback and one winner',async()=>{
      const sync=barrier(2), start=traces.length
      const receipts=await Promise.all(['dead-a','dead-b'].map((id,i)=>writer({beforeWork:async tx=>{
        await tx.query("SET LOCAL deadlock_timeout='100ms'")
        await tx.query('SELECT pg_advisory_xact_lock($1)',[100+i]); await sync()
        await tx.query('SELECT pg_advisory_xact_lock($1)',[101-i])
      }})(makePlan(id))))
      assert.equal(receipts.filter(r=>r.status==='COMMITTED').length,1)
      assert.equal(receipts.filter(r=>r.reason==='DEADLOCK' && r.transactionState==='ROLLED_BACK').length,1)
      assert.equal((await history('dead-a')).length+(await history('dead-b')).length,1)
      assert.equal(new Set(traces.slice(start).map(t=>t.pid)).size,2)
      return receipts
    })
    await check('commit acknowledgment loss, reconciliation without replay',async()=>{
      const start=traces.length, p=makePlan('unknown')
      const receipt=await writer({loseCommitAcknowledgment:true})(p)
      assert.equal(receipt.status,'COMMIT_INDETERMINATE'); assert.equal(receipt.counts,null); assert.equal(traces.length,start+1)
      const rows=await history('unknown'); assert.equal(rows.length,1)
      assert.equal(rows[0].inputHash,fingerprintFutscoutPotential(model,p.input).inputHash)
      assert.equal((await current('unknown')).estimateId,rows[0].id)
      return {receipt,reconciled:'COMMIT_CONFIRMED_BY_READ_BACK',noWriterReplay:true}
    })
    await check('semantics C, original E and declining player',async()=>{
      const p=makePlan('decline',true), receipt=await writer()(p)
      assert.equal(receipt.status,'COMMITTED')
      const row=(await history('decline'))[0], calculation=model.calculate(fingerprintFutscoutPotential(model,p.input).coreInput)
      assert.equal(calculation.status,'EXPERIMENTAL'); if(calculation.status!=='EXPERIMENTAL') throw Error('INVALID')
      assert.equal(row.potentialRaw,calculation.potential.raw); assert(row.potentialRaw<row.inputOverall)
      assert.equal(Math.max(row.inputSnapshot.overall,row.potentialRaw),80)
      return {futurePeak:row.potentialRaw,inputOverall:row.inputOverall,careerCeiling:80}
    })
    assert.deepEqual((await observer.query('SELECT row_to_json(p)::text value FROM "Player" p ORDER BY id')).rows,originalPlayers)
    report.playerPreserved=true
    report.noWriterPlayerDML=!/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"Player"/.test(fs.readFileSync('services/futscoutPotentialWriter.ts','utf8'))
    assert.equal(report.noWriterPlayerDML,true)
    report.status='PASS'
  } catch(error) {
    report.status='FAIL'; report.error={name:error instanceof Error?error.name:'Unknown',message:error instanceof Error?error.message:'Unknown'}
    process.exitCode=1
  } finally {
    await Promise.allSettled([...open].filter(c=>c!==admin).map(c=>c.end()))
    if(admin) {
      // Only our exact random database in the newly proved cluster can be dropped.
      assert(systemId); assert(/^futscout_potential_test_[a-f0-9]{32}$/.test(database))
      assert.equal((await admin.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id,systemId)
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      report.databaseRemoved=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===0
      await admin.end()
    }
    if(started) {
      const priorStatus=await command(path.join(bin,'pg_ctl.exe'),['-D',cluster,'status'],{},[0,3])
      if(priorStatus.code===0) await command(path.join(bin,'pg_ctl.exe'),['-D',cluster,'-m','fast','-w','stop'])
      const stopped=await command(path.join(bin,'pg_ctl.exe'),['-D',cluster,'status'],{},[3])
      report.clusterStopped=stopped.code===3
    }
    report.protectedFilesUnchanged=Object.fromEntries(protectedFiles.map(p=>[p,hash(fs.readFileSync(p))===beforeHashes[p]]))
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify({status:report.status,error:report.error,tests:(report.tests as unknown[]).length,databaseRemoved:report.databaseRemoved,clusterStopped:report.clusterStopped,report:path.join(out,'report.json'),cluster}))
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'HARNESS_FAILED');process.exitCode=1})
