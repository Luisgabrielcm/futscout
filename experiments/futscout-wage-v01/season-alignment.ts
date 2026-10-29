import { hash } from './engine'

export type SeasonEvidence = {
  season: string | null
  evidenceReference: string | null
  effectiveDate: string | null
}
export type AlignmentInput = {
  calendar: 'ANNUAL' | 'SPLIT_YEAR' | 'UNKNOWN'
  calendarEvidence: string | null
  salary: SeasonEvidence
  rating: SeasonEvidence
  // A collection/import timestamp is deliberately not an effective date.
  ratingObservedAt?: string | null
  clubContext?: { salaryClubId: string; ratingClubId: string; transferOrLoanEvidence: string | null }
}
function day(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const n = Date.parse(value)
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null
}
function season(value: SeasonEvidence, calendar: AlignmentInput['calendar']): string | null {
  if (!value.evidenceReference?.trim() || !value.season) return null
  if (calendar === 'ANNUAL') return /^\d{4}$/.test(value.season) ? value.season : null
  const match = /^(\d{4})[/-](\d{2}|\d{4})$/.exec(value.season)
  if (calendar !== 'SPLIT_YEAR' || !match) return null
  const next = Number(match[1]) + 1
  return Number(match[2]) === (match[2].length === 2 ? next % 100 : next) ? `${match[1]}/${next}` : null
}
/** Exploratory season comparison only; never grants rights or calibration eligibility. */
export function alignSeason(input: AlignmentInput) {
  const salarySeason = season(input.salary, input.calendar)
  const ratingSeason = season(input.rating, input.calendar)
  const a = day(input.salary.effectiveDate), b = day(input.rating.effectiveDate)
  const distanceDays = a !== null && b !== null ? Math.abs(b - a) / 86400000 : null
  const supported = !!input.calendarEvidence?.trim() && salarySeason !== null && ratingSeason !== null
  const classification = !supported ? 'UNKNOWN' : salarySeason !== ratingSeason ? 'DIFFERENT_SEASON' :
    distanceDays === 0 ? 'EXACT_DATE' : 'SAME_SEASON'
  const result = { version: 'wage-season-alignment-v0.1', classification, salarySeason, ratingSeason,
    distanceDays, exploratoryComparable: classification === 'EXACT_DATE' || classification === 'SAME_SEASON',
    temporalCaveat: classification !== 'EXACT_DATE', clubContext: input.clubContext ?? null,
    trainingAllowed: false, publicationAllowed: false }
  return { ...result, inputHash: hash(input), resultHash: hash(result) }
}
