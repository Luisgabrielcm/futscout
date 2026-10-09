import test from 'node:test'
import assert from 'node:assert/strict'
import { ImmutableEvidenceCatalog, type EvidenceInput } from './evidence-catalog'
import { createRegistry, type Source } from './source-registry'
import { hash } from './contract'
import { proposeContractWrite, reconcileContractWrite, runContractProposal, type ReadBack, type BridgeReview } from './economic-bridge'

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
    for (const field of ['access','storage','history','publication','commercialUse'] as const) {
      assert.throws(() => proposeContractWrite(fixture(undefined, { ...source, permissions: { ...source.permissions, [field]: status } }).args))
    }
  }
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
