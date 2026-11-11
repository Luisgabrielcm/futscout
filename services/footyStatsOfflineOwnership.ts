import { createHash } from 'node:crypto'
import { assessFootyStatsOfflineIdentity, type FootyEvidenceReference, type FootyIdentityInput } from './footyStatsOfflineIdentityAdapter'

type Purpose = 'BASELINE' | 'IDENTITY' | 'COMPLETENESS' | 'HUMAN_REVIEW' | 'ADOPTION_AUTHORIZATION'
export type OwnershipDocument = Readonly<{
  id: string
  contents: string
  origin: 'INTERNAL_REVIEW' | 'OFFICIAL' | 'API_FOOTBALL' | 'FOOTYSTATS'
  sourceReference: string
  observedAt: string
}>
export type OwnershipContext = Readonly<{
  asOf: string
  // Independently pinned latest revision; null is permitted ONLY for an empty genesis.
  expectedHeadSha256: string | null
  documents: readonly OwnershipDocument[]
  // Caller authenticates the publisher, reviewer and authority BEFORE pinning.
  verifiedDocuments: readonly Readonly<{ scope: string; purpose: Purpose; documentSha256: string }>[]
  adoptionAuthorities: readonly string[]
}>
type Pair = Readonly<{ footyStatsId: number; eaId: string }>
type Binding = Pair & Readonly<{
  registryId: string; scope: string; inputSha256: string; previousHeadSha256: string
}>
export type OwnershipAdoption = Pair & Readonly<{
  sequence: number
  decision: 'ADOPTED'
  recordedAt: string
  recordedBy: string
  classification: 'HIGH'
  inputSha256: string
  identityEvidence: readonly FootyEvidenceReference[]
  completeness: FootyEvidenceReference
  humanApproval: FootyEvidenceReference | null
  authorization: FootyEvidenceReference
  previousHeadSha256: string
  sha256: string
}>
export type FootyStatsOwnershipRegistry = Readonly<{
  version: 'footystats-ownership-v1'
  visibility: 'PRIVATE_OFFLINE'
  namespace: 'FOOTYSTATS'
  registryId: string
  scope: string
  createdAt: string
  baseline: FootyEvidenceReference
  events: readonly OwnershipAdoption[]
  headSha256: string
}>
export type OwnershipAdoptionRequest = Readonly<{
  // A candidate, evidence or HUMAN_APPROVED record is never itself an adoption.
  candidate: Pair & Readonly<{ stage: 'CANDIDATE' }>
  identity: FootyIdentityInput
  recordedBy: string
  completeness: FootyEvidenceReference
  humanApproval: FootyEvidenceReference | null
  authorization: FootyEvidenceReference
}>

