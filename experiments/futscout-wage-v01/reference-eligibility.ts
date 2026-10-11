import { hash, normalizeBase, target, type Salary, type FX } from './engine'

export const eligibilityVersion = 'futscout-wage-reference-v0.1'
type Permission = 'CONFIRMED' | 'RESTRICTED' | 'UNKNOWN'
export type Reference = {
  salary: Salary; fx?: FX
  nature: 'OBSERVED' | 'PROVIDER_ESTIMATE'
  sourceReference: string
  rights: { training: Permission; calibration: Permission; evidenceReference: string }
  identity: { playerId: string; sourcePlayerId: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; evidenceReference: string }
  context: { playerId: string; clubId: string; sourceClubId: string; season: string; sourceSeason: string
    seasonStart: string; seasonEnd: string; referenceAt: string }
}
export type Classification = 'ELIGIBLE' | 'RIGHTS_UNKNOWN' | 'IDENTITY_INSUFFICIENT' |
  'TEMPORAL_MISMATCH' | 'SEMANTICS_INCOMPATIBLE' | 'INVALID_VALUE'
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0
function instant(s: unknown): number {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(s)) return NaN
  const time = Date.parse(s)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === s.slice(0, 10) ? time : NaN
}
/** Pure offline gate. Evidence references are assertions for review, not automatically verified licenses. */
export function assessReference(reference: Reference) {
  const reasons: { classification: Exclude<Classification, 'ELIGIBLE'>; code: string }[] = []
  const reject = (classification: Exclude<Classification, 'ELIGIBLE'>, code: string) => reasons.push({ classification, code })
  const { salary, identity, context, rights } = reference
  if (rights.training !== 'CONFIRMED' || rights.calibration !== 'CONFIRMED' || !text(rights.evidenceReference))
    reject('RIGHTS_UNKNOWN', rights.training === 'RESTRICTED' || rights.calibration === 'RESTRICTED' ? 'RIGHTS_RESTRICTED' : 'RIGHTS_NOT_DOCUMENTED')
  if (identity.confidence !== 'HIGH' || !text(identity.playerId) || !text(identity.sourcePlayerId) ||
    identity.playerId !== context.playerId || !text(identity.evidenceReference)) reject('IDENTITY_INSUFFICIENT', 'IDENTITY_NOT_PROVEN')
  const start = instant(context.seasonStart), end = instant(context.seasonEnd), ref = instant(context.referenceAt)
  const effective = instant(salary.effectiveAt), observed = instant(salary.observedAt)
  if (!text(context.clubId) || context.clubId !== context.sourceClubId || !text(context.season) || context.season !== context.sourceSeason ||
    ![start, end, ref, effective, observed].every(Number.isFinite) || start > end || ref < start || ref > end ||
    effective < start || effective > end || effective > ref || observed < effective)
    reject('TEMPORAL_MISMATCH', 'CLUB_SEASON_OR_EFFECTIVE_TIME_UNPROVEN')
  if (salary.tax !== 'GROSS' || salary.component !== 'BASE' || !['WEEK', 'YEAR'].includes(salary.period) ||
    !['OBSERVED', 'PROVIDER_ESTIMATE'].includes(reference.nature) || !text(salary.source) || !text(reference.sourceReference) ||
    !Intl.supportedValuesOf('currency').includes(salary.currency)) reject('SEMANTICS_INCOMPATIBLE', 'GROSS_BASE_UNIT_OR_PROVENANCE_REQUIRED')
  const amountState = salary.amount === undefined ? 'ABSENT' : salary.amount === null ? 'NULL' : salary.amount === 0 ? 'ZERO' : 'VALUE'
  if (typeof salary.amount !== 'number' || !Number.isFinite(salary.amount) || salary.amount <= 0)
    reject('INVALID_VALUE', amountState === 'ZERO' ? 'ZERO_NOT_LOG_LABEL' : amountState === 'NULL' || amountState === 'ABSENT' ? amountState : 'NON_POSITIVE_OR_NON_FINITE')
  let normalized: ReturnType<typeof normalizeBase> | null = null
  if (!reasons.some(r => r.classification === 'SEMANTICS_INCOMPATIBLE' || r.classification === 'TEMPORAL_MISMATCH') &&
    typeof salary.amount === 'number' && Number.isFinite(salary.amount) && salary.amount >= 0) {
    try {
      if (salary.currency !== 'EUR' && (!reference.fx || !Number.isFinite(instant(reference.fx.date)) || instant(reference.fx.date) > ref))
        throw Error('DATED_FX_REQUIRED')
      normalized = normalizeBase(salary, reference.fx)
      if (normalized.amountEURWeekly === null || !Number.isFinite(normalized.amountEURWeekly) || normalized.amountEURWeekly <= 0) {
        if (!reasons.some(r => r.classification === 'INVALID_VALUE')) reject('INVALID_VALUE', 'NORMALIZED_NON_POSITIVE')
      }
    } catch { reject('INVALID_VALUE', 'NORMALIZATION_FAILED') }
  }
  // ABSENT and NULL are represented distinctly before canonical hashing; invalid non-finite inputs cannot be hashed.
  let inputHash: string | null = null
  try { inputHash = hash({ ...reference, fx: reference.fx ?? null, salary: { ...salary, amount: salary.amount ?? null }, amountState }) }
  catch { reject('INVALID_VALUE', 'UNHASHABLE_INPUT') }
  const classification: Classification = reasons[0]?.classification ?? 'ELIGIBLE'
  const result = { eligibilityVersion, classification, reasons, inputHash, amountState, nature: reference.nature,
    target, normalized, publicationAllowed: false as const }
  return { ...result, resultHash: hash({ eligibilityVersion, classification, reasons, inputHash, amountState,
    nature: reference.nature, target, amountEURWeekly: normalized?.amountEURWeekly ?? null, publicationAllowed: false }) }
}
