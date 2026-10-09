import { createHash } from 'node:crypto'
import { hash, validateDate, type ContractInput, type PartialDate } from './contract'

export const adapterVersion = 'futscout-contract-evidence-adapter-v0.1'
export const selectionSha256 = '9bdbacd5ceb21676f00115f19c59ad2098fc0b2b73debf2e6a7a0a5061cd50a2'
export const evidenceSha256 = 'cc4ba5258af7afad0fc7d35da8a3447e2fc3fcc4d2326547cb345e5b669b9fcc'
export type SelectedPlayer = { id: string; name: string; dob: string; club: string }
export type Evidence = {
  selectionPosition: number; playerId: string; name: string; source: string
  sourceClub: string; evidenceQuality: string; access: string
  publishedAt: string | null; contractUntil: PartialDate
  identityEvidence: string; temporalAssessment: string
  contractStatusInSelectedClub?: 'INACTIVE'
  extensionOptions?: { until: PartialDate; holder: 'UNKNOWN'; conditions: null }[] | null
  sourceAsOf?: string; qualifier?: string; durationText?: string; endContext?: string
  historicalClause?: unknown; reportedUntil?: PartialDate
  conflictingSecondarySources?: string[]
  [key: string]: unknown
}
export type ContractDraft = Omit<ContractInput, 'clubId' | 'observedAt' | 'season'> & {
  clubId: null; observedAt: null; season: null
}
function check(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason)
}
function safeUrl(value: string) {
  const url = new URL(value)
  check(url.protocol === 'https:' && !url.username && !url.password &&
    ![...url.searchParams.keys()].some(k => /token|secret|password|api.?key/i.test(k)), 'UNSAFE_SOURCE_REFERENCE')
}

// Produces a review draft, not a valid production ContractInput. No fuzzy matching,
// clock, provider request, club lookup, persistence, or automatic approval.
export function adaptEvidence(record: Evidence, selected: SelectedPlayer, reviewRecordedAt: string) {
  check(record.playerId === selected.id && record.name === selected.name, 'PLAYER_IDENTITY_MISMATCH')
  check(Number.isInteger(record.selectionPosition) && record.selectionPosition > 0, 'INVALID_POSITION')
  check(typeof record.sourceClub === 'string' && record.sourceClub.length > 0 && selected.club.length > 0, 'CLUB_CONTEXT_MISSING')
  check(typeof record.identityEvidence === 'string' && record.identityEvidence.length > 0 &&
    typeof record.temporalAssessment === 'string' && record.temporalAssessment.length > 0, 'EVIDENCE_REQUIRED')
  check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(reviewRecordedAt) &&
    Number.isFinite(Date.parse(reviewRecordedAt)) && new Date(reviewRecordedAt).toISOString() === reviewRecordedAt.replace('Z', '.000Z'), 'INVALID_REVIEW_TIME')
  validateDate({ value: selected.dob, datePrecision: 'DAY' })
  validateDate(record.contractUntil)
  safeUrl(record.source)
  for (const date of [record.publishedAt, record.sourceAsOf]) {
    if (date !== null && date !== undefined) {
      validateDate({ value: date, datePrecision: 'DAY' })
      check(date <= reviewRecordedAt.slice(0, 10), 'SOURCE_AFTER_REVIEW')
    }
  }
  check(record.contractStatusInSelectedClub === undefined || record.contractStatusInSelectedClub === 'INACTIVE', 'UNSUPPORTED_STATUS')
  const provisional = record.evidenceQuality === 'PRIMARY_INDEXED_PENDING_ACCESS'
  const primaryExpiry = record.evidenceQuality === 'PRIMARY' && record.access === 'PAGE_OPENED' && record.contractUntil.value !== null
  check(record.contractUntil.value === null || provisional || primaryExpiry, 'UNSUPPORTED_EXPIRY_EVIDENCE')
  const evidenceStatus = provisional ? 'PROVISIONAL' : primaryExpiry ? 'OFFICIAL_EXPLICIT' : 'INSUFFICIENT'
  const conflictReasons: string[] = []
  if (selected.club !== record.sourceClub) conflictReasons.push('SOURCE_CLUB_DIFFERS_FROM_CATALOG')
  if (record.contractStatusInSelectedClub === 'INACTIVE') conflictReasons.push('SELECTED_CLUB_RELATIONSHIP_ENDED')
  if (record.conflictingSecondarySources?.length) conflictReasons.push('UNRESOLVED_SECONDARY_REPORTS')
  const clubReviewRequired = conflictReasons.some(r => r !== 'UNRESOLVED_SECONDARY_REPORTS')
  const sourceReference = `contract-evidence-pilot-20261008/evidence/${record.selectionPosition}`
  check(record.extensionOptions === undefined || record.extensionOptions === null || Array.isArray(record.extensionOptions), 'INVALID_OPTIONS')
  const extensionOptions = record.extensionOptions?.map(option => {
    validateDate(option.until)
    check(option.holder === 'UNKNOWN' && option.conditions === null, 'UNSUPPORTED_OPTION_DETAIL')
    return { ...structuredClone(option), sourceReference }
  }) ?? null
  const draft: ContractDraft = {
    playerId: selected.id, clubId: null, context: 'REAL_WORLD', season: null,
    provider: 'PUBLIC_CONTRACT_EVIDENCE', sourceReference, observedAt: null, providerEffectiveAt: null,
    signedAt: { value: null, datePrecision: 'UNKNOWN' }, contractUntil: structuredClone(record.contractUntil),
    // Status is scoped to the SOURCE club. Never apply Nürnberg's termination to Bielefeld.
    contractStatus: selected.club === record.sourceClub && record.contractStatusInSelectedClub === 'INACTIVE' ? 'INACTIVE' : 'UNKNOWN',
    extensionOptions, identityConfidence: 'UNKNOWN',
    evidenceQuality: record.evidenceQuality.startsWith('PRIMARY') ? 'PRIMARY' : 'SECONDARY',
    provenance: { evidenceReference: sourceReference, rights: 'UNKNOWN', synthetic: false },
    releaseClause: { status: 'UNKNOWN', amount: null, currency: null, clauseType: null,
      activationConditions: null, sourceReference: null, explicitEvidence: null },
  }
  const payload = {
    adapterVersion, draft, evidenceStatus,
    sourceContext: { selectedClub: selected.club, sourceClub: record.sourceClub,
      selectedClubStatus: record.contractStatusInSelectedClub ?? 'UNKNOWN', catalogDOB: selected.dob },
    // All source qualifiers, options and historical allegations remain audit-only.
    provenance: { selectionSha256, evidenceSha256, reviewRecordedAt, sourceEvidence: structuredClone(record) },
    conflictReason: conflictReasons.length ? conflictReasons.join('|') : null,
    clubReviewRequired,
    reviewEligible: evidenceStatus === 'OFFICIAL_EXPLICIT' && conflictReasons.length === 0,
    abstentionReasons: ['CLUB_ID_UNPROVEN', 'PER_RECORD_OBSERVED_AT_UNPROVEN', 'SEASON_CONTEXT_UNPROVEN',
      'IDENTITY_NOT_APPROVED', 'REUSE_RIGHTS_UNKNOWN',
      ...(conflictReasons.length ? ['EVIDENCE_CONFLICT'] : []),
      ...(evidenceStatus === 'PROVISIONAL' ? ['PROVISIONAL_SOURCE'] : []),
      ...(evidenceStatus === 'INSUFFICIENT' ? ['INSUFFICIENT_EXPIRY_EVIDENCE'] : [])],
    persistenceEligible: false as const, currentEligible: false as const, publicationAllowed: false as const,
  }
  return { ...payload, inputHash: hash({ adapterVersion, selected, record, reviewRecordedAt }), outputHash: hash(payload) }
}