const check: (value: unknown, code: string) => asserts value = (value, code) => {
  if (!value) throw new Error(`FOOTYSTATS_OWNERSHIP_${code}`)
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (object(v) && Object.getPrototypeOf(v) === Object.prototype) return `{${Object.keys(v).sort(compare)
    .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  check(v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v), 'INVALID_HASH_INPUT')
  return JSON.stringify(v)
}
const sha = (v: string) => createHash('sha256').update(v).digest('hex')
const hash = (v: unknown) => sha(canonical(v))
const sorted = <T>(values: readonly T[]) => [...values].sort((a, b) => compare(canonical(a), canonical(b)))
function instant(v: unknown): number {
  check(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v), 'INVALID_DATE')
  const n = Date.parse(v)
  check(Number.isFinite(n) && new Date(n).toISOString().slice(0, 19) === v.slice(0, 19), 'INVALID_DATE')
  return n
}
function pair(p: Pair) {
  check(Number.isSafeInteger(p.footyStatsId) && p.footyStatsId > 0 && text(p.eaId), 'INVALID_PAIR')
}
function reviewDateKnown(review: Record<string, unknown>, at: string): boolean {
  if (review.reviewedAt !== null && review.reviewedAt !== undefined) return instant(review.reviewedAt) <= instant(at)
  // Date-only historical decisions retain their precision; never fabricate an instant.
  check(typeof review.reviewedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewedOn) &&
    text(review.timeZone), 'HUMAN_REVIEW_DATE_PRECISION')
  instant(`${review.reviewedOn}T00:00:00Z`) // Calendar validation only, not a decision timestamp.
  const parts = new Intl.DateTimeFormat('en', { timeZone: review.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at))
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return review.reviewedOn <= `${part('year')}-${part('month')}-${part('day')}`
}

/** Pins include provenance metadata, not just the JSON payload. Hashes are NOT signatures. */
export const hashOwnershipDocument = (document: OwnershipDocument) => hash(document)

/** Order-independent digest of the COMPLETE supplied identity/evidence context.
 * This binds a reviewed completeness document to its inputs; it cannot discover
 * omitted players, authenticate publishers or prove completeness by itself.
 */
export const hashOwnershipIdentityInput = (input: FootyIdentityInput) => hash({ ...input,
  catalog: sorted(input.catalog), sources: sorted(input.sources), owners: sorted(input.owners),
  documents: sorted(input.documents), evidence: sorted(input.evidence),
  corrections: sorted(input.corrections), clubMaps: sorted(input.clubMaps),
})

function resolve(ctx: OwnershipContext, scope: string, ref: FootyEvidenceReference, purpose: Purpose, at: string) {
  check(ref && text(ref.documentId) && digest(ref.sha256) && typeof ref.pointer === 'string' &&
    ref.pointer.startsWith('/') && !/~(?![01])/.test(ref.pointer), 'INVALID_REFERENCE')
  const docs = ctx.documents.filter(d => d.id === ref.documentId)
  check(docs.length === 1, 'DOCUMENT_MISSING_OR_DUPLICATED')
  const doc = docs[0]
  check(text(doc.sourceReference) && ['INTERNAL_REVIEW', 'OFFICIAL', 'API_FOOTBALL', 'FOOTYSTATS'].includes(doc.origin) &&
    instant(doc.observedAt) <= instant(at), 'DOCUMENT_PROVENANCE')
  check(sha(doc.contents) === ref.sha256, 'DOCUMENT_HASH')
  check(ctx.verifiedDocuments.some(p => p.scope === scope && p.purpose === purpose &&
    p.documentSha256 === hashOwnershipDocument(doc)), 'DOCUMENT_NOT_VERIFIED_FOR_PURPOSE')
  let value: unknown
  try { value = JSON.parse(doc.contents) } catch { throw new Error('FOOTYSTATS_OWNERSHIP_DOCUMENT_JSON') }
  for (const token of ref.pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~')
    check(value && typeof value === 'object' && Object.hasOwn(value, key), 'DOCUMENT_POINTER')
    value = (value as Record<string, unknown>)[key]
  }
  check(object(value), 'DOCUMENT_RECORD')
  return { doc, value }
}
function bindings(value: Record<string, unknown>, expected: Binding) {
  for (const key of ['registryId', 'scope', 'footyStatsId', 'eaId', 'inputSha256', 'previousHeadSha256'] as const)
    check(value[key] === expected[key], 'PROOF_BINDING')
}
function baseline(registry: FootyStatsOwnershipRegistry, ctx: OwnershipContext) {
  check(registry.version === 'footystats-ownership-v1' && registry.visibility === 'PRIVATE_OFFLINE' &&
    registry.namespace === 'FOOTYSTATS' && text(registry.registryId) && text(registry.scope), 'REGISTRY_CONTRACT')
  check(instant(registry.createdAt) <= instant(ctx.asOf), 'FUTURE_REGISTRY')
  const { value } = resolve(ctx, registry.scope, registry.baseline, 'BASELINE', registry.createdAt)
  check(value.kind === 'OWNERSHIP_BASELINE' && value.decision === 'EMPTY_WITHIN_EXAMINED_SCOPE' &&
    value.registryId === registry.registryId && value.scope === registry.scope && text(value.reviewedBy) &&
    text(value.inventoryReference) && digest(value.inventorySha256) && Array.isArray(value.adoptedPairs) &&
    value.adoptedPairs.length === 0 && instant(value.asOf) <= instant(registry.createdAt), 'BASELINE_NOT_PROVEN')
  return hash({ version: registry.version, visibility: registry.visibility, namespace: registry.namespace,
    registryId: registry.registryId, scope: registry.scope, createdAt: registry.createdAt, baseline: registry.baseline })
}
function proofs(registry: FootyStatsOwnershipRegistry, event: OwnershipAdoption, ctx: OwnershipContext) {
  const binding: Binding = { registryId: registry.registryId, scope: registry.scope,
    eaId: event.eaId, footyStatsId: event.footyStatsId, inputSha256: event.inputSha256,
    previousHeadSha256: event.previousHeadSha256 }
  const completeness = resolve(ctx, registry.scope, event.completeness, 'COMPLETENESS', event.recordedAt).value
  bindings(completeness, binding)
  check(completeness.kind === 'COMPETITOR_COMPLETENESS' && completeness.decision === 'COMPLETE_IN_DECLARED_SCOPE' &&
    text(completeness.reviewedBy) && text(completeness.rationale) && digest(completeness.inventorySha256) &&
    text(completeness.inventoryReference) && instant(completeness.asOf) <= instant(event.recordedAt), 'POOLS_NOT_PROVEN_COMPLETE')
  const authorization = resolve(ctx, registry.scope, event.authorization, 'ADOPTION_AUTHORIZATION', event.recordedAt).value
  bindings(authorization, binding)
  check(authorization.kind === 'FOOTYSTATS_ADOPTION_AUTHORIZATION' && authorization.decision === 'AUTHORIZE_ADOPTION' &&
    text(authorization.authorizedBy) && ctx.adoptionAuthorities.includes(authorization.authorizedBy) && text(authorization.reason), 'ADOPTION_NOT_AUTHORIZED')
  check(instant(authorization.validFrom) <= instant(event.recordedAt) &&
    instant(event.recordedAt) <= instant(authorization.validUntil), 'AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID')
  if (event.humanApproval !== null) {
    const review = resolve(ctx, registry.scope, event.humanApproval, 'HUMAN_REVIEW', event.recordedAt).value
    check(review.kind === 'HUMAN_APPROVED' && review.eaId === event.eaId && review.footyStatsId === event.footyStatsId &&
      text(review.reviewedBy) && reviewDateKnown(review, event.recordedAt), 'HUMAN_REVIEW_MISMATCH')
  }
  check(event.identityEvidence.length > 0, 'IDENTITY_EVIDENCE_REQUIRED')
  for (const ref of event.identityEvidence) resolve(ctx, registry.scope, ref, 'IDENTITY', event.recordedAt)
}

/** Private JSON contract. Stores only ADOPTED events, never candidate/approval rows.
 * No IO, DB, environment, clock, salary permissions or operational HIGH promotion.
 * The caller must preserve proof documents and pin the authoritative latest head.
 * An IO integration MUST CAS that head atomically and durably; this pure module
 * cannot serialize concurrent file writers or prevent rollback to an unpinned copy.
 */
export function validateFootyStatsOwnershipRegistry(registry: FootyStatsOwnershipRegistry, ctx: OwnershipContext) {
  check(digest(ctx.expectedHeadSha256), 'PINNED_HEAD_REQUIRED')
  let previous = baseline(registry, ctx), previousAt = instant(registry.createdAt)
  const owners: Pair[] = []
  for (const [index, event] of registry.events.entries()) {
    pair(event)
    check(!owners.some(o => o.footyStatsId === event.footyStatsId || o.eaId === event.eaId), 'DUPLICATE_OR_CONFLICTING_OWNER')
    check(event.sequence === index + 1 && event.decision === 'ADOPTED' && event.classification === 'HIGH' &&
      text(event.recordedBy) && digest(event.inputSha256), 'INVALID_ADOPTION_EVENT')
    check(event.previousHeadSha256 === previous, 'HISTORY_CHAIN')
    check(instant(event.recordedAt) >= previousAt && instant(event.recordedAt) <= instant(ctx.asOf), 'HISTORY_DATE')
    const { sha256, ...payload } = event
    check(digest(sha256) && hash(payload) === sha256, 'EVENT_HASH')
    proofs(registry, event, ctx)
    owners.push({ footyStatsId: event.footyStatsId, eaId: event.eaId })
    previous = sha256; previousAt = instant(event.recordedAt)
  }
  check(registry.headSha256 === previous && ctx.expectedHeadSha256 === previous, 'STALE_OR_UNTRUSTED_HEAD')
  return sorted(owners)
}

export function createFootyStatsOwnershipRegistry(input: Readonly<{
  registryId: string; scope: string; baseline: FootyEvidenceReference
}>, ctx: OwnershipContext): FootyStatsOwnershipRegistry {
  check(ctx.expectedHeadSha256 === null, 'GENESIS_REQUIRES_EMPTY_HEAD')
  const registry: FootyStatsOwnershipRegistry = { version: 'footystats-ownership-v1', visibility: 'PRIVATE_OFFLINE',
    namespace: 'FOOTYSTATS', ...structuredClone(input), createdAt: ctx.asOf, events: [], headSha256: '' }
  const result = { ...registry, headSha256: baseline(registry, ctx) }
  validateFootyStatsOwnershipRegistry(result, { ...ctx, expectedHeadSha256: result.headSha256 })
  return result
}

export function adoptFootyStatsIdentityOffline(
  registry: FootyStatsOwnershipRegistry, request: OwnershipAdoptionRequest, ctx: OwnershipContext,
): FootyStatsOwnershipRegistry {
  const owners = validateFootyStatsOwnershipRegistry(registry, ctx)
  pair(request.candidate)
  check(request.candidate.stage === 'CANDIDATE' && text(request.recordedBy), 'INVALID_CANDIDATE')
  check(!owners.some(o => o.footyStatsId === request.candidate.footyStatsId || o.eaId === request.candidate.eaId), 'DUPLICATE_OR_CONFLICTING_OWNER')
  check(canonical(sorted(request.identity.owners)) === canonical(owners), 'OWNERSHIP_POOL_MISMATCH')
  check(request.identity.source.footyStatsId === request.candidate.footyStatsId, 'CANDIDATE_SOURCE_MISMATCH')
  const matches = assessFootyStatsOfflineIdentity(request.identity)
  check(matches.length === 1 && matches[0].eaId === request.candidate.eaId &&
    matches[0].classification === 'HIGH' && matches[0].personalIdentity.independentEvidence, 'UNIQUE_HIGH_IDENTITY_REQUIRED')
  const match = matches[0]
  for (const ref of match.evidenceReferences) {
    const { doc } = resolve(ctx, registry.scope, ref, 'IDENTITY', ctx.asOf)
    check(request.identity.documents.filter(d => d.id === doc.id && d.contents === doc.contents).length === 1, 'IDENTITY_DOCUMENT_MISMATCH')
  }
  // Origin is authenticated by the external pin, not a self-labelled evidence row.
  for (const e of request.identity.evidence.filter(e => e.eaId === match.eaId)) {
    const { doc } = resolve(ctx, registry.scope, e.reference, 'IDENTITY', ctx.asOf)
    check(doc.origin === e.origin, 'IDENTITY_ORIGIN_MISMATCH')
  }
  const payload: Omit<OwnershipAdoption, 'sha256'> = {
    sequence: registry.events.length + 1, decision: 'ADOPTED', recordedAt: ctx.asOf, recordedBy: request.recordedBy,
    footyStatsId: request.candidate.footyStatsId, eaId: request.candidate.eaId, classification: 'HIGH',
    inputSha256: hashOwnershipIdentityInput(request.identity), identityEvidence: match.evidenceReferences,
    completeness: request.completeness, humanApproval: request.humanApproval, authorization: request.authorization,
    previousHeadSha256: registry.headSha256,
  }
  const event = { ...payload, sha256: hash(payload) }
  proofs(registry, event, ctx)
  const result = structuredClone({ ...registry, events: [...registry.events, event], headSha256: event.sha256 })
  validateFootyStatsOwnershipRegistry(result, { ...ctx, expectedHeadSha256: result.headSha256 })
  return result
}
