import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readVercelApi, requireReadyCandidate } from './vercelReadOnlyApi.mjs'

const options = { cliPath: '/fixture/vercel.js', path: '/v13/deployments/dpl_fixture', scope: 'fixture', teamId: 'team_fixture' }
const ok = { status: 0, signal: null, stdout: '{"id":"dpl_fixture"}', stderr: '' }
const failure = code => ({ status: null, signal: 'SIGTERM', error: Object.assign(new Error('secret'), { code }), stdout: '', stderr: '' })

test('real child timeout: old wrapper loses ETIMEDOUT; corrected wrapper preserves it', () => {
  const run = () => spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { encoding: 'utf8', timeout: 150 })
  const result = run()
  assert.equal(result.error.code, 'ETIMEDOUT')
  assert.equal(result.stderr || 'CLI_FAILED', 'CLI_FAILED')
  assert.throws(() => readVercelApi({ ...options, maxAttempts: 1 }, { run }), error => {
    assert.equal(error.attempts[0].kind, 'ETIMEDOUT'); return true
  })
})

test('GET-only retry recovers one transient failure and records both attempts', () => {
  let calls = 0
  const result = readVercelApi(options, { run: (executable, args, config) => {
    assert.equal(executable, process.execPath); assert.equal(args[1], 'api')
    assert.ok(args[2].startsWith('/v13/deployments/dpl_fixture?teamId='))
    assert.ok(!args.includes('--method') && !args.includes('--data'))
    assert.ok(config.timeout <= 15000)
    return calls++ ? ok : failure('ETIMEDOUT')
  } })
  assert.equal(calls, 2); assert.equal(result.data.id, 'dpl_fixture')
  assert.deepEqual(result.attempts.map(x => x.kind), ['ETIMEDOUT', 'OK'])
})

for (const [name, result] of [
  ['404', { ...ok, status: 1, stderr: 'Deployment not found (404)' }],
  ['auth', { ...ok, status: 1, stderr: 'Unauthorized (401)' }],
  ['signal', { ...ok, status: null, signal: 'SIGKILL' }],
  ['resource exhaustion', failure('ENOBUFS')],
  ['spawn failure', failure('ENOENT')],
  ['invalid JSON', { ...ok, stdout: '{broken' }],
  ['API error in JSON', { ...ok, stdout: '{"error":{"message":"secret"}}' }],
  ['unknown CLI failure', { ...ok, status: 1, stderr: '' }],
]) test(`${name} fails closed without retries or leaked output`, () => {
  let calls = 0
  assert.throws(() => readVercelApi(options, { run: () => { calls++; return result } }), error => {
    assert.equal(calls, 1); assert.equal(error.attempts.length, 1)
    assert.ok(!JSON.stringify(error).includes('secret')); return true
  })
})

test('retry exhaustion remains failure and honors remaining deadline', () => {
  let clock = 0, calls = 0
  assert.throws(() => readVercelApi({ ...options, totalTimeoutMs: 20 }, {
    now: () => clock,
    run: (exe, args, config) => { calls++; assert.equal(config.timeout, calls === 1 ? 20 : 10); clock += 10; return failure('ETIMEDOUT') },
  }), error => { assert.equal(error.attempts.length, 2); return true })
})

test('mutating commands, arbitrary paths and excessive retry limits rejected before spawn', () => {
  for (const path of ['/v13/deployments', '/v13/deployments/dpl_fixture?decrypt=true', 'https://example.com', '/v9/projects/prj_x/env']) {
    assert.throws(() => readVercelApi({ ...options, path }, { run: () => assert.fail('must not spawn') }))
  }
  assert.throws(() => readVercelApi({ ...options, maxAttempts: 3 }))
})

test('ready gate rejects wrong identity, source, state, target and aliases', () => {
  const expected = { id: 'dpl_fixture', projectId: 'prj_fixture', sha: 'approved' }
  const ready = { ...expected, meta: { clubContextPilotSourceSha: 'approved' }, readyState: 'READY', target: 'production', alias: [] }
  assert.equal(requireReadyCandidate(ready, expected), ready)
  for (const patch of [{ id: 'dpl_other' }, { projectId: 'prj_other' }, { meta: {} }, { readyState: 'ERROR' }, { readyState: 'BUILDING' }, { target: 'preview' }, { alias: undefined }, { alias: ['futscout.vercel.app'] }]) {
    assert.throws(() => requireReadyCandidate({ ...ready, ...patch }, expected))
  }
})
