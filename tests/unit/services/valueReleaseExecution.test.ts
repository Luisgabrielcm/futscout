import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { ValueReleaseJournal } from '../../../services/valueReleaseExecution'
import { runValueRelease, validateReleaseTarget, type ValueReleaseTarget } from '../../../scripts/runValueRelease'

test('operational command requires explicit files and never defaults to ambient credentials', async () => {
  await assert.rejects(runValueRelease([]), /RELEASE_ARGUMENTS/)
  await assert.rejects(runValueRelease(['import']), /RELEASE_ARGUMENTS/)
  await assert.rejects(runValueRelease(['import', '--target', 'x', '--target', 'y']), /RELEASE_ARGUMENTS/)
})

test('explicit target rejects ambient names and requires separate production authorization', () => {
  const target: ValueReleaseTarget = { version: 'value-release-target-v1', environment: 'PRODUCTION', resourceRef: 'provider/project/database-id',
    connectionEnv: 'FUTSCOUT_RELEASE_WRITER_URL', identityEvidence: { file: 'private', sha256: 'a'.repeat(64) },
    expected: { host: 'example.invalid', port: 5432, database: 'catalog', username: 'writer', databaseOid: '123', serverVersionNum: '170011' } }
  assert.throws(() => validateReleaseTarget(target), /AUTHORIZATION_REQUIRED/)
  validateReleaseTarget(target, target.resourceRef)
  for (const name of ['DATABASE_URL', 'DIRECT_URL', '']) assert.throws(() => validateReleaseTarget({ ...target, connectionEnv: name }, target.resourceRef), /EXPLICIT_TARGET/)
})

test('durable journal detects pending commit, tampering, torn suffix and invalid order', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'futscout-release-journal-'))
  const file = path.join(directory, 'journal.ndjson'), journal = new ValueReleaseJournal(file)
  journal.append({ kind: 'HEADER', batchHash: 'a'.repeat(64), bundleSha256: 'b'.repeat(64), targetHash: 'c'.repeat(64),
    baseline: { currentHash: 'd'.repeat(64), providerHistoryHash: 'e'.repeat(64), itemCurrents: ['f'.repeat(64)] } })
  journal.append({ kind: 'PENDING', index: 0 })
  assert.equal(new ValueReleaseJournal(file).state().pending, 0)
  journal.append({ kind: 'COMMITTED', index: 0, row: { playerId: 'p', requestId: 'r', stateId: 's', observationId: 'o', originalCurrentHash: 'f'.repeat(64) } })
  assert.equal(new ValueReleaseJournal(file).state().rows.length, 1)
  const original = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, original.replace('"playerId":"p"', '"playerId":"q"'))
  assert.throws(() => new ValueReleaseJournal(file), /JOURNAL_HASH/)
  fs.writeFileSync(file, original.trimEnd())
  assert.throws(() => new ValueReleaseJournal(file), /JOURNAL_TORN/)
  fs.writeFileSync(file, original)
  journal.append({ kind: 'PENDING', index: 4 })
  assert.throws(() => new ValueReleaseJournal(file), /JOURNAL_PENDING/)
  // Leave only small test evidence in the OS temp directory; no recursive delete.
  fs.unlinkSync(file); fs.rmdirSync(directory)
})
