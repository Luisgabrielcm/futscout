import test from 'node:test'
import assert from 'node:assert/strict'
import { ImmutableEvidenceCatalog, type EvidenceInput } from './evidence-catalog'
import { createRegistry, operationGate, sourceGate, syncVersion, type Source } from './source-registry'
import { hash } from './contract'
import { proposeContractWrite, proposeContractWriteWithPrecision, precisionBridgeVersion, reconcileContractWrite, runContractProposal, type ReadBack, type BridgeReview } from './economic-bridge'
import { economicFingerprint } from '../../lib/economicData/value'
import { DurableContractAttempt } from './durable-reconciliation'
import { freezePlan } from './planner'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const source: Source = { id: 'synthetic', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'policy1', permissionReference: 'synthetic/license',
  permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'CONFIRMED', commercialUse: 'CONFIRMED' } }
function fixture(change?: (e: EvidenceInput) => void, s = source) {
  const registry = createRegistry([s])
  const evidence: EvidenceInput = { evidenceId: 'e1', sourceId: s.id, sourceReference: 'synthetic/announcement', sourceUrl: null,
    sourceType: 'SYNTHETIC', sourcePolicyVersion: 'policy1', playerId: 'player1', clubId: 'club1', context: 'REAL_WORLD', season: '2026',
    publishedAt: { value: '2026', datePrecision: 'YEAR' }, observedAt: '2026-10-08T12:00:00Z', observationProofRef: 'synthetic/capture',
    providerEffectiveAt: null, eventType: 'CONTRACT', facts: { signedAt: { value: null, datePrecision: 'UNKNOWN' },
      contractUntil: { value: '2027-06-30', datePrecision: 'DAY' }, contractStatus: 'UNKNOWN', extensionOptions: null,
      releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } },
    periodQualifier: null, evidenceStatus: 'OFFICIAL_EXPLICIT', identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC', supersedesEvidenceId: null }
  change?.(evidence)
  const catalog = new ImmutableEvidenceCatalog(registry), e = catalog.append(evidence)
  const review: BridgeReview = { playerId: e.playerId, clubId: e.clubId, context: e.context, season: e.season,
    evidenceRecordHash: e.recordHash, providerPlayerId: 'provider-player1', identityConfidence: 'HIGH', identityProofRef: 'synthetic/identity',
    clubProofRef: 'synthetic/club', providerIdentityProofRef: 'synthetic/provider-identity', observationProofRef: e.observationProofRef,
    observedAt: e.observedAt, temporalLink: 'CONSISTENT', reviewedAt: '2026-10-09T12:00:00Z' }
  const catalogJson = catalog.exportJson()
  return { catalog, evidence, args: { catalogJson, catalogHash: JSON.parse(catalogJson).artifactHash as string, registry,
    evidenceId: e.evidenceId, evidenceRef: catalog.evidenceRef(e.evidenceId).evidenceRef, review } }
}
function found(p: ReturnType<typeof proposeContractWrite>): ReadBack {
  return { kind: 'FOUND', stateId: 'state1', observationId: 'obs1', requestId: p.command.requestId,
    observedAt: p.command.observedAt, state: structuredClone(p.command.state), contentHash: p.contentHash }
}
test('valid DAY history-only proposal deterministic, no invented timestamp or clause write', () => {
  const { args } = fixture(), p = proposeContractWrite(args)
  assert.deepEqual(proposeContractWrite(args), p)
  assert.equal(p.command.selectCurrent, false); assert.equal(p.command.expectedRevision, null)
  assert.equal(p.command.observedAt, args.review.observedAt)
  assert.equal(p.command.state.field, 'CONTRACT_UNTIL'); assert.equal(p.command.state.amount, null)
  assert.equal(p.command.state.providerEffectiveAt, null)
})
test('identity, club, temporal link and original observation proof required', () => {
  for (const patch of [{ identityConfidence: 'MEDIUM' }, { clubId: 'other' }, { playerId: 'other' },
    { temporalLink: 'UNKNOWN' }, { observationProofRef: 'other' }, { observedAt: '2026-10-09T12:00:00Z' },
    { clubProofRef: '' }, { providerIdentityProofRef: '' }, { reviewedAt: '2026-10-07T12:00:00Z' }] as const) {
    const { args } = fixture(); Object.assign(args.review, patch)
    assert.throws(() => proposeContractWrite(args))
  }
  assert.throws(() => proposeContractWrite(fixture(e => { e.identityConfidence = 'LOW' }).args), /IDENTITY/)
})
test('rights UNKNOWN/RESTRICTED blocked without upgrading catalog permissions', () => {
  for (const status of ['UNKNOWN','RESTRICTED'] as const) {
    for (const field of ['access','storage','history'] as const) {
      assert.throws(() => proposeContractWrite(fixture(undefined, { ...source, permissions: { ...source.permissions, [field]: status } }).args))
    }
  }
})

