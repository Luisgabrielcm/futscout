import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, prepare } from './contract'
import { createRegistry, sourceGate, type Source } from './source-registry'
import { freezePlan, nextBatch, type Candidate, type Plan } from './planner'
import { evaluateEligibility } from './eligibility'
import { startReplay, replayStep, reconcileReplay, simulateReceipt } from './replay'

const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
const asOf = '2026-10-09T00:00:00.000Z'
const source: Source = { id: 'synthetic-source', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'synthetic-policy-v1',
  permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'CONFIRMED', commercialUse: 'CONFIRMED' },
  permissionReference: 'synthetic/license' }
const registry = createRegistry([source])
function candidate(n = 1): Candidate {
  const id = String(n).padStart(4, '0')
  const expected = { playerId: `synthetic-player-${id}`, clubId: 'synthetic-club', context: 'REAL_WORLD' as const, season: '2026' }
  return { requestId: `request-${id}`, eventId: `event-${id}`, sourceId: source.id, sourceVersion: 'v1', expected,
    temporalLink: 'CONSISTENT', signals: { newChange: false, conflict: false, missingContract: false }, input: {
      contract: { ...expected, provider: 'SYNTHETIC', sourceReference: 'synthetic/terms', observedAt: '2026-10-08T12:00:00Z',
        providerEffectiveAt: null, signedAt: unknown, contractUntil: { value: '2027', datePrecision: 'YEAR' }, contractStatus: 'UNKNOWN',
        extensionOptions: [{ holder: 'UNKNOWN', until: { value: '2028', datePrecision: 'YEAR' }, conditions: null, sourceReference: 'synthetic/option' }],
        identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC', provenance: { evidenceReference: 'synthetic/terms', rights: 'AUTHORIZED', synthetic: true },
        releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } },
      publishedAt: { value: '2025', datePrecision: 'YEAR' }, periodQualifier: null, competitionCalendar: null, evidenceStatus: 'OFFICIAL_EXPLICIT',
      verification: { at: '2026-10-08T13:00:00Z', scope: 'CONTRACT_TERMS', outcome: 'CORROBORATED', sourceReference: 'synthetic/verification' }, events: [] } }
}
const planOf = (items = [candidate()]) => freezePlan(items, registry, asOf)
function outcome(plan: Plan, index: number, kind: 'SUCCESS' | 'INTERRUPTED' | 'UNCERTAIN' = 'SUCCESS') {
  const { requestId, payloadHash } = plan.queue[index]
  return { requestId, payloadHash, kind }
}
function run(plan: Plan, state = startReplay(plan), count = plan.queue.length) {
  let next = state
  for (let i = 0; i < count && next.cursor < plan.queue.length; i++) next = replayStep(plan, next, registry, outcome(plan, next.cursor))
  return next
}

