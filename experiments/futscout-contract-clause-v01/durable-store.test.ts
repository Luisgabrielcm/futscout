import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { hash } from './contract'
import { createRegistry } from './source-registry'
import { freezePlan, type Candidate } from './planner'
import { simulateReceipt } from './replay'
import { JsonReceiptCheckpointStore as Store } from './durable-store'

const registry = createRegistry([{ id: 'synthetic', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'v1',
  permissionReference: 'synthetic/license', permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'CONFIRMED', commercialUse: 'CONFIRMED' } }])
const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
function plan(count = 2) {
  const items: Candidate[] = Array.from({ length: count }, (_, i) => {
    const id = String(i).padStart(3, '0')
    const expected = { playerId: `player-${id}`, clubId: 'club', season: '2026', context: 'REAL_WORLD' as const }
    return { requestId: `req-${id}`, eventId: `event-${id}`, sourceId: 'synthetic', sourceVersion: 'v1', expected,
      temporalLink: 'CONSISTENT', signals: { newChange: false, conflict: false, missingContract: true }, input: {
        contract: { ...expected, provider: 'SYNTHETIC', sourceReference: 'synthetic/fact', observedAt: '2026-10-08T12:00:00Z',
          providerEffectiveAt: null, signedAt: unknown, contractUntil: { value: '2027', datePrecision: 'YEAR' }, contractStatus: 'UNKNOWN',
          extensionOptions: null, identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC',
          provenance: { evidenceReference: 'synthetic/fact', rights: 'AUTHORIZED', synthetic: true },
          releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } },
        publishedAt: unknown, periodQualifier: null, competitionCalendar: null, evidenceStatus: 'OFFICIAL_EXPLICIT',
        verification: { at: '2026-10-08T13:00:00Z', sourceReference: 'synthetic/check', scope: 'CONTRACT_TERMS', outcome: 'CORROBORATED' }, events: [] } }
  })
  return freezePlan(items, registry, '2026-10-09T00:00:00.000Z')
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'futscout-durable-'))
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(root.includes('futscout-durable-'))
    await rm(root, { recursive: true, force: true })
    await assert.rejects(access(root))
  })
  return root
}
async function complete(store: Store, p: ReturnType<typeof plan>, index: number) {
  await store.begin(p.queue[index].requestId)
  await store.confirm(simulateReceipt(p, index, registry), 'synthetic/confirmation')
}