test('internal storage accepts restricted publication without permitting publication or current', () => {
  for (const status of ['UNKNOWN', 'RESTRICTED', 'CONFIRMED'] as const) {
    const s = { ...source, permissions: { ...source.permissions, publication: status, commercialUse: status } }
    const { args, catalog, evidence } = fixture(undefined, s)
    const proposal = proposeContractWrite(args)
    assert.equal(proposal.command.selectCurrent, false)
    assert.equal(operationGate(s, 'PUBLISH').enabled, status === 'CONFIRMED')
    assert.deepEqual(catalog.append(evidence), catalog.get(evidence.evidenceId))
    assert.deepEqual(proposeContractWrite(args), proposal)
    assert.equal(catalog.evidenceRef(evidence.evidenceId).publicationAllowed, false)
  }
})

test('legacy registry hashes and catalog round trips remain unchanged', () => {
  const s = { ...source, permissions: { ...source.permissions, publication: 'RESTRICTED' as const } }
  const registry = createRegistry([s])
  const entries = [{ source: structuredClone(s), ...sourceGate(s) }]
  assert.equal(registry.registryHash, hash({ syncVersion, entries }))
  assert.equal(registry.entries[0].enabled, false)
  assert.equal(operationGate(s, 'INTERNAL').enabled, true)
  const { args } = fixture(undefined, s)
  assert.equal(ImmutableEvidenceCatalog.restore(args.catalogJson, registry, args.catalogHash).exportJson(), args.catalogJson)
})
test('invalid evidence reference or artifact rejected', () => {
  const { args } = fixture(); args.evidenceRef = 'catalog/wrong'
  assert.throws(() => proposeContractWrite(args), /REF_MISMATCH/)
  const other = fixture().args; other.catalogHash = '0'.repeat(64)
  assert.throws(() => proposeContractWrite(other), /INTEGRITY/)
})
test('MONTH YEAR unknown and clause/transfer events unsupported', () => {
  for (const date of [{ value: '2027', datePrecision: 'YEAR' }, { value: '2027-06', datePrecision: 'MONTH' },
    { value: null, datePrecision: 'UNKNOWN' }] as const)
    assert.throws(() => proposeContractWrite(fixture(e => { e.facts.contractUntil = date }).args), /DAY_PRECISION/)
  for (const event of ['CLAUSE','TRANSFER','TERMINATION','OPTION'] as const)
    assert.throws(() => proposeContractWrite(fixture(e => { e.eventType = event }).args), /UNSUPPORTED_EVENT/)
})
test('catalog conflicts and insufficient terms block proposals', () => {
  const { catalog, evidence, args } = fixture()
  catalog.append({ ...evidence, evidenceId: 'e2', clubId: 'other' })
  args.catalogJson = catalog.exportJson(); args.catalogHash = JSON.parse(args.catalogJson).artifactHash
  assert.throws(() => proposeContractWrite(args), /EVIDENCE_CONFLICT/)
  assert.throws(() => proposeContractWrite(fixture(e => { e.evidenceStatus = 'PROVISIONAL' }).args), /INSUFFICIENT/)
})
test('read-back compares content, request, observation time and hash', () => {
  const p = proposeContractWrite(fixture().args)
  assert.equal(reconcileContractWrite(p, found(p)).status, 'CONFIRMED')
  for (const patch of [{ contentHash: 'bad' }, { requestId: 'other' }, { observedAt: '2026-10-07T12:00:00Z' },
    { state: { ...p.command.state, contractUntil: '2028-06-30' } }])
    assert.equal(reconcileContractWrite(p, { ...found(p), ...patch } as ReadBack).status, 'CONFLICT')
})
test('write once then confirmed replay never calls writer again', async () => {
  const p = proposeContractWrite(fixture().args); let result: ReadBack = { kind: 'ABSENT', transactionsSettled: true }, writes = 0
  const ports = { readBack: async () => result, writer: async (command: typeof p.command) => {
    writes++; assert.equal(command.selectCurrent, false); assert.deepEqual(command, p.command)
    result = found(p); return { stateId: 'state1', observationId: 'obs1' }
  } }
  assert.equal((await runContractProposal(p, ports)).status, 'CONFIRMED')
  assert.equal((await runContractProposal(p, ports)).status, 'CONFIRMED'); assert.equal(writes, 1)
})
test('mock rollback remains absent; no retry or observation invented', async () => {
  const p = proposeContractWrite(fixture().args); let writes = 0
  const result = await runContractProposal(p, { readBack: async () => ({ kind: 'ABSENT', transactionsSettled: true }),
    writer: async () => { writes++; throw new Error('ROLLBACK') } })
  assert.equal(result.status, 'NOT_PROCESSED'); assert.equal(writes, 1)
})
test('uncertain before write blocks; uncertain after write requires reconciliation', async () => {
  const p = proposeContractWrite(fixture().args); let writes = 0, reads = 0
  const writer = async () => { writes++; throw new Error('TRANSPORT') }
  assert.equal((await runContractProposal(p, { writer, readBack: async () => ({ kind: 'INDETERMINATE' }) })).status, 'INDETERMINATE')
  assert.equal(writes, 0)
  assert.equal((await runContractProposal(p, { writer, readBack: async () => ++reads === 1 ?
    { kind: 'ABSENT', transactionsSettled: true } : { kind: 'INDETERMINATE' } })).status, 'INDETERMINATE')
  assert.equal(writes, 1)
})
test('uniqueness error is not success without exact read-back', async () => {
  const p = proposeContractWrite(fixture().args)
  for (const outcome of ['INDETERMINATE','CONFIRMED','CONFLICT'] as const) {
    let reads = 0
    const result = await runContractProposal(p, { writer: async () => { throw new Error('P2002') }, readBack: async () => {
      if (++reads === 1) return { kind: 'ABSENT', transactionsSettled: true }
      return outcome === 'INDETERMINATE' ? { kind: 'INDETERMINATE' } : outcome === 'CONFIRMED' ? found(p) : { ...found(p), contentHash: 'bad' } as ReadBack
    } })
    assert.equal(result.status, outcome)
  }
})
test('selectCurrent=true forbidden even if caller recomputes proposal hash', async () => {
  const p = proposeContractWrite(fixture().args); p.command.selectCurrent = true
  const { proposalHash, ...body } = p; void proposalHash; p.proposalHash = hash(body)
  await assert.rejects(runContractProposal(p, { readBack: async () => { throw new Error('SHOULD_NOT_READ') },
    writer: async () => { throw new Error('SHOULD_NOT_WRITE') } }), /UNSAFE_WRITE/)
})
test('acknowledged write with absent or different IDs is conflict', async () => {
  const p = proposeContractWrite(fixture().args)
  for (const absent of [true,false]) {
    let reads = 0
    assert.equal((await runContractProposal(p, { writer: async () => ({ stateId: 'other', observationId: 'other' }),
      readBack: async () => ++reads === 1 || absent ? { kind: 'ABSENT', transactionsSettled: true } : found(p) })).status, 'CONFLICT')
  }
})

