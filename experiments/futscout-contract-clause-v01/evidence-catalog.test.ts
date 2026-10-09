import test from 'node:test'
import assert from 'node:assert/strict'
import { hash } from './contract'
import { createRegistry, type Source } from './source-registry'
import { ImmutableEvidenceCatalog as Catalog, type EvidenceInput } from './evidence-catalog'
import { freezePlan } from './planner'
import { replayStep, startReplay, simulateReceipt } from './replay'

const source: Source = { id: 'synthetic', provider: 'SYNTHETIC', sourceVersion: 'v1', policyVersion: 'policy1',
  permissionReference: 'synthetic/license', permissions: { access: 'CONFIRMED', storage: 'CONFIRMED', history: 'CONFIRMED', publication: 'UNKNOWN', commercialUse: 'UNKNOWN' } }
const registry = createRegistry([source])
const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
function input(id = 'e1'): EvidenceInput {
  return { evidenceId: id, sourceId: 'synthetic', sourceReference: 'synthetic/source', sourceUrl: 'https://example.org/contract',
    sourceType: 'SYNTHETIC', sourcePolicyVersion: 'policy1', playerId: 'p1', clubId: 'c1', context: 'REAL_WORLD', season: '2026',
    publishedAt: { value: '2026', datePrecision: 'YEAR' }, observedAt: '2026-10-08T12:00:00Z', observationProofRef: 'synthetic/receipt',
    providerEffectiveAt: null, eventType: 'CONTRACT', facts: { signedAt: unknown, contractUntil: { value: '2027', datePrecision: 'YEAR' },
      contractStatus: 'UNKNOWN', extensionOptions: null, releaseClause: { status: 'UNKNOWN', amount: null, currency: null,
        clauseType: null, activationConditions: null, sourceReference: null, explicitEvidence: null } }, periodQualifier: null,
    evidenceStatus: 'OFFICIAL_EXPLICIT', identityConfidence: 'HIGH', evidenceQuality: 'SYNTHETIC', supersedesEvidenceId: null }
}
test('valid evidence; separate permissions, original date and immutable copies', () => {
  const c = new Catalog(registry), record = c.append(input())
  assert.equal(record.permissions.publication, 'UNKNOWN'); assert.equal(registry.entries[0].enabled, false)
  assert.equal(record.observedAt, '2026-10-08T12:00:00.000Z')
  record.facts.contractStatus = 'ACTIVE'
  assert.equal(c.get('e1')?.facts.contractStatus, 'UNKNOWN')
  assert.equal(c.evidenceRef('e1').currentEligible, false)
})
for (const permission of ['access','storage','history'] as const) test(`blocks ${permission} UNKNOWN/RESTRICTED`, () => {
  for (const value of ['UNKNOWN','RESTRICTED'] as const) {
    const r = createRegistry([{ ...source, permissions: { ...source.permissions, [permission]: value } }])
    assert.throws(() => new Catalog(r).append(input()), /PERMISSION_/)
  }
})
test('unknown source and wrong policy not promoted', () => {
  assert.throws(() => new Catalog(createRegistry([])).append(input()), /SOURCE_UNKNOWN/)
  const e = input(); e.sourcePolicyVersion = 'policy2'
  assert.throws(() => new Catalog(registry).append(e), /POLICY_VERSION/)
})
test('dedup content retains original observation; same ID is immutable', () => {
  const c = new Catalog(registry), a = c.append(input())
  assert.deepEqual(c.append(input()), a)
  const b = input('e2'); b.observedAt = '2026-10-09T12:00:00Z'
  assert.deepEqual(c.append(b), a); assert.equal(c.get('e2'), null)
  const changed = input(); changed.facts.contractUntil = { value: '2028', datePrecision: 'YEAR' }
  assert.throws(() => c.append(changed), /IMMUTABLE/)
})
test('updates append, preserve parent, flag differing terms; reject missing parent', () => {
  const c = new Catalog(registry), a = c.append(input()), b = input('e2')
  b.supersedesEvidenceId = 'e1'; b.eventType = 'RENEWAL'; b.facts.contractUntil = { value: '2028', datePrecision: 'YEAR' }
  c.append(b); assert.deepEqual(c.get('e1'), a); assert.equal(c.conflicts()[0].reason, 'DIFFERENT_TERMS_REQUIRE_REVIEW')
  b.evidenceId = 'e3'; b.supersedesEvidenceId = 'missing'
  assert.throws(() => c.append(b), /PREVIOUS_EVIDENCE/)
})
test('cross-player references and club changes rejected except explicit transfer', () => {
  const c = new Catalog(registry); c.append(input())
  const b = input('e2'); b.supersedesEvidenceId = 'e1'; b.playerId = 'other'
  assert.throws(() => c.append(b), /CONTEXT_MISMATCH/)
  b.playerId = 'p1'; b.clubId = 'other'
  assert.throws(() => c.append(b), /CLUB_CHANGE/)
  b.eventType = 'TRANSFER'; c.append(b)
  assert.equal(c.conflicts()[0].reason, 'CLUB_CONTEXT_REVIEW')
})
test('self cycle and multi-record cycle rejected even with recomputed artifact hash', () => {
  const e = input(); e.supersedesEvidenceId = 'e1'
  assert.throws(() => new Catalog(registry).append(e), /CYCLE/)
  const c = new Catalog(registry); c.append(input()); const b = input('e2'); b.supersedesEvidenceId = 'e1'; c.append(b)
  const data = JSON.parse(c.exportJson()); data.records[0].supersedesEvidenceId = 'e2'
  const { artifactHash: old, ...body } = data; void old
  const digest = hash(body)
  assert.throws(() => Catalog.restore(JSON.stringify({ ...body, artifactHash: digest }), registry, digest), /CYCLE/)
})
test('timestamps required and publication cannot follow observation', () => {
  for (const timestamp of ['', '2026-02-30T12:00:00Z', '2026-10-08T25:00:00Z']) {
    const e = input(); e.observedAt = timestamp
    assert.throws(() => new Catalog(registry).append(e))
  }
  const e = input(); e.publishedAt = { value: '2027', datePrecision: 'YEAR' }
  assert.throws(() => new Catalog(registry).append(e), /PUBLICATION_AFTER/)
  e.publishedAt = null; assert.equal(new Catalog(registry).append(e).publishedAt, null)
})
test('DAY MONTH YEAR UNKNOWN precision and summer retained', () => {
  for (const date of [{ value: '2027-06-30', datePrecision: 'DAY' }, { value: '2027-06', datePrecision: 'MONTH' },
    { value: '2027', datePrecision: 'YEAR' }, unknown] as const) {
    const e = input(); e.facts.contractUntil = date
    e.periodQualifier = { kind: 'SUMMER', sourceText: 'summer', sourceReference: 'synthetic/period' }
    assert.deepEqual(new Catalog(registry).append(e).facts.contractUntil, date)
  }
})
test('reject extra payload, long text, credential URL and query/fragment', () => {
  assert.throws(() => new Catalog(registry).append({ ...input(), rawArticle: 'text' } as EvidenceInput), /UNEXPECTED_FIELDS/)
  const e = input(); e.periodQualifier = { kind: 'OTHER', sourceText: 'x'.repeat(201), sourceReference: 'synthetic/period' }
  assert.throws(() => new Catalog(registry).append(e), /LONG_TEXT/)
  for (const url of ['https://u:p@example.org/a','https://example.org/a?key=x','https://example.org/a#secret','http://example.org']) {
    assert.throws(() => new Catalog(registry).append({ ...input(), sourceUrl: url }), /UNSAFE_URL/)
  }
})
test('serialization/replay deterministic; corruption, hash mismatch, forged record rejected', () => {
  const c = new Catalog(registry); c.append(input())
  const json = c.exportJson(), digest = JSON.parse(json).artifactHash
  assert.equal(Catalog.restore(json, registry, digest).exportJson(), json)
  assert.throws(() => Catalog.restore('{', registry, digest))
  assert.throws(() => Catalog.restore(json, registry, '0'.repeat(64)), /INTEGRITY/)
  const data = JSON.parse(json); data.records[0].contentHash = '0'.repeat(64)
  const { artifactHash: old, ...body } = data; void old
  const changed = hash(body)
  assert.throws(() => Catalog.restore(JSON.stringify({ ...body, artifactHash: changed }), registry, changed), /RECORD_INTEGRITY/)
})
test('evidenceRef fits existing replay/receipt references without modifying historical hashes', () => {
  const r = createRegistry([{ ...source, permissions: { ...source.permissions, publication: 'CONFIRMED', commercialUse: 'CONFIRMED' } }])
  const c = new Catalog(r), e = c.append(input()), ref = c.evidenceRef(e.evidenceId).evidenceRef
  const expected = { playerId: e.playerId, clubId: e.clubId, context: e.context, season: e.season }
  const p = freezePlan([{ requestId: 'req1', eventId: e.evidenceId, sourceId: e.sourceId, sourceVersion: e.sourceVersion, expected,
    temporalLink: 'CONSISTENT', signals: { newChange: true, conflict: false, missingContract: false }, input: {
      contract: { ...expected, ...e.facts, provider: 'SYNTHETIC', sourceReference: ref, observedAt: e.observedAt,
        providerEffectiveAt: e.providerEffectiveAt, identityConfidence: e.identityConfidence, evidenceQuality: e.evidenceQuality,
        provenance: { evidenceReference: ref, rights: 'AUTHORIZED', synthetic: true } },
      publishedAt: e.publishedAt ?? unknown, periodQualifier: e.periodQualifier, competitionCalendar: null,
      evidenceStatus: e.evidenceStatus, verification: null, events: [] } }], r, '2026-10-09T12:00:00.000Z')
  const receipt = simulateReceipt(p, 0, r)
  assert.equal(receipt.observation, null) // Catalog entry does not prove current terms.
  const state = replayStep(p, startReplay(p), r, { kind: 'SUCCESS', requestId: 'req1', payloadHash: p.queue[0].payloadHash })
  assert.deepEqual(replayStep(p, state, r, { kind: 'SUCCESS', requestId: 'req1', payloadHash: p.queue[0].payloadHash }), state)
})
