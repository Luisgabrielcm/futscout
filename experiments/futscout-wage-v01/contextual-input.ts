import { hash, normalizeBase } from './engine'
import { assessReference, type Reference } from './reference-eligibility'

type Measurement = { value: number; unit: string; effectiveAt: string; evidenceReference: string }
export type ContextualInput = {
  reference: Reference
  leagueId: string
  dateOfBirth: string
  position: 'GK' | 'DEF' | 'MID' | 'ATT' | null
  positionEvidence: string | null
  guaranteedAnnualUSD: number | null
  affiliation: { playingClubId: string | null; payerClubId: string | null
    status: 'UNKNOWN' | 'LOAN' | 'TRANSFER' | 'DIRECT'; evidenceReference: string | null }
  experience?: Measurement | null
  performance?: Measurement | null
  financialCapacity?: Measurement | null
}
function date(value: string): number {
  const n = Date.parse(value)
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/.test(value) ||
      !Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value.slice(0, 10)) throw Error('INVALID_DATE')
  return n
}
/** Offline preparation, not inference. Labels and identifiers never enter the predictor vector. */
export function prepareContextualInput(input: ContextualInput) {
  const { reference: r } = input
  if (!r.identity.playerId || !r.context.clubId || !input.leagueId || r.identity.playerId !== r.context.playerId ||
      r.identity.confidence !== 'HIGH' || !r.identity.evidenceReference.trim()) throw Error('IDENTITY_INSUFFICIENT')
  if (!/^\d{4}(?:[/-](?:\d{2}|\d{4}))?$/.test(r.context.season) || r.context.season !== r.context.sourceSeason)
    throw Error('INCOMPATIBLE_SEASON')
  const ref = date(r.context.referenceAt), birth = date(input.dateOfBirth)
  if (birth > ref || ref < date(r.context.seasonStart) || ref > date(r.context.seasonEnd)) throw Error('INCOMPATIBLE_DATE')
  if (input.position !== null && (!['GK', 'DEF', 'MID', 'ATT'].includes(input.position) || !input.positionEvidence?.trim()))
    throw Error('POSITION_UNPROVEN')
  if (r.salary.currency !== 'USD' || r.salary.period !== 'YEAR' || r.salary.component !== 'BASE') throw Error('INCOMPATIBLE_LABEL')
  for (const n of [r.salary.amount, input.guaranteedAnnualUSD])
    if (n != null && (!Number.isFinite(n) || n < 0)) throw Error('INVALID_VALUE')
  if (input.affiliation.status !== 'UNKNOWN' && !input.affiliation.evidenceReference?.trim()) throw Error('AFFILIATION_UNPROVEN')
  if (input.affiliation.payerClubId !== null && !input.affiliation.evidenceReference?.trim()) throw Error('PAYER_UNPROVEN')
  const measurement = (m: Measurement | null | undefined) => {
    if (m == null) return null
    if (!Number.isFinite(m.value) || m.value < 0 || !m.unit.trim() || !m.evidenceReference.trim() || date(m.effectiveAt) > ref)
      throw Error('INVALID_CONTEXT_MEASUREMENT')
    return { ...m }
  }
  const features = { leagueId: input.leagueId, clubId: r.context.clubId, season: r.context.season,
    position: input.position, ageYears: (ref - birth) / (365.2425 * 86400000),
    experience: measurement(input.experience), performance: measurement(input.performance),
    financialCapacity: measurement(input.financialCapacity) }
  const eligibility = assessReference(r)
  const normalized = eligibility.reasons.length === 0 ? normalizeBase(r.salary, r.fx) : null
  const result = { version: 'wage-contextual-input-v0.1', playerId: r.identity.playerId,
    features, labels: { baseAnnualUSD: r.salary.amount ?? null,
      baseState: r.salary.amount === undefined ? 'ABSENT' : r.salary.amount === null ? 'NULL' : r.salary.amount === 0 ? 'ZERO' : 'VALUE',
      guaranteedAnnualUSD: input.guaranteedAnnualUSD, normalized },
    provenance: { sourceReference: r.sourceReference, identity: { ...r.identity }, rights: { ...r.rights },
      salary: { ...r.salary, amount: r.salary.amount ?? null }, context: { ...r.context }, positionEvidence: input.positionEvidence },
    affiliation: { ...input.affiliation }, eligibility,
    trainingAllowed: false, publicationAllowed: false }
  return { ...result, featureHash: hash(features), resultHash: hash(result) }
}