test('only explicitly authorized synthetic source enabled; no default real providers', () => {
  assert.equal(sourceGate(source).enabled, true)
  assert.deepEqual(createRegistry([]).entries, [])
  assert.equal(sourceGate({ ...source, permissionReference: null }).enabled, false)
})
for (const field of ['access', 'storage', 'history', 'publication', 'commercialUse'] as const) {
  test(`unknown or restricted ${field} blocks source and queue`, () => {
    for (const permission of ['UNKNOWN', 'RESTRICTED'] as const) {
      const denied = { ...source, permissions: { ...source.permissions, [field]: permission } }
      const p = freezePlan([candidate()], createRegistry([denied]), asOf)
      const internal = field === 'publication' || field === 'commercialUse'
      assert.equal(p.queue.length, internal ? 1 : 0); assert.equal(p.blocked.length, internal ? 0 : 1)
      assert.equal(sourceGate(denied).enabled, false)
      if (internal) {
        const decision = evaluateEligibility(p.queue[0], denied, asOf)
        assert.equal(decision.reviewEligible, true)
        assert.equal(decision.publicationAllowed, false)
        assert.equal(decision.currentEligible, false)
      }
    }
  })
}
test('registry deterministic, duplicate sources and missing permissions rejected', () => {
  const second = { ...source, id: 'another-source' }
  assert.deepEqual(createRegistry([second, source]), createRegistry([source, second]))
  assert.throws(() => createRegistry([source, source]), /DUPLICATE/)
  const bad = structuredClone(source); delete (bad.permissions as Partial<Source['permissions']>).history
  assert.throws(() => createRegistry([bad]), /PERMISSIONS/)
})
test('unknown provider and version mismatch disabled, not silently mapped', () => {
  const a = candidate(), b = candidate(2); a.sourceId = 'unknown'; b.sourceVersion = 'v2'
  const p = planOf([a, b]); assert.equal(p.queue.length, 0)
  assert.deepEqual(p.blocked.map(x => x.reasons[0]), ['SOURCE_UNKNOWN', 'SOURCE_VERSION_MISMATCH'])
})
test('deterministic priority changes/conflicts/missing/near/general, ties by Player.id', () => {
  const items = Array.from({ length: 6 }, (_, i) => candidate(i + 1))
  items[0].input.contract.contractUntil = { value: '2031', datePrecision: 'YEAR' }
  items[1].signals.missingContract = true
  items[2].signals.newChange = true
  items[3].signals.conflict = true
  const p = planOf(items)
  assert.deepEqual(p.queue.map(x => x.requestId), ['request-0003', 'request-0004', 'request-0002', 'request-0005', 'request-0006', 'request-0001'])
  assert.deepEqual(p, planOf([...items].reverse()))
})
test('partial-date priority does not alter fact or exercise option', () => {
  const c = candidate(); c.input.periodQualifier = { kind: 'SEASON_END', sourceText: 'through season 2027', sourceReference: 'synthetic/period' }
  const job = planOf([c]).queue[0]
  assert.equal(job.priority, 3); assert.deepEqual(job.input.contract.contractUntil, c.input.contract.contractUntil)
  assert.equal(job.input.contract.extensionOptions?.[0].until.value, '2028')
})
test('freeze deduplicates identical request; conflicting payload or reassigned event rejected', () => {
  const c = candidate(); assert.equal(planOf([c, structuredClone(c)]).queue.length, 1)
  const changed = structuredClone(c); changed.input.contract.contractUntil = { value: '2030', datePrecision: 'YEAR' }
  assert.throws(() => planOf([c, changed]), /REQUEST_ID_COLLISION/)
  assert.throws(() => planOf([c, { ...c, requestId: 'another-request' }]), /EVENT_REASSIGNED/)
})
test('batches max 100 preserve frozen order, resumed batch stops at original boundary', () => {
  const p = planOf(Array.from({ length: 205 }, (_, i) => candidate(i)))
  assert.equal(nextBatch(p, 0).length, 100); assert.equal(nextBatch(p, 25).length, 75)
  assert.equal(nextBatch(p, 100).length, 100); assert.equal(nextBatch(p, 200).length, 5)
  assert.deepEqual(nextBatch(p, 100), p.queue.slice(100, 200))
  assert.throws(() => nextBatch(p, -1), /CURSOR/)
})
test('checkpoint at 25/50/75/100 and final remainder', () => {
  const p = planOf(Array.from({ length: 103 }, (_, i) => candidate(i)))
  const r = run(p)
  assert.deepEqual(r.checkpoints.map(c => c.cursor), [0, 25, 50, 75, 100, 103])
  for (const cp of r.checkpoints) assert.equal(cp.prefixHash, hash(r.receipts.slice(0, cp.cursor)))
})
test('interruption and serialized resume exactly equal uninterrupted replay', () => {
  const p = planOf(Array.from({ length: 31 }, (_, i) => candidate(i)))
  const partial = run(p, startReplay(p), 27)
  const stopped = replayStep(p, partial, registry, outcome(p, 27, 'INTERRUPTED'))
  assert.deepEqual(stopped, partial)
  assert.deepEqual(run(p, JSON.parse(JSON.stringify(stopped))), run(p))
})
test('repeated delivery idempotent; request ID payload divergence rejected', () => {
  const p = planOf(), first = run(p)
  assert.deepEqual(replayStep(p, first, registry, outcome(p, 0)), first)
  assert.throws(() => replayStep(p, first, registry, { ...outcome(p, 0), payloadHash: 'wrong' }), /COLLISION/)
})
test('uncertain outcome stops replay and stays blocked without reconciliation', () => {
  const p = planOf([candidate(), candidate(2)])
  const uncertain = replayStep(p, startReplay(p), registry, outcome(p, 0, 'UNCERTAIN'))
  assert.equal(uncertain.cursor, 0); assert.equal(uncertain.receipts.length, 0)
  assert.throws(() => replayStep(p, uncertain, registry, outcome(p, 0)), /RECONCILIATION_REQUIRED/)
  assert.throws(() => replayStep(p, uncertain, registry, outcome(p, 1)), /RECONCILIATION_REQUIRED/)
  assert.deepEqual(reconcileReplay(p, uncertain, registry, { requestId: p.queue[0].requestId, reference: 'synthetic/reconcile', outcome: 'STILL_UNKNOWN' }), uncertain)
})
test('reconcile applied requires exact preserved receipt, never creates new timestamp', () => {
  const p = planOf(), receipt = simulateReceipt(p, 0, registry)
  const uncertain = replayStep(p, startReplay(p), registry, outcome(p, 0, 'UNCERTAIN'))
  const recovered = reconcileReplay(p, uncertain, registry, { requestId: receipt.requestId, reference: 'synthetic/reconcile', outcome: 'APPLIED', receipt })
  assert.equal(recovered.cursor, 1); assert.deepEqual(recovered.receipts[0], receipt)
  assert.equal(recovered.receipts[0].observation?.observedAt, '2026-10-08T12:00:00.000Z')
  const tampered = structuredClone(receipt); tampered.observation!.observedAt = '2026-10-09T00:00:00Z'
  assert.throws(() => reconcileReplay(p, uncertain, registry, { requestId: receipt.requestId, reference: 'synthetic/reconcile', outcome: 'APPLIED', receipt: tampered }), /DIVERGENCE/)
})
test('reconcile not-applied permits one explicit replay of original evidence', () => {
  const p = planOf(), u = replayStep(p, startReplay(p), registry, outcome(p, 0, 'UNCERTAIN'))
  const ready = reconcileReplay(p, u, registry, { requestId: p.queue[0].requestId, reference: 'synthetic/reconcile', outcome: 'NOT_APPLIED' })
  assert.equal(ready.cursor, 0); assert.equal(ready.uncertain, null)
  assert.deepEqual(run(p, ready).receipts, run(p).receipts)
  assert.throws(() => reconcileReplay(p, u, registry, { requestId: 'wrong', reference: 'synthetic/reconcile', outcome: 'NOT_APPLIED' }), /UNCERTAIN/)
})
test('tampered plan/checkpoint, changed registry and out-of-order execution rejected', () => {
  const p = planOf([candidate(), candidate(2)]), r = startReplay(p)
  const changed = structuredClone(p); changed.queue.reverse()
  assert.throws(() => replayStep(changed, r, registry, outcome(p, 0)), /PLAN_CHANGED/)
  const invalid = structuredClone(r); invalid.checkpoints[0].prefixHash = 'wrong'
  assert.throws(() => replayStep(p, invalid, registry, outcome(p, 0)), /REPLAY_CHANGED/)
  const changedRegistry = createRegistry([{ ...source, policyVersion: 'v2' }])
  assert.throws(() => replayStep(p, r, changedRegistry, outcome(p, 0)), /REGISTRY_CHANGED/)
  assert.throws(() => replayStep(p, r, registry, outcome(p, 1)), /OUT_OF_ORDER/)
})
test('HIGH and temporal link mandatory; club conflict distinct from contract event', () => {
  for (const link of ['UNKNOWN', 'CLUB_CONFLICT'] as const) {
    const c = candidate(); c.temporalLink = link
    const result = run(planOf([c])).receipts[0]
    assert.equal(result.observation, null); assert.equal(result.decision.reviewEligible, false)
  }
  const c = candidate(); c.input.contract.identityConfidence = 'MEDIUM'
  assert.ok(run(planOf([c])).receipts[0].decision.reasons.includes('IDENTITY_NOT_HIGH'))
})
test('source authorization does not replace evidence license or provider identity', () => {
  const c = candidate(); c.input.contract.provenance.rights = 'UNKNOWN'
  assert.ok(run(planOf([c])).receipts[0].decision.reasons.includes('EVIDENCE_RIGHTS_UNRESOLVED'))
  c.input.contract.provider = 'OTHER'
  assert.ok(run(planOf([c])).receipts[0].decision.reasons.includes('SOURCE_CONTEXT_MISMATCH'))
})
for (const kind of ['RENEWAL', 'TRANSFER', 'TERMINATION'] as const) {
  test(`${kind} preserves prior receipt, marks old target historical, selects no current`, () => {
    const c = candidate()
    c.input.events = [{ ...c.expected, targetContentHash: prepare(c.input.contract, c.expected).contentHash,
      kind, sourceReference: 'synthetic/change', observedAt: '2026-10-08T14:00:00Z', publishedAt: unknown,
      providerEffectiveAt: '2026-10-08T14:00:00Z', evidenceStatus: 'OFFICIAL_EXPLICIT',
      newClubId: kind === 'TRANSFER' ? 'synthetic-other-club' : null,
      newUntil: kind === 'RENEWAL' ? { value: '2029', datePrecision: 'YEAR' } : unknown, optionIndex: null }]
    const result = run(planOf([c])).receipts[0]
    assert.equal(result.observation, null); assert.equal(result.decision.temporal?.assessment, 'HISTORICAL_ONLY')
    assert.equal(result.decision.temporal?.data.contract.contractUntil.value, '2027')
    assert.equal(result.decision.temporal?.data.contract.clubId, c.expected.clubId)
    assert.equal(result.decision.currentEligible, false)
  })
}
test('missing original timestamp, unknown expiry and affiliation-only evidence abstain', () => {
  const a = candidate(), b = candidate(2), c = candidate(3)
  a.input.contract.observedAt = null as unknown as string
  b.input.contract.contractUntil = unknown
  c.input.verification!.scope = 'AFFILIATION_ONLY'
  const receipts = run(planOf([a, b, c])).receipts
  assert.ok(receipts.every(r => r.observation === null && !r.decision.reviewEligible))
})
test('DAY/MONTH/YEAR, options and unknown clauses preserved in offline receipts', () => {
  for (const date of [{ value: '2027-06-30', datePrecision: 'DAY' }, { value: '2027-06', datePrecision: 'MONTH' }, { value: '2027', datePrecision: 'YEAR' }] as const) {
    const c = candidate(); c.input.contract.contractUntil = date
    const r = run(planOf([c])).receipts[0]
    assert.ok(r.observation); assert.deepEqual(r.decision.temporal?.data.contract.contractUntil, date)
    assert.equal(r.decision.temporal?.data.contract.extensionOptions?.[0].until.value, '2028')
    assert.equal(r.decision.temporal?.data.contract.releaseClause.status, 'UNKNOWN')
    assert.equal(r.decision.publicationAllowed, false)
  }
})
test('new real-supplied observation time reuses state; replay never advances clock', () => {
  const a = candidate(), b = structuredClone(a)
  b.requestId = 'request-second'; b.eventId = 'event-second'
  b.input.contract.observedAt = '2026-10-08T13:00:00Z'; b.input.verification!.at = '2026-10-08T14:00:00Z'
  const r = run(planOf([a, b]))
  assert.equal(r.receipts[0].observation?.stateHash, r.receipts[1].observation?.stateHash)
  assert.notEqual(r.receipts[0].observation?.observationHash, r.receipts[1].observation?.observationHash)
})
test('deterministic hashes, no input mutation or shared references', () => {
  const c = candidate(), before = structuredClone(c), p = planOf([c])
  const first = run(p); assert.deepEqual(first, run(p)); assert.deepEqual(c, before)
  first.receipts[0].decision.reasons.push('changed')
  assert.deepEqual(c, before); assert.notDeepEqual(first, run(p))
  const reordered = Object.fromEntries(Object.entries(c).reverse()) as Candidate
  assert.equal(planOf([reordered]).planHash, p.planHash)
})
test('offline state fingerprint includes qualifiers, not repeated observation time', () => {
  const c = candidate(), p = planOf([c]), before = simulateReceipt(p, 0, registry)
  c.input.periodQualifier = { kind: 'SEASON_END', sourceText: 'synthetic season end', sourceReference: 'synthetic/qualifier' }
  const after = simulateReceipt(planOf([c]), 0, registry)
  assert.notEqual(before.observation?.stateHash, after.observation?.stateHash)
  assert.equal(before.decision.temporal?.legacyContentHash, after.decision.temporal?.legacyContentHash)
})
test('source rights are rechecked by eligibility, no enabled flag bypass', () => {
  const job = planOf().queue[0]
  const denied = { ...source, permissions: { ...source.permissions, storage: 'UNKNOWN' as const } }
  assert.equal(evaluateEligibility(job, denied, asOf).reviewEligible, false)
})
