import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  adoptFootyStatsIdentityOffline as adopt, createFootyStatsOwnershipRegistry as create,
  validateFootyStatsOwnershipRegistry as validate, hashOwnershipDocument, hashOwnershipIdentityInput,
  type FootyStatsOwnershipRegistry, type OwnershipContext, type OwnershipDocument, type OwnershipAdoptionRequest,
} from '../../../services/footyStatsOfflineOwnership'
import type { FootyEvidenceReference, FootyIdentityInput } from '../../../services/footyStatsOfflineIdentityAdapter'

const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const scope = 'synthetic-catalogue-frozen-v1'
const registryId = 'synthetic-ownership'
const date = '2026-01-02T00:00:00Z'
type Purpose = OwnershipContext['verifiedDocuments'][number]['purpose']
function document(id: string, record: object, origin: OwnershipDocument['origin'] = 'INTERNAL_REVIEW') {
  const doc: OwnershipDocument = { id, contents: JSON.stringify({ record }), origin,
    sourceReference: `synthetic:${id}`, observedAt: date }
  const ref: FootyEvidenceReference = { documentId: id, sha256: hash(doc.contents), pointer: '/record' }
  return { doc, ref }
}
function pin(ctx: OwnershipContext, doc: OwnershipDocument, purpose: Purpose): OwnershipContext {
  return { ...ctx, documents: [...ctx.documents, doc], verifiedDocuments: [...ctx.verifiedDocuments,
    { scope, purpose, documentSha256: hashOwnershipDocument(doc) }] }
}
function prepare(registry: FootyStatsOwnershipRegistry, original: OwnershipContext, seed: number) {
  const persons = Array.from({ length: seed }, (_, i) => ({ name: `Synthetic Person ${i + 1}`,
    birth: `2000-01-${String(i + 1).padStart(2, '0')}`, nationality: 'Spain', position: 'MID' }))
  const person = persons[seed - 1], eaId = `ea-${seed}`, footyStatsId = seed + 100
  const proof = document(`identity-${seed}`, { ...person, eaId, apiFootballId: seed + 200 }, 'API_FOOTBALL')
  const identity: FootyIdentityInput = {
    source: { ...person, footyStatsId, clubId: null, season: null },
    catalog: persons.map((p, i) => ({ ...p, playerId: `local-${i + 1}`, eaId: `ea-${i + 1}`,
      apiFootballId: i + 201, clubId: null, season: null })),
    sources: persons.map((p, i) => ({ ...p, footyStatsId: i + 101, clubId: null, season: null })),
    owners: validate(registry, original), documents: [{ id: proof.doc.id, contents: proof.doc.contents }],
    evidence: [{ eaId, origin: 'API_FOOTBALL', reference: proof.ref }], corrections: [], clubMaps: [],
  }
  const binding = { registryId, scope, eaId, footyStatsId, inputSha256: hashOwnershipIdentityInput(identity),
    previousHeadSha256: registry.headSha256 }
  const complete = document(`complete-${seed}`, { ...binding, kind: 'COMPETITOR_COMPLETENESS',
    decision: 'COMPLETE_IN_DECLARED_SCOPE', asOf: date, reviewedBy: 'synthetic-reviewer',
    inventorySha256: hash('synthetic complete inventories'), inventoryReference: 'synthetic:inventory',
    rationale: 'Exhaustive synthetic fixture only; not a real catalogue completeness claim.' })
  const human = document(`human-${seed}`, { kind: 'HUMAN_APPROVED', eaId, footyStatsId,
    reviewedBy: 'synthetic-owner', reviewedAt: date })
  const authorization = document(`authorize-${seed}`, { ...binding, kind: 'FOOTYSTATS_ADOPTION_AUTHORIZATION',
    decision: 'AUTHORIZE_ADOPTION', authorizedBy: 'synthetic-owner', reason: 'Synthetic test adoption only',
    validFrom: date, validUntil: '2026-01-04T00:00:00Z' })
  let ctx = pin(original, proof.doc, 'IDENTITY')
  ctx = pin(ctx, complete.doc, 'COMPLETENESS'); ctx = pin(ctx, human.doc, 'HUMAN_REVIEW')
  ctx = pin(ctx, authorization.doc, 'ADOPTION_AUTHORIZATION')
  const request: OwnershipAdoptionRequest = { candidate: { stage: 'CANDIDATE', eaId, footyStatsId }, identity,
    recordedBy: 'synthetic-operator', completeness: complete.ref, humanApproval: human.ref,
    authorization: authorization.ref }
  return { registry, ctx, request }
}
function fixture() {
  const b = document('baseline', { kind: 'OWNERSHIP_BASELINE', registryId, scope,
    decision: 'EMPTY_WITHIN_EXAMINED_SCOPE', asOf: date, reviewedBy: 'synthetic-reviewer', adoptedPairs: [],
    inventorySha256: hash('synthetic empty baseline'), inventoryReference: 'synthetic:baseline-inventory' })
  let ctx: OwnershipContext = { asOf: date, expectedHeadSha256: null, documents: [], verifiedDocuments: [],
    adoptionAuthorities: ['synthetic-owner'] }
  ctx = pin(ctx, b.doc, 'BASELINE')
  const registry = create({ registryId, scope, baseline: b.ref }, ctx)
  return prepare(registry, { ...ctx, expectedHeadSha256: registry.headSha256 }, 1)
}
type Fixture = ReturnType<typeof fixture>
// Re-pinning here simulates an independently re-reviewed SYNTHETIC document.
function changeRecord(f: Fixture, ref: FootyEvidenceReference, change: (r: Record<string, unknown>) => void) {
  const old = f.ctx.documents.find(d => d.id === ref.documentId)!
  const body = JSON.parse(old.contents); change(body.record)
  const doc = { ...old, contents: JSON.stringify(body) }
  f.ctx = { ...f.ctx, documents: f.ctx.documents.map(d => d.id === doc.id ? doc : d),
    verifiedDocuments: f.ctx.verifiedDocuments.map(p => p.documentSha256 === hashOwnershipDocument(old)
      ? { ...p, documentSha256: hashOwnershipDocument(doc) } : p) }
  ref.sha256 = hash(doc.contents)
}
const reject = (f: Fixture, message: RegExp) => assert.throws(() => adopt(f.registry, f.request, f.ctx), message)

