import {
  assessFootyStatsOfflineIdentity,
  type FootyIdentityInput,
} from '../../services/footyStatsOfflineIdentityAdapter'
import {
  selectLastKnownRemuneration,
  type RemunerationInput,
  type RemunerationObservation,
} from './last-known-remuneration'

export type OfflineWageObservation = Readonly<Omit<RemunerationObservation, 'playerId' | 'clubId' | 'annualGrossEur'> & {
  footyStatsId: number
  footyClubId: number | null
  annualAmount: number | null | undefined
  units: Readonly<{
    currency: string | null
    period: 'YEAR' | 'WEEK' | 'UNKNOWN'
    tax: 'GROSS' | 'NET' | 'UNKNOWN'
    component: 'TOTAL' | 'BASE' | 'UNKNOWN'
  }>
  // Preserve the distinction between owner-declared semantics and supplier proof.
  definition: Readonly<{
    basis: 'OWNER_DECLARED' | 'PROVIDER_DOCUMENTED' | 'UNKNOWN'
    reference: string | null
  }>
}>
type Confirmation = NonNullable<RemunerationInput['confirmations']>[number]
export type OfflineWageInput = Readonly<{
  identity: FootyIdentityInput
  asOf: string
  observations: readonly OfflineWageObservation[]
  confirmations?: readonly Readonly<Omit<Confirmation, 'clubId'> & { footyClubId: number }>[]
  events?: RemunerationInput['events']
}>

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
// Stable audit ordering, not a priority rule or a temporal tie breaker.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => compare(a, b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
const sorted = <T>(values: readonly T[]) => [...values].sort((a, b) => compare(canonical(a), canonical(b)))
const validId = (id: number) => Number.isSafeInteger(id) && id > 0

/** One source person per invocation. Caller supplies the complete collision/evidence
 * context; no files, environment, DB, network, persistence or ambient clock.
 * HIGH permits an offline person association, never an identity registry write.
 * Club IDs passed to the temporal selector are exclusively FootyStats IDs.
 * seasonEvidence orders editions; neither it nor HIGH proves salary validity.
 * Original records are preserved separately from the selector's normalized view.
 */
export function runOfflineWagePipeline(input: OfflineWageInput) {
  const footyStatsId = input.identity.source.footyStatsId
  if (!validId(footyStatsId)) throw new Error('INVALID_FOOTYSTATS_ID')
  if (input.identity.source.clubId !== null && !validId(input.identity.source.clubId)) throw new Error('INVALID_FOOTYSTATS_CLUB_ID')
  const seen = new Set<string>()
  for (const observation of input.observations) {
    if (observation.footyStatsId !== footyStatsId) throw new Error('SALARY_SOURCE_ID_MISMATCH')
    if (!observation.id.trim() || seen.has(observation.id)) throw new Error('INVALID_OR_DUPLICATE_SALARY_ID')
    if (!observation.sourceReference.trim()) throw new Error('SALARY_PROVENANCE_REQUIRED')
    if (observation.footyClubId !== null && !validId(observation.footyClubId)) throw new Error('INVALID_FOOTYSTATS_CLUB_ID')
    seen.add(observation.id)
  }
  for (const proof of input.confirmations ?? []) {
    if (!seen.has(proof.observationId)) throw new Error('UNKNOWN_SALARY_CONFIRMATION')
    if (!validId(proof.footyClubId)) throw new Error('INVALID_FOOTYSTATS_CLUB_ID')
  }
  const candidates = assessFootyStatsOfflineIdentity(input.identity)
  const match = candidates.length === 1 && candidates[0].classification === 'HIGH' ? candidates[0] : null
  const sourceEvidence = {
    footyStatsId,
    observations: [...input.observations].sort((a, b) => compare(a.id, b.id)),
    confirmations: sorted(input.confirmations ?? []),
    events: sorted(input.events ?? []),
  }
  const incompatible = sourceEvidence.observations.filter(o => o.units.currency !== 'EUR' ||
    o.units.period !== 'YEAR' || o.units.tax !== 'GROSS' || o.units.component !== 'TOTAL').map(o => o.id)
  const blockReason = !match ? 'UNIQUE_HIGH_IDENTITY_REQUIRED' : incompatible.length ? 'INCOMPATIBLE_SALARY_UNITS_OR_DEFINITION' : null
  // Do not drop incompatible records and silently select an older compatible wage.
  const lastKnownRemuneration = blockReason === null ? selectLastKnownRemuneration({
    playerId: String(footyStatsId),
    asOf: input.asOf,
    personalIdentity: 'HIGH',
    currentClubId: input.identity.source.clubId === null ? null : String(input.identity.source.clubId),
    observations: sourceEvidence.observations.map(o => ({
      id: o.id, playerId: String(o.footyStatsId), clubId: o.footyClubId === null ? null : String(o.footyClubId),
      season: o.season, annualGrossEur: o.annualAmount, sourceReference: o.sourceReference,
      observedAt: o.observedAt, seasonPeriod: o.seasonPeriod, seasonEvidence: o.seasonEvidence,
      effectiveDate: o.effectiveDate,
    })),
    confirmations: sourceEvidence.confirmations.map(({ footyClubId, ...proof }) => ({ ...proof, clubId: String(footyClubId) })),
    events: sourceEvidence.events,
  }) : null
  return {
    version: 'wage-offline-pipeline-v0.1',
    asOf: input.asOf,
    identity: { candidates, uniqueHigh: match !== null },
    association: match && blockReason === null ? { footyStatsId, eaId: match.eaId, playerId: match.playerId, persisted: false } : null,
    clubTemporalContext: {
      sourceClubId: input.identity.source.clubId, sourceSeason: input.identity.source.season,
      candidates: candidates.map(c => ({ eaId: c.eaId, ...c.sportingContext })),
      currentClubConfirmed: false,
    },
    sourceEvidence,
    lastKnownRemuneration,
    blockReason,
    incompatibleObservationIds: incompatible,
    salaryEligibility: {
      trainingAllowed: false, publicationAllowed: false,
      reason: 'IDENTITY_AND_TEMPORAL_ASSESSMENT_DO_NOT_QUALIFY_SALARY_LABELS',
    },
    writable: false,
  } as const
}
