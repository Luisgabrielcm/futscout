import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DurableContractAttempt } from './durable-reconciliation'
import { freezePlan } from './planner'
import { createRegistry } from './source-registry'
import type { Proposal, BridgePorts, ReadBack } from './economic-bridge'

const registry = createRegistry([{ id: 'synthetic', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'v1',
  permissionReference: 'synthetic/license', permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'CONFIRMED', commercialUse: 'CONFIRMED' } }])
function plan(p: Proposal) {
  const s = p.command.state, expected = { playerId: s.playerId, clubId: 'c1', context: s.context, season: '2026' }
  const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
  return freezePlan([{ requestId: p.command.requestId, eventId: p.command.requestId, sourceId: 'synthetic', sourceVersion: 'v1', expected,
    temporalLink: 'CONSISTENT', signals: { newChange: true, conflict: false, missingContract: false }, input: {
      contract: { ...expected, provider: s.provider, sourceReference: s.metadata.evidenceRef!, observedAt: p.command.observedAt,
        providerEffectiveAt: s.providerEffectiveAt, signedAt: unknown, contractUntil: { value: s.contractUntil!, datePrecision: 'DAY' },
        contractStatus: 'UNKNOWN', extensionOptions: null, identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC',
        provenance: { evidenceReference: s.metadata.evidenceRef!, rights: 'AUTHORIZED', synthetic: true },
        releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } },
      publishedAt: unknown, periodQualifier: null, competitionCalendar: null, evidenceStatus: 'OFFICIAL_EXPLICIT', verification: null, events: [] } }],
  registry, '2026-10-09T12:00:00.000Z')
}
export async function durableNativeScenarios(input: {
  root: string; proposal(until: string): Proposal; ports: BridgePorts; counts(): Promise<number[]>
  injectAbort(requestId: string, terminateBackend: boolean): Promise<void>
}) {
  let scenarios = 0, writes = 0
  const ports: BridgePorts = { readBack: input.ports.readBack, writer: async command => {
    assert.equal(command.selectCurrent, false); writes++; return input.ports.writer(command)
  } }
  const open = (p: Proposal, port = ports) => DurableContractAttempt.open(input.root, p, plan(p), registry, port)
  const check = async (name: string, work: () => Promise<void>) => { await work(); scenarios++; console.log(`DURABLE_PASS ${name}`) }
  const p = input.proposal('2032-06-30')
  await check('commit before local receipt; restart read-back records confirmation', async () => {
    let attempt = await open(p)
    try { assert.equal((await attempt.recover()).status, 'NOT_STARTED'); await attempt.prepare(); await ports.writer(p.command) }
    finally { await attempt.close() }
    attempt = await open(p)
    try {
      assert.equal((await attempt.recover()).status, 'CONFIRMED')
      assert.equal(attempt.binding().economicContentHash, p.contentHash)
      const read = await ports.readBack(p.command.requestId)
      assert.equal(read.kind, 'FOUND'); if (read.kind === 'FOUND') assert.equal(read.observedAt, p.command.observedAt)
    } finally { await attempt.close() }
  })
  await check('same request replay after another restart never writes', async () => {
    const before = writes, counts = await input.counts(), attempt = await open(p)
    try { assert.equal((await attempt.execute()).status, 'CONFIRMED'); assert.equal(writes, before); assert.deepEqual(await input.counts(), counts) }
    finally { await attempt.close() }
  })
  for (const terminate of [false,true]) await check(terminate ? 'backend terminated before commit; no phantom observation' : 'rollback with receipt lost needs settlement proof', async () => {
    const q = input.proposal(terminate ? '2034-06-30' : '2033-06-30'), counts = await input.counts()
    await input.injectAbort(q.command.requestId, terminate)
    let attempt = await open(q)
    try { await attempt.prepare(); await assert.rejects(ports.writer(q.command)) } finally { await attempt.close() }
    assert.deepEqual(await input.counts(), counts)
    attempt = await open(q)
    try {
      const before = writes
      assert.equal((await attempt.recover()).status, 'UNKNOWN')
      assert.equal((await attempt.execute()).status, 'UNKNOWN'); assert.equal(writes, before)
      assert.equal((await attempt.recover({ requestId: q.command.requestId, reference: 'synthetic/settled-local-transaction',
        outcome: 'ROLLED_BACK_OR_NOT_DISPATCHED' })).status, 'NOT_STARTED')
      assert.deepEqual(await input.counts(), counts)
    } finally { await attempt.close() }
  })
  await check('unavailable read-back blocks despite local confirmed receipt', async () => {
    const before = writes, attempt = await open(p, { ...ports, readBack: async () => ({ kind: 'INDETERMINATE' }) })
    try { assert.equal((await attempt.execute()).status, 'UNKNOWN'); assert.equal(writes, before) } finally { await attempt.close() }
  })
  await check('concurrent owners excluded by durable lock', async () => {
    const attempt = await open(p)
    try { await assert.rejects(open(p), /EEXIST/) } finally { await attempt.close() }
  })
  await check('concurrent calls share no in-flight dispatch', async () => {
    const q = input.proposal('2035-06-30'), attempt = await open(q), before = writes
    try {
      const first = attempt.execute()
      await assert.rejects(attempt.execute(), /CONCURRENT_ATTEMPT/)
      assert.equal((await first).status, 'CONFIRMED'); assert.equal(writes, before+1)
    } finally { await attempt.close() }
  })
  await check('content divergence from PostgreSQL read-back blocks', async () => {
    const before = writes
    const attempt = await open(p, { ...ports, readBack: async id => {
      const rb = await ports.readBack(id)
      return rb.kind === 'FOUND' ? { ...rb, state: { ...rb.state, contractUntil: '2099-01-01' } } : rb
    } })
    try { assert.equal((await attempt.execute()).status, 'CONFLICT'); assert.equal(writes, before) } finally { await attempt.close() }
  })
  await check('IDs diverging from durable confirmed proof block', async () => {
    const attempt = await open(p, { ...ports, readBack: async id => {
      const rb: ReadBack = await ports.readBack(id)
      return rb.kind === 'FOUND' ? { ...rb, observationId: 'divergent-observation' } : rb
    } })
    try { assert.equal((await attempt.recover()).status, 'CONFLICT') } finally { await attempt.close() }
  })
  await check('corrupt checkpoint rejected before any database operation', async () => {
    const file = path.join(input.root, DurableContractAttempt.runId(p), '0000000001.json')
    fs.writeFileSync(file, '{') // Only the synthetic test journal, removed with this disposable cluster.
    let calls = 0
    await assert.rejects(open(p, { readBack: async () => { calls++; return { kind: 'INDETERMINATE' } },
      writer: async () => { calls++; throw new Error('UNEXPECTED_WRITE') } }))
    assert.equal(calls, 0)
  })
  await check('altered proposal selectCurrent and frozen plan rejected', async () => {
    const q = input.proposal('2036-06-30'); q.command.selectCurrent = true
    await assert.rejects(open(q), /PROPOSAL_CHANGED|UNSAFE_WRITE/)
    const good = input.proposal('2036-06-30'), bad = plan(good); bad.queue[0].requestId = 'other'
    await assert.rejects(DurableContractAttempt.open(input.root,good,bad,registry,ports), /PLAN_CHANGED/)
  })
  assert.equal((await input.counts())[2], 0)
  console.log(`DURABLE_RECONCILIATION_PASS scenarios=${scenarios} writes=${writes} currents=0`)
  return scenarios
}