test('empty versioned private genesis contains no adopted identities', () => {
  const f = fixture()
  assert.deepEqual(validate(f.registry, f.ctx), [])
  assert.equal(f.registry.visibility, 'PRIVATE_OFFLINE')
  assert.equal(f.registry.events.length, 0)
})
test('HIGH, verified completeness and specific authorization yield one synthetic adoption without mutation', () => {
  const f = fixture(), before = structuredClone(f), result = adopt(f.registry, f.request, f.ctx)
  assert.deepEqual(f, before)
  assert.equal(result.events[0].decision, 'ADOPTED')
  assert.equal(result.events[0].classification, 'HIGH')
  assert.equal(result.events[0].recordedBy, 'synthetic-operator')
  assert.deepEqual(validate(result, { ...f.ctx, expectedHeadSha256: result.headSha256 }), [{ eaId: 'ea-1', footyStatsId: 101 }])
  assert.equal(f.registry.events.length, 0)
  assert(!JSON.stringify(result).includes('annualAmount'))
})
test('JSON roundtrip, replay and semantic input order are deterministic', () => {
  const f = fixture(), first = adopt(f.registry, f.request, f.ctx)
  const second = prepare(first, { ...f.ctx, expectedHeadSha256: first.headSha256 }, 2)
  const input = second.request.identity
  const reversed = { ...input, catalog: [...input.catalog].reverse(), sources: [...input.sources].reverse(),
    owners: [...input.owners].reverse(), documents: [...input.documents].reverse() }
  assert.equal(hashOwnershipIdentityInput(input), hashOwnershipIdentityInput(reversed))
  const result = adopt(second.registry, second.request, second.ctx)
  assert.deepEqual(adopt(second.registry, { ...second.request, identity: reversed }, second.ctx), result)
  assert.deepEqual(validate(JSON.parse(JSON.stringify(result)), { ...second.ctx, expectedHeadSha256: result.headSha256 }),
    [{ eaId: 'ea-1', footyStatsId: 101 }, { eaId: 'ea-2', footyStatsId: 102 }])
})
for (const variant of ['same-pair', 'same-footy', 'same-ea'] as const) test(`bilateral uniqueness rejects ${variant}`, () => {
  const f = fixture(), registry = adopt(f.registry, f.request, f.ctx)
  const candidate = { ...f.request.candidate,
    eaId: variant === 'same-footy' ? 'another-ea' : 'ea-1', footyStatsId: variant === 'same-ea' ? 999 : 101 }
  assert.throws(() => adopt(registry, { ...f.request, candidate }, { ...f.ctx, expectedHeadSha256: registry.headSha256 }), /DUPLICATE_OR_CONFLICTING_OWNER/)
})
test('stale head prevents a second writer from applying a proposal built on the old revision', () => {
  const f = fixture(), winner = adopt(f.registry, f.request, f.ctx)
  assert.throws(() => validate(winner, f.ctx), /STALE_OR_UNTRUSTED_HEAD/)
  assert.throws(() => validate(f.registry, { ...f.ctx, expectedHeadSha256: winner.headSha256 }), /STALE_OR_UNTRUSTED_HEAD/)
})
test('ownership pool must include every existing owner, not a caller-selected subset', () => {
  const f = fixture(), first = adopt(f.registry, f.request, f.ctx)
  const next = prepare(first, { ...f.ctx, expectedHeadSha256: first.headSha256 }, 2)
  next.request.identity.owners = []
  reject(next, /OWNERSHIP_POOL_MISMATCH/)
})
for (const kind of ['MEDIUM', 'LOW', 'CONFLICT'] as const) test(`${kind} cannot be adopted despite human approval`, () => {
  const f = fixture()
  if (kind === 'MEDIUM') f.request.identity.evidence = []
  if (kind === 'LOW') f.request.identity.source.birth = null
  if (kind === 'CONFLICT') f.request.identity.catalog = [...f.request.identity.catalog, { ...f.request.identity.catalog[0], playerId: 'homonym', eaId: 'homonym-ea', apiFootballId: 999 }]
  reject(f, /UNIQUE_HIGH_IDENTITY_REQUIRED/)
})
test('candidate source and target IDs are checked independently', () => {
  const f = fixture()
  reject({ ...f, request: { ...f.request, candidate: { ...f.request.candidate, footyStatsId: 999 } } }, /CANDIDATE_SOURCE_MISMATCH/)
  reject({ ...f, request: { ...f.request, candidate: { ...f.request.candidate, eaId: 'wrong' } } }, /UNIQUE_HIGH_IDENTITY_REQUIRED/)
})
test('human approval cannot serve as an adoption authorization', () => {
  const f = fixture()
  const human = f.ctx.documents.find(d => d.id === f.request.humanApproval!.documentId)!
  f.ctx = pin({ ...f.ctx, documents: f.ctx.documents.filter(d => d.id !== human.id) }, human, 'ADOPTION_AUTHORIZATION')
  reject({ ...f, request: { ...f.request, authorization: f.request.humanApproval! } }, /PROOF_BINDING|ADOPTION_NOT_AUTHORIZED/)
})
test('missing authorization fails closed', () => {
  const f = fixture()
  reject({ ...f, request: { ...f.request, authorization: { documentId: 'missing', sha256: 'a'.repeat(64), pointer: '/record' } } }, /DOCUMENT_MISSING_OR_DUPLICATED/)
})
for (const field of ['scope', 'registryId', 'eaId', 'footyStatsId', 'inputSha256', 'previousHeadSha256'] as const)
  test(`authorization is bound to ${field}`, () => {
    const f = fixture(); changeRecord(f, f.request.authorization, r => { r[field] = field === 'footyStatsId' ? 999 : 'different' })
    reject(f, /PROOF_BINDING/)
  })