test('restart reconciles receipts after checkpoint, keeps timestamps and no duplicate replay', async t => {
  const root = await fixture(t), p = plan(30)
  let s = await Store.create(root, 'run', p, registry)
  for (let i = 0; i < 27; i++) await complete(s, p, i)
  const expected = s.recover(); await s.close()
  s = await Store.create(root, 'run', p, registry)
  try {
    assert.deepEqual(s.recover(), expected)
    assert.equal(expected.checkpoints.at(-1)?.cursor, 25)
    assert.equal(expected.receipts[0].observation?.observedAt, '2026-10-08T12:00:00.000Z')
    await s.begin(p.queue[0].requestId)
    await s.confirm(simulateReceipt(p, 0, registry), 'synthetic/confirmation')
    assert.deepEqual(s.recover(), expected)
    for (let i = 27; i < 30; i++) await complete(s, p, i)
    assert.equal(s.recover().cursor, 30)
  } finally { await s.close() }
})
for (const phase of ['BEFORE_RENAME', 'AFTER_RENAME'] as const) {
  test(`crash ${phase}: committed rename is authoritative, no automatic repeat`, async t => {
    const root = await fixture(t), p = plan()
    let s = await Store.create(root, 'run', p, registry, (at, status) => { if (at === phase && status === 'APPLIED') throw new Error('SIMULATED_CRASH') })
    await s.begin(p.queue[0].requestId)
    await assert.rejects(s.confirm(simulateReceipt(p, 0, registry), 'synthetic/proof'), /SIMULATED_CRASH/)
    assert.throws(() => s.recover(), /REOPEN/); await s.close()
    s = await Store.create(root, 'run', p, registry)
    try {
      assert.equal(s.recover().cursor, phase === 'AFTER_RENAME' ? 1 : 0)
      if (phase === 'BEFORE_RENAME') {
        assert.equal(s.recover().uncertain?.requestId, p.queue[0].requestId)
        await assert.rejects(s.begin(p.queue[0].requestId), /RECONCILIATION_REQUIRED/)
        await s.confirm(simulateReceipt(p, 0, registry), 'synthetic/recovered-proof')
      }
      assert.equal(s.recover().cursor, 1)
    } finally { await s.close() }
  })
}
test('uncertain result needs explicit not-applied proof before new attempt', async t => {
  const root = await fixture(t), p = plan()
  let s = await Store.create(root, 'run', p, registry)
  await s.begin(p.queue[0].requestId); await s.close()
  s = await Store.create(root, 'run', p, registry)
  try {
    await assert.rejects(s.begin(p.queue[1].requestId), /OUT_OF_ORDER/)
    await s.reconcileNotApplied(p.queue[0].requestId, 'synthetic/not-applied')
    assert.equal(s.recover().receipts.length, 0)
    await complete(s, p, 0)
  } finally { await s.close() }
})
for (const mode of ['truncated', 'hash', 'rehashed', 'gap'] as const) {
  test(`reject committed corruption: ${mode}`, async t => {
    const root = await fixture(t), p = plan(), s = await Store.create(root, 'run', p, registry)
    await complete(s, p, 0); await s.close()
    const path = join(root, 'run', '0000000002.json')
    const e = JSON.parse(await readFile(path, 'utf8'))
    if (mode === 'gap') await rm(path)
    else if (mode === 'truncated') await writeFile(path, '{')
    else {
      e.entry.position = 99
      if (mode === 'rehashed') e.integrityHash = hash(e.entry)
      await writeFile(path, JSON.stringify(e))
    }
    await assert.rejects(Store.create(root, 'run', p, registry))
  })
}
test('changed selection and registry rejected without replacing reference', async t => {
  const root = await fixture(t), s = await Store.create(root, 'run', plan(), registry)
  await s.close()
  await assert.rejects(Store.create(root, 'run', plan(3), registry), /SELECTION_OR_CONTEXT/)
  const p = plan(); p.planHash = '0'.repeat(64)
  await assert.rejects(Store.create(root, 'run', p, registry), /PLAN_CHANGED/)
})
test('cross-instance and in-instance concurrency fail closed; lock released on close', async t => {
  const root = await fixture(t), p = plan(), s = await Store.create(root, 'run', p, registry)
  await assert.rejects(Store.create(root, 'run', p, registry), /EEXIST/)
  const first = s.begin(p.queue[0].requestId)
  await assert.rejects(s.begin(p.queue[0].requestId), /CONCURRENT_OPERATION/)
  await first; await s.close(); await s.close()
  const reopened = await Store.create(root, 'run', p, registry); await reopened.close()
})
test('receipt collision, sensitive reference and unsafe run path rejected', async t => {
  const root = await fixture(t), p = plan(), s = await Store.create(root, 'run', p, registry)
  try {
    await s.begin(p.queue[0].requestId)
    await assert.rejects(s.confirm(simulateReceipt(p, 0, registry), 'api-key-secret'), /INVALID_IDENTIFIER/)
    await s.confirm(simulateReceipt(p, 0, registry), 'synthetic/proof')
    const bad = simulateReceipt(p, 0, registry); bad.payloadHash = 'bad'
    await assert.rejects(s.confirm(bad, 'synthetic/proof'), /COLLISION/)
  } finally { await s.close() }
  await assert.rejects(Store.create(root, '../escape', p, registry), /UNSAFE_RUN_ID/)
  const files = (await readdir(join(root, 'run'))).filter(f => f.endsWith('.json'))
  const text = (await Promise.all(files.map(f => readFile(join(root, 'run', f), 'utf8')))).join('')
  assert.ok(!text.includes('releaseClause') && !text.includes('synthetic/fact') && !text.includes('api-key-secret'))
})
test('empty selection supported; incomplete temp ignored, not promoted', async t => {
  const root = await fixture(t), p = plan(0)
  let s = await Store.create(root, 'run', p, registry); await s.close()
  await writeFile(join(root, 'run', 'pending-abcd.tmp'), '{')
  s = await Store.create(root, 'run', p, registry)
  assert.equal(s.recover().cursor, 0); await s.close()
})
test('real child process exit leaves lock; explicit reconciliation recovers renamed receipt', async t => {
  const root = await fixture(t), p = plan()
  const input = join(root, 'synthetic-input.json')
  await writeFile(input, JSON.stringify({ p, registry }))
  const moduleURL = pathToFileURL(resolve('experiments/futscout-contract-clause-v01/durable-store.ts')).href
  const replayURL = pathToFileURL(resolve('experiments/futscout-contract-clause-v01/replay.ts')).href
  const code = `import { readFile } from 'node:fs/promises';
    import { JsonReceiptCheckpointStore as Store } from ${JSON.stringify(moduleURL)};
    import { simulateReceipt } from ${JSON.stringify(replayURL)};
    const {p,registry}=JSON.parse(await readFile(${JSON.stringify(input)},'utf8'));
    const s=await Store.create(${JSON.stringify(root)},'run',p,registry,(phase,status)=>{
      if(phase==='AFTER_RENAME'&&status==='APPLIED')process.exit(73);
    });
    await s.begin(p.queue[0].requestId);
    await s.confirm(simulateReceipt(p,0,registry),'synthetic/proof');`
  await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code],
    { windowsHide: true, timeout: 30000 }), (error: unknown) => (error as { code: number }).code === 73)
  await assert.rejects(Store.create(root, 'run', p, registry), /EEXIST/)
  // Child exit is now established. Simulate the documented explicit stale-lock procedure.
  await rm(join(root, 'run', 'writer.lock'))
  const s = await Store.create(root, 'run', p, registry)
  try { assert.equal(s.recover().cursor, 1); assert.equal(s.recover().uncertain, null) }
  finally { await s.close() }
})
