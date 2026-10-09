import { hash, prepare, type Context, type ContractInput, type PartialDate } from './contract'
import { assessTemporal, type TemporalInput } from './temporal-v02'
import { assertRegistry, ensure, identifier, type Registry } from './source-registry'

export const catalogVersion = 'contract-evidence-catalog-v0.1'
type Facts = Pick<ContractInput, 'signedAt' | 'contractUntil' | 'contractStatus' | 'extensionOptions' | 'releaseClause'>
export type EvidenceInput = Context & {
  evidenceId: string; sourceId: string; sourceReference: string; sourceUrl: string | null
  sourceType: 'CLUB' | 'LEAGUE' | 'FEDERATION' | 'LICENSED_PROVIDER' | 'SYNTHETIC'
  sourcePolicyVersion: string; publishedAt: PartialDate | null; observedAt: string
  observationProofRef: string; providerEffectiveAt: string | null
  eventType: 'CONTRACT' | 'RENEWAL' | 'TRANSFER' | 'TERMINATION' | 'OPTION' | 'CLAUSE'
  facts: Facts; periodQualifier: TemporalInput['periodQualifier']
  evidenceStatus: TemporalInput['evidenceStatus']; identityConfidence: ContractInput['identityConfidence']
  evidenceQuality: ContractInput['evidenceQuality']; supersedesEvidenceId: string | null
}
export type EvidenceRecord = EvidenceInput & {
  schemaVersion: typeof catalogVersion; sourceVersion: string
  permissions: Registry['entries'][number]['source']['permissions']; permissionReference: string
  contentHash: string; recordHash: string
}
export interface EvidenceCatalog {
  append(input: EvidenceInput): EvidenceRecord
  get(evidenceId: string): EvidenceRecord | null
  exportJson(): string
}
const unknown = { value: null, datePrecision: 'UNKNOWN' } as const
function keys(value: object, expected: string[]) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join('|') === expected.sort().join('|'), 'UNEXPECTED_FIELDS')
}
function shortFields(value: unknown) {
  if (typeof value === 'string') ensure(value.length <= 200 && !/[<>\r\n]/.test(value) &&
    !/(password|bearer\s|api[_-]?key|access[_-]?token)/i.test(value), 'UNSAFE_OR_LONG_TEXT')
  else if (Array.isArray(value)) value.forEach(shortFields)
  else if (value && typeof value === 'object') Object.values(value).forEach(shortFields)
}
function shape(input: EvidenceInput) {
  keys(input, ['playerId','clubId','context','season','evidenceId','sourceId','sourceReference','sourceUrl','sourceType',
    'sourcePolicyVersion','publishedAt','observedAt','observationProofRef','providerEffectiveAt','eventType','facts',
    'periodQualifier','evidenceStatus','identityConfidence','evidenceQuality','supersedesEvidenceId'])
  keys(input.facts, ['signedAt','contractUntil','contractStatus','extensionOptions','releaseClause'])
  for (const date of [input.facts.signedAt, input.facts.contractUntil, input.publishedAt]) if (date !== null) keys(date, ['value','datePrecision'])
  for (const option of input.facts.extensionOptions ?? []) {
    keys(option, ['holder','until','conditions','sourceReference']); keys(option.until, ['value','datePrecision'])
  }
  keys(input.facts.releaseClause, ['status','amount','currency','clauseType','activationConditions','sourceReference','explicitEvidence'])
  if (input.periodQualifier) keys(input.periodQualifier, ['kind','sourceText','sourceReference'])
  const { sourceUrl, ...bounded } = input; shortFields(bounded)
  if (sourceUrl !== null) {
    ensure(typeof sourceUrl === 'string' && sourceUrl.length <= 2048, 'UNSAFE_URL')
    const url = new URL(sourceUrl)
    ensure(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
      !/(token|secret|password|api.?key)/i.test(sourceUrl), 'UNSAFE_URL')
  }
}
function normalize(input: EvidenceInput, registry: Registry): EvidenceRecord {
  shape(input); assertRegistry(registry)
  for (const id of [input.evidenceId,input.sourceId,input.sourceReference,input.observationProofRef,input.playerId,input.clubId,input.season]) identifier(id)
  if (input.supersedesEvidenceId !== null) identifier(input.supersedesEvidenceId)
  const source = registry.entries.find(e => e.source.id === input.sourceId)?.source
  ensure(source, 'SOURCE_UNKNOWN')
  ensure(source.policyVersion === input.sourcePolicyVersion, 'POLICY_VERSION_MISMATCH')
  // Registry.enabled deliberately requires more rights than storage; preserve the separate permissions.
  for (const permission of ['access','storage','history'] as const)
    ensure(source.permissions[permission] === 'CONFIRMED', `PERMISSION_${permission}`)
  ensure(source.permissionReference !== null, 'PERMISSION_EVIDENCE_REQUIRED')
  ensure(['CLUB','LEAGUE','FEDERATION','LICENSED_PROVIDER','SYNTHETIC'].includes(input.sourceType), 'INVALID_SOURCE_TYPE')
  ensure(['CONTRACT','RENEWAL','TRANSFER','TERMINATION','OPTION','CLAUSE'].includes(input.eventType), 'INVALID_EVENT_TYPE')
  ensure((input.sourceType === 'SYNTHETIC') === (input.evidenceQuality === 'SYNTHETIC'), 'SYNTHETIC_MISMATCH')
  const base = prepare({ ...input.facts, playerId: input.playerId, clubId: input.clubId, context: input.context, season: input.season,
    provider: source.provider, sourceReference: input.sourceReference, observedAt: input.observedAt, providerEffectiveAt: input.providerEffectiveAt,
    identityConfidence: input.identityConfidence, evidenceQuality: input.evidenceQuality,
    provenance: { evidenceReference: input.observationProofRef, rights: 'AUTHORIZED', synthetic: input.sourceType === 'SYNTHETIC' } }, input)
  assessTemporal({ contract: base.data, publishedAt: input.publishedAt ?? unknown, periodQualifier: input.periodQualifier,
    competitionCalendar: null, evidenceStatus: input.evidenceStatus, verification: null, events: [] }, input, base.data.observedAt)
  const normalized: Omit<EvidenceRecord, 'contentHash' | 'recordHash'> = { ...structuredClone(input), observedAt: base.data.observedAt, providerEffectiveAt: base.data.providerEffectiveAt,
    facts: { ...structuredClone(input.facts), releaseClause: base.data.releaseClause }, schemaVersion: catalogVersion,
    sourceVersion: source.sourceVersion, permissions: structuredClone(source.permissions), permissionReference: source.permissionReference }
  const { evidenceId, observedAt, observationProofRef, ...content } = normalized
  void evidenceId; void observedAt; void observationProofRef
  const contentHash = hash(content)
  return { ...normalized, contentHash, recordHash: hash({ ...normalized, contentHash }) }
}