for (const kind of ['expired', 'future', 'wrong-authority', 'wrong-purpose'] as const) test(`rejects ${kind} authorization`, () => {
  const f = fixture()
  changeRecord(f, f.request.authorization, r => {
    if (kind === 'expired') r.validUntil = '2026-01-01T00:00:00Z'
    if (kind === 'future') r.validFrom = '2026-01-03T00:00:00Z'
    if (kind === 'wrong-authority') r.authorizedBy = 'untrusted'
    if (kind === 'wrong-purpose') r.decision = 'HUMAN_APPROVED'
  })
  reject(f, /AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID|ADOPTION_NOT_AUTHORIZED/)
})
test('incomplete pools and unverified completeness declarations are rejected', () => {
  const f = fixture(); changeRecord(f, f.request.completeness, r => { r.decision = 'POOLS_INCOMPLETE' })
  reject(f, /POOLS_NOT_PROVEN_COMPLETE/)
  const g = fixture(); g.ctx = { ...g.ctx, verifiedDocuments: g.ctx.verifiedDocuments.filter(p => p.purpose !== 'COMPLETENESS') }
  reject(g, /DOCUMENT_NOT_VERIFIED_FOR_PURPOSE/)
})
test('completeness cannot be reused with changed competitors or identity input', () => {
  const f = fixture(); f.request.identity.sources = [...f.request.identity.sources,
    { ...f.request.identity.source, name: 'Unrelated source', footyStatsId: 999 }]
  reject(f, /PROOF_BINDING/)
})
test('bad source-document hash, wrong subject and duplicate document IDs are rejected', () => {
  const f = fixture(); f.request.identity.evidence[0].reference.sha256 = 'a'.repeat(64)
  reject(f, /UNIQUE_HIGH_IDENTITY_REQUIRED/)
  const g = fixture(); g.request.identity.evidence[0].reference.pointer = '/unavailable'
  reject(g, /UNIQUE_HIGH_IDENTITY_REQUIRED/)
  const j = fixture(); j.ctx = { ...j.ctx, documents: [...j.ctx.documents, j.ctx.documents.find(d => d.id === 'identity-1')!] }
  reject(j, /DOCUMENT_MISSING_OR_DUPLICATED/)
})
test('provenance tampering is detected even when payload bytes are unchanged', () => {
  const f = fixture(); f.ctx = { ...f.ctx, documents: f.ctx.documents.map(d => d.id === 'identity-1' ? { ...d, sourceReference: 'forged:origin' } : d) }
  reject(f, /DOCUMENT_NOT_VERIFIED_FOR_PURPOSE/)
})
test('a trusted FootyStats-origin document cannot be relabelled independent API evidence', () => {
  const f = fixture(), old = f.ctx.documents.find(d => d.id === 'identity-1')!, doc = { ...old, origin: 'FOOTYSTATS' as const }
  f.ctx = { ...f.ctx, documents: f.ctx.documents.filter(d => d.id !== old.id) }
  f.ctx = pin(f.ctx, doc, 'IDENTITY')
  reject(f, /IDENTITY_ORIGIN_MISMATCH/)
})
test('a human review pointing to a different person is rejected', () => {
  const f = fixture(); changeRecord(f, f.request.humanApproval!, r => { r.eaId = 'different' })
  reject(f, /HUMAN_REVIEW_MISMATCH/)
})
test('date-only human approval preserves its precision and explicit time zone', () => {
  const f = fixture(); changeRecord(f, f.request.humanApproval!, r => {
    r.reviewedAt = null; r.reviewedOn = '2026-01-02'; r.timeZone = 'UTC'
  })
  const result = adopt(f.registry, f.request, f.ctx)
  assert.equal(result.events.length, 1)
  assert.equal(JSON.parse(f.ctx.documents.find(d => d.id === 'human-1')!.contents).record.reviewedAt, null)
  const g = fixture(); changeRecord(g, g.request.humanApproval!, r => {
    r.reviewedAt = null; r.reviewedOn = '2026-01-02'; r.timeZone = 'America/Cuiaba'
  }) // UTC midnight is still Jan 1 in this explicit source time zone.
  reject(g, /HUMAN_REVIEW_MISMATCH/)
})
test('date-only review cannot invent a time zone or accept an invalid calendar date', () => {
  const f = fixture(); changeRecord(f, f.request.humanApproval!, r => {
    r.reviewedAt = null; r.reviewedOn = '2026-01-02'
  })
  reject(f, /HUMAN_REVIEW_DATE_PRECISION/)
  const g = fixture(); changeRecord(g, g.request.humanApproval!, r => {
    r.reviewedAt = null; r.reviewedOn = '2026-02-30'; r.timeZone = 'UTC'
  })
  reject(g, /INVALID_DATE/)
})
test('mutated history, wrong versions and unpinned copies fail validation', () => {
  const f = fixture(), result = adopt(f.registry, f.request, f.ctx), ctx = { ...f.ctx, expectedHeadSha256: result.headSha256 }
  const corrupted = structuredClone(result); Object.assign(corrupted.events[0], { recordedBy: 'tampered' })
  assert.throws(() => validate(corrupted, ctx), /EVENT_HASH/)
  assert.throws(() => validate({ ...result, version: 'unknown' } as unknown as FootyStatsOwnershipRegistry, ctx), /REGISTRY_CONTRACT/)
  assert.throws(() => validate(result, { ...ctx, expectedHeadSha256: null }), /PINNED_HEAD_REQUIRED/)
})
test('a baseline without independently verified inventory cannot establish an empty registry', () => {
  const f = fixture(), ctx = { ...f.ctx, expectedHeadSha256: null,
    verifiedDocuments: f.ctx.verifiedDocuments.filter(p => p.purpose !== 'BASELINE') }
  assert.throws(() => create({ registryId, scope, baseline: f.registry.baseline }, ctx), /DOCUMENT_NOT_VERIFIED_FOR_PURPOSE/)
})