test('precision-aware DAY entry point preserves the exact v0.1 proposal and request hashes', () => {
  const { args } = fixture()
  assert.deepEqual(proposeContractWriteWithPrecision(args), proposeContractWrite(args))
})

for (const date of [{ value: '2027-06', datePrecision: 'MONTH' }, { value: '2027', datePrecision: 'YEAR' }] as const) {
  test(`${date.datePrecision}: reviewed evidence maps to existing storage with source precision and provenance intact`, () => {
    const { args, catalog } = fixture(e => { e.facts.contractUntil = date })
    const before = catalog.exportJson(), p = proposeContractWriteWithPrecision(args), state = p.command.state
    assert.equal(p.bridgeVersion, precisionBridgeVersion)
    assert.equal(state.contractUntil, date.datePrecision === 'MONTH' ? '2027-06-01' : '2027-01-01')
    assert.equal(state.datePrecision, date.datePrecision)
    assert.equal(state.metadata.evidenceRef, args.evidenceRef)
    assert.equal(state.providerPlayerId, args.review.providerPlayerId)
    assert.equal(p.command.observedAt, args.review.observedAt)
    assert.equal(state.providerEffectiveAt, null)
    assert.equal(state.amount, null)
    assert.equal(p.command.selectCurrent, false)
    assert.equal(p.contentHash, economicFingerprint(state))
    assert.deepEqual(p, proposeContractWriteWithPrecision(args))
    assert.equal(catalog.exportJson(), before)
    assert.equal(reconcileContractWrite(p, found(p)).status, 'CONFIRMED')
    assert.equal(reconcileContractWrite(p, { ...found(p), state: { ...state, datePrecision: 'DAY' } } as ReadBack).status, 'CONFLICT')
  })

  test(`${date.datePrecision}: existing durable coordinator dispatches once, preserves partial source date and recovers after restart`, async () => {
    const { args, evidence } = fixture(e => { e.facts.contractUntil = date })
    const p = proposeContractWriteWithPrecision(args), s = p.command.state
    const evaluationAt = new Date(args.review.reviewedAt).toISOString()
    const expected = { playerId: evidence.playerId, clubId: evidence.clubId, context: evidence.context, season: evidence.season }
    const plan = freezePlan([{ requestId: p.command.requestId, eventId: evidence.evidenceId, sourceId: evidence.sourceId,
      sourceVersion: 'v1', expected, temporalLink: 'CONSISTENT', signals: { newChange: true, conflict: false, missingContract: true },
      input: { contract: { ...expected, ...evidence.facts, provider: s.provider, sourceReference: args.evidenceRef,
        observedAt: p.command.observedAt, providerEffectiveAt: null, identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC',
        provenance: { evidenceReference: args.evidenceRef, rights: 'AUTHORIZED', synthetic: true } },
        publishedAt: evidence.publishedAt!, periodQualifier: null, competitionCalendar: null, evidenceStatus: 'OFFICIAL_EXPLICIT',
        verification: { at: args.review.reviewedAt, sourceReference: 'synthetic/review', scope: 'CONTRACT_TERMS', outcome: 'CORROBORATED' }, events: [] } }],
    args.registry, evaluationAt)
    let stored: ReadBack = { kind: 'ABSENT', transactionsSettled: true }, writes = 0
    const ports = { readBack: async () => stored, writer: async (command: typeof p.command) => {
      writes++; assert.deepEqual(command, p.command); assert.equal(command.selectCurrent, false)
      stored = found(p); return { stateId: 'state1', observationId: 'obs1' }
    } }
    const root = await mkdtemp(join(tmpdir(), 'futscout-contract-precision-'))
    try {
      let attempt = await DurableContractAttempt.open(root, p, plan, args.registry, ports)
      try { assert.equal((await attempt.execute()).status, 'CONFIRMED') } finally { await attempt.close() }
      attempt = await DurableContractAttempt.open(root, p, plan, args.registry, ports)
      try { assert.equal((await attempt.execute()).status, 'CONFIRMED') } finally { await attempt.close() }
      assert.equal(writes, 1)
      assert.deepEqual(plan.queue[0].input.contract.contractUntil, date)
      const forged = structuredClone(plan)
      forged.queue[0].input.contract.contractUntil = { value: s.contractUntil!, datePrecision: 'DAY' }
      // Re-freeze legitimately shaped but precision-divergent input; the link still must reject it.
      const changed = freezePlan(forged.queue, args.registry, evaluationAt)
      await assert.rejects(DurableContractAttempt.open(root, p, changed, args.registry, ports), /PROPOSAL_PLAN_MISMATCH/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
}

test('partial precision does not waive rights, identity, time, real-world context, unknown dates or event restrictions', () => {
  for (const patch of [{ identityConfidence: 'LOW' }, { clubId: 'other' }, { temporalLink: 'UNKNOWN' },
    { observationProofRef: 'other' }, { reviewedAt: '2026-10-07T12:00:00Z' }] as const) {
    const { args } = fixture(e => { e.facts.contractUntil = { value: '2027', datePrecision: 'YEAR' } })
    Object.assign(args.review, patch)
    assert.throws(() => proposeContractWriteWithPrecision(args))
  }
  for (const change of [
    (e: EvidenceInput) => { e.facts.contractUntil = { value: null, datePrecision: 'UNKNOWN' } },
    (e: EvidenceInput) => { e.context = 'EA_CAREER' },
    (e: EvidenceInput) => { e.eventType = 'OPTION' },
    (e: EvidenceInput) => { e.eventType = 'CLAUSE' },
    (e: EvidenceInput) => { e.facts.contractStatus = 'INACTIVE' },
    (e: EvidenceInput) => { e.evidenceStatus = 'PROVISIONAL' },
    (e: EvidenceInput) => { e.providerEffectiveAt = '2026-10-10T12:00:00Z' },
  ]) assert.throws(() => proposeContractWriteWithPrecision(fixture(e => {
    e.facts.contractUntil = { value: '2027', datePrecision: 'YEAR' }; change(e)
  }).args))
  for (const permission of ['access', 'storage', 'history'] as const) {
    assert.throws(() => fixture(undefined, { ...source, permissions: { ...source.permissions, [permission]: 'UNKNOWN' } }))
  }
})
