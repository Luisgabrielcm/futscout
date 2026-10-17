// Explicit disposable native test only. No environment URLs, dotenv, provider or Production bindings.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { Client, Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../app/generated/prisma/client'
import { newTransactionTrace, traceClient } from './transaction-trace'
assert(process.argv.includes('--disposable-authorized'), 'DISPOSABLE_OPT_IN_REQUIRED')
const bin = 'C:/Program Files/PostgreSQL/14/bin'
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
const command = (name: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(path.join(bin, `${name}.exe`), args, { env, windowsHide: true, stdio: 'ignore' })
  child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error('DISPOSABLE_COMMAND_FAILED')))
})
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-value-p2028-'))
assert.equal(path.dirname(path.resolve(cluster)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
assert(path.basename(cluster).startsWith('fs-value-p2028-'))
let started = false, db: Client | undefined, pool: Pool | undefined, prisma: PrismaClient | undefined, checks = 0
const check = async (name: string, fn: () => Promise<void>) => { await fn(); checks++; console.log(`PASS ${name}`) }
try {
  const server = net.createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port; await new Promise<void>(resolve => server.close(() => resolve()))
  await command('initdb', ['-D', cluster, '-U', 'value_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
  await command('pg_ctl', ['-D', cluster, '-l', path.join(cluster, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true
  const config = { host: '127.0.0.1', port, user: 'value_test', database: 'postgres', ssl: false as const }
  db = new Client(config); await db.connect()
  const proof = (await db.query("SELECT current_setting('data_directory') dir,current_setting('server_version') version")).rows[0]
  assert.equal(path.resolve(proof.dir).toLowerCase(), path.resolve(cluster).toLowerCase()); assert.match(proof.version, /^14\./)
  console.log(`POSTGRES ${proof.version}`)
  await db.query('CREATE TABLE receipt(request_id text PRIMARY KEY, content text NOT NULL)')
  if (process.argv.includes('--remote-fence-only')) {
    const old = new Client(config), competing = new Client(config)
    await old.connect(); await competing.connect()
    try {
      await check('new advisory lock does not fence an old nonparticipating Serializable transaction', async () => {
        await old.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        await old.query("INSERT INTO receipt VALUES ('old-attempt','original-content')")
        const identity = (await old.query('SELECT pg_backend_pid() pid')).rows[0]
        const active = (await db!.query('SELECT backend_start,xact_start,state FROM pg_stat_activity WHERE pid=$1', [identity.pid])).rows[0]
        assert(active.backend_start && active.xact_start)
        assert.equal(active.state, 'idle in transaction')
        assert.equal((await db!.query('SELECT pg_try_advisory_lock(1057) acquired')).rows[0].acquired, true)
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='old-attempt'")).rows[0].n, 0)
        await old.query('COMMIT')
        assert.equal((await db!.query("SELECT content FROM receipt WHERE request_id='old-attempt'")).rows[0].content, 'original-content')
      })
      await check('cooperating concurrent session is excluded, not retroactively protected', async () => {
        assert.equal((await competing.query('SELECT pg_try_advisory_lock(1057) acquired')).rows[0].acquired, false)
        await competing.query("INSERT INTO receipt VALUES ('other-independent-player','synthetic')")
        await assert.rejects(competing.query("INSERT INTO receipt VALUES ('old-attempt','conflict')"),
          error => (error as { code?: string }).code === '23505')
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='old-attempt'")).rows[0].n, 1)
      })
      await check('session isolation requires original identity and acknowledged termination', async () => {
        await old.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        await old.query("INSERT INTO receipt VALUES ('explicit-rollback','synthetic')")
        assert.equal((await old.query('ROLLBACK')).command, 'ROLLBACK')
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='explicit-rollback'")).rows[0].n, 0)
        assert.equal((await db!.query('SELECT pg_advisory_unlock(1057) released')).rows[0].released, true)
        assert.equal((await competing.query('SELECT pg_try_advisory_lock(1057) acquired')).rows[0].acquired, true)
        await competing.query('SELECT pg_advisory_unlock(1057)')
      })
    } finally { await old.end(); await competing.end() }
    console.log(JSON.stringify({ status: 'REMOTE_FENCE_LIMITS_CONFIRMED', checks }))
  } else if (process.argv.includes('--write-isolation-only')) {
    const inflight = new Client(config)
    await inflight.connect()
    try {
      await check('local fence cannot prevent an already submitted transaction committing late', async () => {
        await inflight.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        await inflight.query("INSERT INTO receipt VALUES ('pending-player','original-content')")
        const blocked = new Set(['pending-player']) // Local fence, not a database constraint.
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='pending-player'")).rows[0].n, 0)
        assert(blocked.has('pending-player'))
        await db!.query("INSERT INTO receipt VALUES ('other-player','independent-content')")
        assert.equal((await inflight.query('COMMIT')).command, 'COMMIT')
        assert.equal((await db!.query("SELECT content FROM receipt WHERE request_id='pending-player'")).rows[0].content, 'original-content')
      })
      await check('late commit reconciles exact content without a repeated write', async () => {
        const rows = (await db!.query("SELECT content FROM receipt WHERE request_id='pending-player'")).rows
        assert.equal(rows.length, 1)
        assert.equal(rows[0].content, 'original-content')
        assert.equal((await db!.query("SELECT content FROM receipt WHERE request_id='other-player'")).rows[0].content, 'independent-content')
      })
      await check('conflicting repeat is not success and cannot overwrite original content', async () => {
        await assert.rejects(db!.query("INSERT INTO receipt VALUES ('pending-player','divergent-content')"),
          error => (error as { code?: string }).code === '23505')
        assert.equal((await db!.query("SELECT content FROM receipt WHERE request_id='pending-player'")).rows[0].content, 'original-content')
      })
      await check('original session rollback acknowledgement proves termination, unlike absence alone', async () => {
        await inflight.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        await inflight.query("INSERT INTO receipt VALUES ('rolled-back-player','original-content')")
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='rolled-back-player'")).rows[0].n, 0)
        const acknowledgement = await inflight.query('ROLLBACK')
        assert.equal(acknowledgement.command, 'ROLLBACK')
        assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='rolled-back-player'")).rows[0].n, 0)
      })
    } finally { await inflight.end() }
    console.log(JSON.stringify({ status: 'WRITE_ISOLATION_COUNTEREXAMPLE_CONFIRMED', checks }))
  } else {
  pool = new Pool({ ...config, max: 1 }); prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) })
  const client = prisma
  const observe = () => newTransactionTrace('lfglobal-0123456789abcdef-synthetic')
  await check('commit confirmed, Serializable and read-back', async () => {
    const o = observe()
    await traceClient(client, o).$transaction(async tx => {
      const isolation = await tx.$queryRawUnsafe<{ transaction_isolation: string }[]>('SHOW transaction_isolation')
      assert.equal(isolation[0].transaction_isolation, 'serializable')
      await tx.$executeRawUnsafe("INSERT INTO receipt VALUES ('commit','synthetic')")
    }, { isolationLevel: 'Serializable' })
    assert(o.trace.events.some(e => e.phase === 'COMMIT' && e.status === 'CONFIRMED'))
    assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='commit'")).rows[0].n, 1)
  })
  await check('native P2028 start timeout with occupied shared pool', async () => {
    const held = await pool!.connect(), o = observe()
    let entered = false
    try {
      await assert.rejects(traceClient(client, o).$transaction(async () => { entered = true }, { isolationLevel: 'Serializable', maxWait: 50 }),
        e => (e as { code: string }).code === 'P2028')
      assert.equal(entered, false); assert.equal(o.trace.p2028Subtype, 'START_TIMEOUT')
      assert(!o.trace.events.some(e => e.phase === 'EXECUTE'))
    } finally { held.release() }
    await new Promise(resolve => setTimeout(resolve, 150))
  })
  await check('native P2028 execution expiry before commit', async () => {
    const o = observe()
    await assert.rejects(traceClient(client, o).$transaction(async tx => {
      await tx.$executeRawUnsafe("INSERT INTO receipt VALUES ('timeout','synthetic')")
      await new Promise(resolve => setTimeout(resolve, 150))
      await tx.$queryRawUnsafe('SELECT 1')
    }, { isolationLevel: 'Serializable', timeout: 50 }), e => (e as { code: string }).code === 'P2028')
    assert.equal(o.trace.p2028Subtype, 'EXPIRED')
    assert(!o.trace.events.some(e => e.phase === 'COMMIT' && e.status === 'CONFIRMED'))
    assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='timeout'")).rows[0].n, 0)
  })
  await check('execution error remains blocked without inferred rollback acknowledgement', async () => {
    const o = observe()
    await assert.rejects(traceClient(client, o).$transaction(async tx => { await tx.$queryRawUnsafe('SELECT 1/0') }, { isolationLevel: 'Serializable' }))
    assert(o.trace.events.some(e => e.phase === 'EXECUTE' && e.status === 'FAILED'))
    assert(!o.trace.events.some(e => e.phase === 'COMMIT'))
  })
  await check('explicit native ROLLBACK acknowledged and no persisted row', async () => {
    await db!.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await db!.query("INSERT INTO receipt VALUES ('rollback','synthetic')")
    assert.equal((await db!.query('ROLLBACK')).command, 'ROLLBACK')
    assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='rollback'")).rows[0].n, 0)
  })
  await check('lost application receipt after commit reconciles by read-back without repeat', async () => {
    let writes = 0
    await assert.rejects((async () => {
      writes++; await client.$transaction(async tx => { await tx.$executeRawUnsafe("INSERT INTO receipt VALUES ('lost','synthetic')") }, { isolationLevel: 'Serializable' })
      throw Error('SIMULATED_RECEIPT_LOSS')
    })())
    const row = (await db!.query("SELECT content FROM receipt WHERE request_id='lost'")).rows[0]
    assert.equal(row.content, 'synthetic'); assert.equal(writes, 1)
  })
  await check('uniqueness conflict is not success; no duplicate receipt', async () => {
    await assert.rejects(client.$executeRawUnsafe("INSERT INTO receipt VALUES ('lost','different')"))
    assert.equal((await db!.query("SELECT count(*)::int n FROM receipt WHERE request_id='lost'")).rows[0].n, 1)
  })
  console.log(JSON.stringify({ status: 'NATIVE_P2028_PASS', checks }))
  }
} finally {
  try { await prisma?.$disconnect() } finally {
    try { await pool?.end(); await db?.end() } finally {
      if (started || fs.existsSync(path.join(cluster, 'postmaster.pid'))) await command('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop'])
      // Exact validated disposable path only; never delete a workspace or database URL target.
      assert.equal(path.dirname(path.resolve(cluster)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
      assert(path.basename(cluster).startsWith('fs-value-p2028-'))
      fs.rmSync(cluster, { recursive: true, force: true }); assert(!fs.existsSync(cluster)); console.log('DISPOSABLE_REMOVED')
    }
  }
}
