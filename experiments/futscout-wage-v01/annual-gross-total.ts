/** Product semantics, not confirmation of a provider's salary definition or license. */
export const annualGrossTotalContract = Object.freeze({
  version: 'futscout-wage-total-remuneration-v1',
  annualTarget: 'EUR/GROSS/TOTAL/YEAR',
  weeklyTarget: 'EUR/GROSS/TOTAL/WEEK_EQUIVALENT',
  weeksPerYear: 52,
  supplierDefinition: 'PENDING_DOCUMENTARY_CONFIRMATION',
} as const)

/**
 * Pure arithmetic for an already identified annual gross total in EUR.
 * Includes salary, bonuses, benefits and image rights per the owner's definition.
 * Does not infer those semantics from a provider field, sum components, convert FX,
 * approve training labels, or describe the result as contractual weekly base pay.
 *
 * Original amount and supplied provenance are retained without mutation. Provenance
 * is passed through, not authenticated. Callers must retain the source record too.
 * Uses IEEE-754 numbers with no rounding to cents; not an exact decimal persistence
 * contract. Positive inputs that underflow to zero are rejected explicitly.
 */
export function convertAnnualGrossTotalEurToWeekly<P = undefined>(
  annualGrossEur: unknown,
  provenance?: P,
) {
  const metadata = { contract: annualGrossTotalContract, provenance }
  if (annualGrossEur === undefined)
    return { ...metadata, state: 'ABSENT' as const, annualGrossEur, weeklyEquivalentEur: undefined }
  if (annualGrossEur === null)
    return { ...metadata, state: 'NULL' as const, annualGrossEur, weeklyEquivalentEur: null }
  if (typeof annualGrossEur !== 'number') throw new TypeError('WAGE_ANNUAL_AMOUNT_NOT_NUMBER')
  if (!Number.isFinite(annualGrossEur)) throw new RangeError('WAGE_ANNUAL_AMOUNT_NOT_FINITE')
  if (annualGrossEur < 0) throw new RangeError('WAGE_ANNUAL_AMOUNT_NEGATIVE')

  const weeklyEquivalentEur = annualGrossEur / annualGrossTotalContract.weeksPerYear
  if (annualGrossEur > 0 && weeklyEquivalentEur === 0)
    throw new RangeError('WAGE_WEEKLY_EQUIVALENT_UNDERFLOW')
  return { ...metadata, state: annualGrossEur === 0 ? 'ZERO' as const : 'VALUE' as const,
    annualGrossEur, weeklyEquivalentEur }
}
