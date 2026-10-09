// Offline evidence assessment only; no clock, IO, writer or current selection.
import { hash, prepare, validateDate, type Context, type ContractInput, type PartialDate } from './contract'

export const temporalVersion = 'futscout-contract-temporal-v0.2'
type EvidenceStatus = 'OFFICIAL_EXPLICIT' | 'REPORTED' | 'PROVISIONAL' | 'INSUFFICIENT'
type Citation = { sourceReference: string; observedAt: string; publishedAt: PartialDate; providerEffectiveAt: string | null }
export type TemporalEvent = Citation & {
  playerId: string; clubId: string; context: Context['context']; targetContentHash: string
  kind: 'RENEWAL' | 'TRANSFER' | 'TERMINATION' | 'OPTION_EXERCISED' | 'OPTION_NOT_EXERCISED' | 'CONFLICT'
  evidenceStatus: EvidenceStatus
  newClubId: string | null; newUntil: PartialDate; optionIndex: number | null
}
export type TemporalInput = {
  contract: ContractInput
  publishedAt: PartialDate
  periodQualifier: { kind: 'SUMMER' | 'SEASON_END' | 'OTHER'; sourceText: string; sourceReference: string } | null
  // Context, never an expiry calculator. Season labels are not date values.
  competitionCalendar: { competitionId: string; season: string; cycle: 'CROSS_YEAR' | 'CALENDAR_YEAR' | 'UNKNOWN'; sourceReference: string } | null
  evidenceStatus: EvidenceStatus
  verification: { at: string; sourceReference: string; scope: 'AFFILIATION_ONLY' | 'CONTRACT_TERMS'; outcome: 'CORROBORATED' | 'INCONCLUSIVE' | 'CONFLICTED' } | null
  events: TemporalEvent[]
}
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason) }
function text(x: unknown) { return typeof x === 'string' && x.trim().length > 0 && x.length <= 1000 }
function ref(x: unknown) {
  check(typeof x === 'string' && /^[a-zA-Z0-9._/-]{1,160}$/.test(x) && !/(secret|password|token|api.?key)/i.test(x), 'INVALID_REFERENCE')
}
function instant(x: string) {
  check(typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x), 'INVALID_TIMESTAMP')
  validateDate({ value: x.slice(0, 10), datePrecision: 'DAY' })
  check(Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 19) === x.slice(0, 19), 'INVALID_TIMESTAMP')
  return new Date(x).toISOString()
}
function status(x: EvidenceStatus) {
  check(['OFFICIAL_EXPLICIT', 'REPORTED', 'PROVISIONAL', 'INSUFFICIENT'].includes(x), 'INVALID_EVIDENCE_STATUS')
}
function citation(x: Citation, asOf: string) {
  ref(x.sourceReference); validateDate(x.publishedAt)
  const observedAt = instant(x.observedAt)
  check(observedAt <= asOf, 'FUTURE_OBSERVATION')
  if (x.publishedAt.value !== null)
    check(x.publishedAt.value <= observedAt.slice(0, x.publishedAt.value.length), 'PUBLICATION_AFTER_OBSERVATION')
  return { ...x, observedAt, providerEffectiveAt: x.providerEffectiveAt === null ? null : instant(x.providerEffectiveAt) }
}

