import { convertAnnualGrossTotalEurToWeekly as convert } from './annual-gross-total'
import { alignSeason } from './season-alignment'

export type RemunerationStatus = 'CONFIRMED_CURRENT' | 'LAST_KNOWN_UNVERIFIED' | 'HISTORICAL_ONLY' | 'CONFLICT'
type Period = Readonly<{ start: string; end: string; reference: string }>
export type RemunerationObservation = Readonly<{
  id: string; playerId: string; clubId: string | null; season: string | null
  annualGrossEur: number | null | undefined; sourceReference: string
  observedAt: string
  // Documented season bounds order records; they do NOT establish salary validity.
  seasonPeriod: Period | null
  // Source-declared edition/calendar, never inferred contract dates.
  seasonEvidence?: Readonly<{
    startingYear: number; endingYear: number; calendar: 'ANNUAL' | 'SPLIT_YEAR'; reference: string
  }> | null
  effectiveDate?: Readonly<{ date: string; reference: string }> | null
}>
export type RemunerationInput = Readonly<{
  playerId: string; asOf: string; currentClubId: string | null
  personalIdentity: 'HIGH' | 'MEDIUM' | 'LOW' | 'CONFLICT' | 'UNKNOWN'
  observations: readonly RemunerationObservation[]
  confirmations?: readonly Readonly<{
    observationId: string; clubId: string; annualGrossEur: number
    validity: Period; observedAt: string
  }>[]
  events?: readonly Readonly<{
    kind: 'TRANSFER' | 'RENEWAL' | 'TERMINATION'; date: string; reference: string
    observedAt: string
  }>[]
}>

const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE')
  return value
}
function reference(value: string) { if (!value.trim()) throw new Error('MISSING_EVIDENCE_REFERENCE') }
function period(value: Period) {
  reference(value.reference)
  if (day(value.start) > day(value.end)) throw new Error('INVALID_PERIOD')
}

function documentedSeason(observation: RemunerationObservation) {
  const evidence = observation.seasonEvidence
  if (!evidence) return { years: null, conflict: false }
  const { startingYear, endingYear, calendar } = evidence
  const source = { season: observation.season, evidenceReference: evidence.reference, effectiveDate: null }
  const aligned = alignSeason({ calendar, calendarEvidence: evidence.reference, salary: source, rating: source })
  const expected = calendar === 'ANNUAL' ? String(startingYear) : `${startingYear}/${endingYear}`
  const conflict = !Number.isSafeInteger(startingYear) || !Number.isSafeInteger(endingYear) ||
    startingYear < 1000 || endingYear > 9999 ||
    endingYear !== startingYear + (calendar === 'SPLIT_YEAR' ? 1 : 0) ||
    aligned.salarySeason !== expected || aligned.classification !== 'SAME_SEASON' ||
    [observation.seasonPeriod?.start, observation.seasonPeriod?.end, observation.effectiveDate?.date]
      .some(date => date != null && (Number(date.slice(0, 4)) < startingYear || Number(date.slice(0, 4)) > endingYear))
  return { years: conflict ? null : evidence, conflict }
}

/** Pure, conservative assessment, not a rights/identity/label gate.
 * Evidence references are caller-supplied, not authenticated here. No ambient clock,
 * source mutation, imputation, currency conversion or inference of contract dates.
 * Edition ordering does not establish salary validity. Overlapping/incomparable
 * ranges cannot be ordered by collection time or array position.
 */