export class ImmutableEvidenceCatalog implements EvidenceCatalog {
  private records: EvidenceRecord[] = []
  private registry: Registry
  constructor(registry: Registry) { assertRegistry(registry); this.registry = structuredClone(registry) }
  append(input: EvidenceInput): EvidenceRecord {
    const record = normalize(input, this.registry)
    ensure(record.supersedesEvidenceId !== record.evidenceId, 'REFERENCE_CYCLE')
    const sameId = this.records.find(r => r.evidenceId === record.evidenceId)
    if (sameId) { ensure(sameId.recordHash === record.recordHash, 'IMMUTABLE_ID_COLLISION'); return structuredClone(sameId) }
    if (record.supersedesEvidenceId !== null) {
      const previous = this.records.find(r => r.evidenceId === record.supersedesEvidenceId)
      ensure(previous, 'PREVIOUS_EVIDENCE_MISSING')
      ensure(previous.playerId === record.playerId && previous.context === record.context, 'REFERENCE_CONTEXT_MISMATCH')
      ensure(previous.clubId === record.clubId || record.eventType === 'TRANSFER', 'CLUB_CHANGE_REQUIRES_TRANSFER')
      ensure(record.observedAt >= previous.observedAt, 'OBSERVATION_PRECEDES_PARENT')
      if (previous.providerEffectiveAt && record.providerEffectiveAt)
        ensure(record.providerEffectiveAt >= previous.providerEffectiveAt, 'EFFECTIVE_TIME_PRECEDES_PARENT')
    }
    const duplicate = this.records.find(r => r.contentHash === record.contentHash)
    if (duplicate) return structuredClone(duplicate) // Original timestamps retained; this is not a new observation.
    this.records.push(structuredClone(record)); return structuredClone(record)
  }
  get(evidenceId: string) { return structuredClone(this.records.find(r => r.evidenceId === evidenceId) ?? null) }
  evidenceRef(evidenceId: string) {
    const record = this.get(evidenceId); ensure(record, 'EVIDENCE_NOT_FOUND')
    return { evidenceRef: `catalog/${record.recordHash}`, evidenceId: record.evidenceId,
      contentHash: record.contentHash, recordHash: record.recordHash, currentEligible: false as const, publicationAllowed: false as const }
  }
  conflicts() {
    const conflicts: { evidenceIds: string[]; reason: string }[] = []
    for (let i = 0; i < this.records.length; i++) for (const b of this.records.slice(i + 1)) {
      const a = this.records[i]
      if (a.playerId !== b.playerId || a.context !== b.context || a.season !== b.season) continue
      if (a.clubId !== b.clubId) conflicts.push({ evidenceIds: [a.evidenceId,b.evidenceId], reason: 'CLUB_CONTEXT_REVIEW' })
      else if (hash(a.facts) !== hash(b.facts) || hash(a.periodQualifier) !== hash(b.periodQualifier))
        conflicts.push({ evidenceIds: [a.evidenceId,b.evidenceId], reason: 'DIFFERENT_TERMS_REQUIRE_REVIEW' })
    }
    return conflicts // Explicit, conservative review flags, never automatic replacement or current.
  }
  exportJson() {
    const body = { schemaVersion: catalogVersion, registryHash: this.registry.registryHash, records: this.records }
    return JSON.stringify({ ...body, artifactHash: hash(body) })
  }
  static restore(json: string, registry: Registry, expectedArtifactHash: string) {
    const envelope = JSON.parse(json)
    keys(envelope, ['schemaVersion','registryHash','records','artifactHash'])
    const { artifactHash, ...body } = envelope
    ensure(artifactHash === expectedArtifactHash && hash(body) === artifactHash && body.schemaVersion === catalogVersion &&
      body.registryHash === registry.registryHash && Array.isArray(body.records), 'CATALOG_INTEGRITY_MISMATCH')
    const parents = new Map<string, string | null>(body.records.map((r: EvidenceRecord) => [r.evidenceId, r.supersedesEvidenceId]))
    ensure(parents.size === body.records.length, 'DUPLICATE_EVIDENCE_ID')
    for (const id of parents.keys()) {
      const seen = new Set<string>(); let cursor: string | null = id
      while (cursor !== null && parents.has(cursor)) {
        ensure(!seen.has(cursor), 'REFERENCE_CYCLE'); seen.add(cursor); cursor = parents.get(cursor) ?? null
      }
    }
    const catalog = new ImmutableEvidenceCatalog(registry)
    for (const record of body.records as EvidenceRecord[]) {
      const { schemaVersion,sourceVersion,permissions,permissionReference,contentHash,recordHash,...input } = record
      void schemaVersion; void sourceVersion; void permissions; void permissionReference; void contentHash; void recordHash
      const restored = catalog.append(input)
      ensure(hash(restored) === hash(record), 'RECORD_INTEGRITY_MISMATCH')
    }
    ensure(catalog.records.length === body.records.length, 'DUPLICATE_CONTENT')
    return catalog
  }
}
