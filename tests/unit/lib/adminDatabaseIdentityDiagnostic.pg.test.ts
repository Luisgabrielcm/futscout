import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Client } from 'pg'
import { compareDatabaseSessions, runAdminDatabaseIdentityDiagnostic } from '../../../lib/adminDatabaseIdentityDiagnostic.server'

const binDir = process.env.FUTSCOUT_PG_TEST_BIN

async function freePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('NO_TEST_PORT')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

test('disposable PostgreSQL proves same database and rejects a different database', { skip: !binDir }, async () => {
  const temp = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(temp, 'futscout-admin-identity-'))
  const cluster = path.join(root, 'cluster')
  const executable = (name: string) => path.join(binDir!, process.platform === 'win32' ? `${name}.exe` : name)
  const command = (name: string, args: string[]) => execFileSync(executable(name), args, { stdio: 'ignore', timeout: 30_000 })
  const port = await freePort()
  let started = false
  const clients: Client[] = []
  try {
    command('initdb', ['-D', cluster, '-U', 'diagnostic_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
    command('pg_ctl', ['-D', cluster, '-l', path.join(root, 'postgres.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
    started = true
    const connect = async (database: string) => {
      const client = new Client({ host: '127.0.0.1', port, user: 'diagnostic_test', database })
      await client.connect()
      clients.push(client)
      return client
    }
    const setup = await connect('postgres')
    await setup.query('CREATE DATABASE diagnostic_other')
    const runtime = await connect('postgres')
    const sameAdmin = await connect('postgres')
    assert.deepEqual(await compareDatabaseSessions(runtime, sameAdmin),
      { identity: 'VERIFIED', code: 'VERIFIED' })
    const otherAdmin = await connect('diagnostic_other')
    await assert.rejects(compareDatabaseSessions(runtime, otherAdmin),
      (error: { code: string }) => error.code === 'DATABASE_NAME_MISMATCH')

    const env = { NODE_ENV: 'production' as const, DATABASE_URL: 'disposable-runtime',
      FUTSCOUT_ADMIN_DATABASE_URL: 'disposable-admin' }
    const auth = await runAdminDatabaseIdentityDiagnostic({
      env,
      createRuntime: () => new Client({ host: '127.0.0.1', port, user: 'missing_test_role', database: 'postgres' }),
      connectAdmin: async () => { throw Error('SHOULD_NOT_CONNECT') },
    })
    assert.deepEqual(auth, { identity: 'INCONCLUSIVE', code: 'CONNECT_RUNTIME_AUTH' })
  } finally {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)))
    if (started) command('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop'])
    const safeRoot = path.resolve(root)
    if (!safeRoot.startsWith(temp + path.sep) || path.basename(safeRoot).startsWith('futscout-admin-identity-') === false)
      throw Error('UNSAFE_TEST_CLEANUP')
    fs.rmSync(safeRoot, { recursive: true, force: true })
  }
})