export function selectLastKnownRemuneration(input: RemunerationInput) {
  const asOf = day(input.asOf)
  reference(input.playerId)
  const ids = new Set<string>()
  const rows = input.observations.map(observation => {
    reference(observation.id); reference(observation.sourceReference)
    if (observation.playerId !== input.playerId) throw new Error('PLAYER_ID_MISMATCH')
    if (ids.has(observation.id)) throw new Error('DUPLICATE_OBSERVATION_ID')
    ids.add(observation.id)
    day(observation.observedAt)
    if (observation.seasonPeriod) period(observation.seasonPeriod)
    const effective = observation.effectiveDate
    if (effective) {
      day(effective.date); reference(effective.reference)
      if (observation.seasonPeriod && (effective.date < observation.seasonPeriod.start ||
          effective.date > observation.seasonPeriod.end)) throw new Error('EFFECTIVE_DATE_OUTSIDE_SEASON')
    }
    const start = effective?.date ?? observation.seasonPeriod?.start ?? null
    const end = effective?.date ?? observation.seasonPeriod?.end ?? null
    return { observation, conversion: convert(observation.annualGrossEur, observation.sourceReference), start, end,
      season: documentedSeason(observation) }
  }).sort((a, b) => order(a.observation.id, b.observation.id))
  const confirmations = input.confirmations ?? []
  for (const proof of confirmations) {
    if (!ids.has(proof.observationId)) throw new Error('UNKNOWN_CONFIRMATION_OBSERVATION')
    reference(proof.clubId); period(proof.validity); day(proof.observedAt)
    if (convert(proof.annualGrossEur).state !== 'VALUE') throw new Error('INVALID_CONFIRMED_AMOUNT')
  }
  const events = input.events ?? []
  for (const event of events) { day(event.date); day(event.observedAt); reference(event.reference) }
  const positives = rows.filter(r => r.conversion.state === 'VALUE' && r.observation.observedAt <= asOf &&
    (r.start === null || r.start <= asOf) &&
    (r.season.years === null || r.season.years.startingYear <= Number(asOf.slice(0, 4))))
  const documentaryConflict = positives.some(r => r.season.conflict)
  const later = (a: typeof rows[number], b: typeof rows[number]) => {
    // When both records have dates, keep their stronger ordering/overlap evidence.
    if (a.start !== null && b.end !== null) return a.start > b.end
    const x = a.season.years, y = b.season.years
    if (!x || !y) return false
    // Adjacent editions in the same calendar may share an ending/starting year.
    if (x.calendar === y.calendar) return x.startingYear > y.startingYear
    // Mixed calendars are comparable only when even their year ranges are disjoint.
    return x.startingYear > y.endingYear
  }
  const latest = positives.filter(r => !positives.some(other => later(other, r)))
  const temporalKey = (r: typeof rows[number]) => r.start !== null ? ['DATE', r.start, r.end] :
    r.season.years ? ['SEASON', r.season.years.calendar, r.season.years.startingYear, r.season.years.endingYear] : null
  const ambiguous = latest.length > 1 && (latest.some(r => temporalKey(r) === null) ||
    new Set(latest.map(r => JSON.stringify([temporalKey(r), r.observation.clubId,
      r.observation.annualGrossEur, r.observation.sourceReference]))).size > 1)
  const ambiguityReason = latest.some(r => temporalKey(r) === null) ? 'TEMPORAL_EVIDENCE_MISSING' :
    new Set(latest.map(r => JSON.stringify(temporalKey(r)))).size === 1 ? 'SAME_PERIOD_REFERENCES_AMBIGUOUS' : 'TEMPORAL_RANGES_INCOMPARABLE'
  const latestIds = new Set(latest.map(r => r.observation.id))
  const assessments = rows.map(r => {
    const o = r.observation
    let classification: RemunerationStatus | null = null
    let reason: string
    if (r.conversion.state !== 'VALUE') reason = 'NO_POSITIVE_REFERENCE'
    else if (!positives.includes(r)) reason = 'NOT_AVAILABLE_AS_OF'
    else if (documentaryConflict) { classification = 'CONFLICT'; reason = 'SEASON_DOCUMENTATION_CONFLICT' }
    else if (!latestIds.has(o.id)) { classification = 'HISTORICAL_ONLY'; reason = 'SUPERSEDED_REFERENCE' }
    else if (ambiguous) { classification = 'CONFLICT'; reason = ambiguityReason }
    else {
      const proofs = confirmations.filter(p => p.observationId === o.id && p.observedAt <= asOf)
      const active = proofs.filter(p => p.validity.start <= asOf && asOf <= p.validity.end)
      const contradiction = active.some(p => p.clubId !== o.clubId || p.annualGrossEur !== o.annualGrossEur)
      const relevantEvents = events.filter(e => e.observedAt <= asOf && e.date <= asOf &&
        (r.start !== null ? e.date >= r.start : r.season.years === null || Number(e.date.slice(0, 4)) >= r.season.years.startingYear))
      const supported = active.some(p => p.clubId === o.clubId && p.clubId === input.currentClubId &&
        p.annualGrossEur === o.annualGrossEur && relevantEvents.every(e => p.validity.start >= e.date))
      if (contradiction) { classification = 'CONFLICT'; reason = 'AMOUNT_OR_CLUB_EVIDENCE_CONFLICT' }
      else if (o.clubId !== null && input.currentClubId !== null && o.clubId !== input.currentClubId) {
        classification = 'HISTORICAL_ONLY'; reason = 'DIFFERENT_CURRENT_CLUB'
      } else if (supported) { classification = 'CONFIRMED_CURRENT'; reason = 'EXPLICIT_AMOUNT_AND_VALIDITY' }
      else if (relevantEvents.some(e => e.kind !== 'RENEWAL') || (proofs.length > 0 && proofs.every(p => p.validity.end < asOf))) {
        classification = 'HISTORICAL_ONLY'; reason = 'ENDED_OR_CHANGED_CONTRACT_CONTEXT'
      } else { classification = 'LAST_KNOWN_UNVERIFIED'; reason = relevantEvents.length ? 'RENEWAL_WITHOUT_CONFIRMED_AMOUNT' : 'CURRENT_VALIDITY_UNPROVEN' }
    }
    const issueKind = classification !== 'CONFLICT' ? null : reason === 'SEASON_DOCUMENTATION_CONFLICT' ?
      'DOCUMENTARY_CONFLICT' : reason === 'AMOUNT_OR_CLUB_EVIDENCE_CONFLICT' ? 'SALARY_OR_CLUB_CONFLICT' : 'TEMPORAL_AMBIGUITY'
    return { observationId: o.id, original: o, conversion: r.conversion, classification, reason, issueKind }
  })
  const conflicts = assessments.some(r => r.classification === 'CONFLICT')
  return {
    version: 'wage-last-known-v0.2', asOf, playerId: input.playerId,
    personalIdentity: input.personalIdentity,
    clubTemporalContext: { currentClubId: input.currentClubId },
    salaryEligibility: { trainingAllowed: false, publicationAllowed: false, reason: 'NOT_ASSESSED_BY_TEMPORAL_SELECTOR' },
    selectedObservationId: conflicts ? null : latest[0]?.observation.id ?? null,
    classification: conflicts ? 'CONFLICT' as const : assessments.find(r => r.observationId === latest[0]?.observation.id)?.classification ?? null,
    assessments,
  }
}
