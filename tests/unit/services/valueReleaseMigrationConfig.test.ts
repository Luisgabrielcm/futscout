import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('release migration CLI rejects missing explicit selection even with legacy URLs and validates a selected schema without connecting', () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1',
    DATABASE_URL: 'postgresql://disabled@127.0.0.1:9/legacy_runtime',
    DIRECT_URL: 'postgresql://disabled@127.0.0.1:9/legacy_admin' }
  for (const key of ['SystemRoot', 'WINDIR', 'Path', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'])
    if (process.env[key]) env[key] = process.env[key]
  const args = ['node_modules/prisma/build/index.js', 'validate', '--config', 'prisma/valueRelease.config.ts']
  const denied = spawnSync(process.execPath, args, { env, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /RELEASE_MIGRATION_TARGET_REQUIRED/)
  // validate only: port 9 has no database and no SQL is attempted.
  const selected = spawnSync(process.execPath, args, { env: { ...env,
    FUTSCOUT_VALUE_MIGRATION_URL: 'postgresql://disabled@127.0.0.1:9/explicit_selection' },
  encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(selected.status, 0, 'EXPLICIT_RELEASE_SCHEMA_VALIDATION_FAILED')
})