export function adaptPilot(selectionBytes: Uint8Array, evidenceBytes: Uint8Array) {
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
  check(sha(selectionBytes) === selectionSha256, 'SELECTION_HASH_MISMATCH')
  check(sha(evidenceBytes) === evidenceSha256, 'EVIDENCE_HASH_MISMATCH')
  const selection = JSON.parse(Buffer.from(selectionBytes).toString('utf8')) as { players: SelectedPlayer[] }
  const evidence = JSON.parse(Buffer.from(evidenceBytes).toString('utf8')) as {
    selectionSha256: string; records: Evidence[]; reviewRecordedAt: string
  }
  check(evidence.selectionSha256 === selectionSha256 && selection.players.length === 12 && evidence.records.length === 12, 'MANIFEST_MISMATCH')
  check(new Set(selection.players.map(p => p.id)).size === 12 && new Set(evidence.records.map(p => p.playerId)).size === 12, 'DUPLICATE_PLAYER')
  const records = evidence.records.map((record, i) => {
    check(record.selectionPosition === i + 1, 'ORDER_MISMATCH')
    return adaptEvidence(record, selection.players[i], evidence.reviewRecordedAt)
  })
  const summary = {
    drafts: records.length,
    officialExplicit: records.filter(r => r.evidenceStatus === 'OFFICIAL_EXPLICIT').length,
    provisional: records.filter(r => r.evidenceStatus === 'PROVISIONAL').length,
    clubConflicts: records.filter(r => r.clubReviewRequired).length,
    otherConflicts: records.filter(r => r.conflictReason && !r.clubReviewRequired).length,
    reviewEligible: records.filter(r => r.reviewEligible).length,
    persistenceEligible: 0,
  }
  return { adapterVersion, summary, records, artifactHash: hash({ adapterVersion, records }) }
}