export function assessTemporal(input: TemporalInput, expected: Context, evaluationAt: string) {
  const asOf = instant(evaluationAt)
  const base = prepare(input.contract, expected)
  const source = citation({ ...base.data, publishedAt: input.publishedAt }, asOf)
  status(input.evidenceStatus)
  check(input.evidenceStatus !== 'OFFICIAL_EXPLICIT' || ['PRIMARY', 'SYNTHETIC'].includes(base.data.evidenceQuality), 'EVIDENCE_QUALITY_MISMATCH')
  const q = input.periodQualifier, calendar = input.competitionCalendar
  check(q === null || (q && ['SUMMER', 'SEASON_END', 'OTHER'].includes(q.kind) && text(q.sourceText)), 'INVALID_QUALIFIER')
  if (q) ref(q.sourceReference)
  check(calendar === null || (calendar && text(calendar.competitionId) && text(calendar.season) &&
    ['CROSS_YEAR', 'CALENDAR_YEAR', 'UNKNOWN'].includes(calendar.cycle)), 'INVALID_CALENDAR')
  if (calendar) { ref(calendar.sourceReference); check(calendar.season === expected.season, 'CALENDAR_CONTEXT_MISMATCH') }
  let verification = input.verification
  if (verification !== null) {
    check(verification && ['AFFILIATION_ONLY', 'CONTRACT_TERMS'].includes(verification.scope) &&
      ['CORROBORATED', 'INCONCLUSIVE', 'CONFLICTED'].includes(verification.outcome), 'INVALID_VERIFICATION')
    ref(verification.sourceReference)
    verification = { ...verification, at: instant(verification.at) }
    check(verification.at >= source.observedAt && verification.at <= asOf, 'INVALID_VERIFICATION_TIME')
  }
  check(Array.isArray(input.events), 'INVALID_EVENTS')
  const events = input.events.map(e => {
    check(e && e.playerId === expected.playerId && e.clubId === expected.clubId && e.context === expected.context &&
      e.targetContentHash === base.contentHash, 'EVENT_CONTEXT_MISMATCH')
    check(['RENEWAL', 'TRANSFER', 'TERMINATION', 'OPTION_EXERCISED', 'OPTION_NOT_EXERCISED', 'CONFLICT'].includes(e.kind), 'INVALID_EVENT')
    status(e.evidenceStatus); validateDate(e.newUntil)
    if (e.kind === 'TRANSFER') check(text(e.newClubId) && e.newClubId !== expected.clubId, 'INVALID_TRANSFER')
    else check(e.newClubId === null, 'UNEXPECTED_NEW_CLUB')
    if (e.kind.startsWith('OPTION_')) {
      check(Number.isInteger(e.optionIndex) && e.optionIndex! >= 0 && e.optionIndex! < (base.data.extensionOptions?.length ?? 0), 'UNKNOWN_OPTION')
      if (e.kind === 'OPTION_EXERCISED') check(hash(e.newUntil) === hash(base.data.extensionOptions![e.optionIndex!].until), 'OPTION_DATE_CONFLICT')
    } else check(e.optionIndex === null, 'UNEXPECTED_OPTION')
    if (e.kind === 'RENEWAL' || e.kind === 'OPTION_EXERCISED') check(e.newUntil.value !== null, 'EVENT_EXPIRY_REQUIRED')
    else check(e.newUntil.value === null, 'UNEXPECTED_EVENT_EXPIRY')
    const normalized = citation(e, asOf)
    if (source.providerEffectiveAt && normalized.providerEffectiveAt)
      check(normalized.providerEffectiveAt >= source.providerEffectiveAt, 'EVENT_PRECEDES_TARGET_EFFECTIVE_TIME')
    return { ...e, ...normalized }
  })
  check(new Set(events.map(e => hash(e))).size === events.length, 'DUPLICATE_EVENT')
  const reasons: string[] = []
  let assessment: 'CURRENT_CORROBORATED' | 'HISTORICAL_ONLY' | 'CONFLICTED' | 'INSUFFICIENT_EVIDENCE' = 'HISTORICAL_ONLY'
  if (base.data.contractUntil.value === null || input.evidenceStatus !== 'OFFICIAL_EXPLICIT') {
    assessment = 'INSUFFICIENT_EVIDENCE'; reasons.push('INSUFFICIENT_TERMS_EVIDENCE')
  } else if (verification?.scope === 'CONTRACT_TERMS' && verification.outcome === 'CORROBORATED' &&
    base.data.contractStatus !== 'INACTIVE' && base.data.identityConfidence === 'HIGH') {
    assessment = 'CURRENT_CORROBORATED'
  } else reasons.push('NO_CURRENT_TERMS_VERIFICATION')
  if (base.data.contractStatus === 'INACTIVE') { assessment = 'HISTORICAL_ONLY'; reasons.push('SOURCE_INACTIVE') }
  if (source.providerEffectiveAt && source.providerEffectiveAt > asOf) {
    assessment = 'INSUFFICIENT_EVIDENCE'; reasons.push('FUTURE_EFFECTIVE_CONTRACT')
  }
  const changes = events.filter(e => e.kind !== 'OPTION_NOT_EXERCISED' && e.kind !== 'CONFLICT')
  if (changes.some(e => e.evidenceStatus === 'OFFICIAL_EXPLICIT' && e.providerEffectiveAt !== null && e.providerEffectiveAt <= asOf)) {
    assessment = 'HISTORICAL_ONLY'; reasons.push('SUPERSEDED_REQUIRES_NEW_RECORD')
  } else if (changes.length) {
    assessment = 'INSUFFICIENT_EVIDENCE'; reasons.push('LATER_EVENT_REQUIRES_REVIEW')
  }
  const contradictoryOptions = events.some(e => e.kind === 'OPTION_EXERCISED' && events.some(other =>
    other.kind === 'OPTION_NOT_EXERCISED' && e.optionIndex === other.optionIndex))
  if (verification?.outcome === 'CONFLICTED' || events.some(e => e.kind === 'CONFLICT') || contradictoryOptions) {
    assessment = 'CONFLICTED'; reasons.push('CONFLICT_REQUIRES_REVIEW')
  }
  // Compare only at source precision: a past year/month has elapsed, but no
  // exact termination day is generated (nor any expiry from the league calendar).
  const expiry = base.data.contractUntil.value
  if (assessment === 'CURRENT_CORROBORATED' && expiry !== null && expiry < asOf.slice(0, expiry.length)) {
    assessment = 'HISTORICAL_ONLY'; reasons.push('DOCUMENTED_PERIOD_ELAPSED')
  }
  const data = structuredClone({ contract: base.data, publishedAt: source.publishedAt, periodQualifier: q,
    competitionCalendar: calendar, evidenceStatus: input.evidenceStatus, verification, events })
  const result = { temporalVersion, data, evaluationAt: asOf, lastVerifiedAt: verification?.at ?? null,
    assessment, abstentionReasons: reasons, negotiationsStatus: 'UNKNOWN' as const,
    legacyContentHash: base.contentHash, legacyObservationHash: base.observationHash,
    inputHash: hash({ temporalVersion, data }), currentEligible: false as const,
    publicationAllowed: false as const, persistenceEligible: false as const }
  return { ...result, artifactHash: hash(result) }
}
