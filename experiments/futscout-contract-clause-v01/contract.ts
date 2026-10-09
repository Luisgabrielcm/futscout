// Pure offline contract. No provider adapter, database writer or current selector.
import { createHash } from 'node:crypto'

export const modelVersion = 'futscout-contract-clause-v0.1'
export const inputSchemaVersion = 'futscout-contract-clause-input-v0.1'
export type PartialDate =
  | { value: string; datePrecision: 'DAY' | 'MONTH' | 'YEAR' }
  | { value: null; datePrecision: 'UNKNOWN' }
export type Context = { playerId: string; clubId: string; context: 'REAL_WORLD' | 'EA_CAREER'; season: string }
export type Clause = {
  status: 'CONFIRMED' | 'REPORTED' | 'UNKNOWN' | 'CONFIRMED_NONE'
  amount: string | null
  currency: string | null
  clauseType: string | null
  activationConditions: string | null
  sourceReference: string | null
  explicitEvidence: string | null
}
export type ContractInput = Context & {
  provider: string; sourceReference: string; observedAt: string; providerEffectiveAt: string | null
  signedAt: PartialDate; contractUntil: PartialDate
  contractStatus: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN'
  // null = no information; [] = explicitly no options reported by the source.
  extensionOptions: { holder: 'PLAYER' | 'CLUB' | 'MUTUAL' | 'UNKNOWN'; until: PartialDate;
    conditions: string | null; sourceReference: string }[] | null
  identityConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  evidenceQuality: 'PRIMARY' | 'SECONDARY' | 'UNVERIFIED' | 'SYNTHETIC'
  provenance: { evidenceReference: string; rights: 'AUTHORIZED' | 'UNKNOWN' | 'RESTRICTED'; synthetic: boolean }
  releaseClause: Clause
}
function requireValue(ok: unknown, error: string): asserts ok {
  if (!ok) throw new Error(error)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1000
}
function reference(value: unknown) {
  // Local evidence identifiers, not URLs or credentials. URLs belong in a reviewed evidence catalog.
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9._/-]{1,160}$/.test(value) &&
    !/(secret|password|token|api.?key)/i.test(value), 'INVALID_REFERENCE')
}
export function validateDate(date: PartialDate): void {
  requireValue(date && typeof date === 'object', 'INVALID_DATE')
  if (date.datePrecision === 'UNKNOWN') {
    requireValue(date.value === null, 'UNKNOWN_DATE_MUST_BE_NULL'); return
  }
  const patterns = { DAY: /^\d{4}-\d{2}-\d{2}$/, MONTH: /^\d{4}-\d{2}$/, YEAR: /^\d{4}$/ }
  requireValue(date.datePrecision in patterns && typeof date.value === 'string' &&
    patterns[date.datePrecision].test(date.value) && Number(date.value.slice(0, 4)) > 0, 'INVALID_DATE')
  const anchor = date.value + (date.datePrecision === 'YEAR' ? '-01-01' : date.datePrecision === 'MONTH' ? '-01' : '')
  requireValue(Number.isFinite(Date.parse(anchor)) && new Date(anchor).toISOString().slice(0, 10) === anchor, 'INVALID_DATE')
  // Validation anchor is never returned or stored as a factual date.
}
function instant(value: string): string {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value), 'INVALID_INSTANT')
  validateDate({ value: value.slice(0, 10), datePrecision: 'DAY' })
  requireValue(Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19), 'INVALID_INSTANT')
  return new Date(value).toISOString()
}
export function hash(value: unknown): string {
  function canonical(x: unknown): unknown {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return x
    if (typeof x === 'number' && Number.isFinite(x)) return x
    if (Array.isArray(x)) return x.map(canonical)
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype)
      return Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]))
    throw new Error('INVALID_HASH_INPUT')
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
export function normalizeClause(clause: Clause): Clause {
  requireValue(clause && ['CONFIRMED', 'REPORTED', 'UNKNOWN', 'CONFIRMED_NONE'].includes(clause.status), 'INVALID_CLAUSE_STATUS')
  if (clause.status === 'UNKNOWN' || clause.status === 'CONFIRMED_NONE') {
    requireValue(clause.amount === null && clause.currency === null && clause.clauseType === null && clause.activationConditions === null, 'NO_INFERRED_CLAUSE')
  } else {
    requireValue(text(clause.clauseType), 'CLAUSE_TYPE_REQUIRED')
    requireValue((clause.amount === null && clause.currency === null) ||
      (typeof clause.amount === 'string' && /^\d{1,18}(?:\.\d{1,2})?$/.test(clause.amount) &&
        ['EUR', 'USD', 'GBP', 'SAR', 'BRL', 'JPY'].includes(clause.currency ?? '')), 'INVALID_MONEY')
    requireValue(clause.activationConditions === null || text(clause.activationConditions), 'INVALID_CONDITIONS')
  }
  if (clause.status !== 'UNKNOWN') {
    reference(clause.sourceReference)
    requireValue(text(clause.explicitEvidence), 'EXPLICIT_EVIDENCE_REQUIRED')
  } else {
    if (clause.sourceReference !== null) reference(clause.sourceReference)
    requireValue(clause.explicitEvidence === null || text(clause.explicitEvidence), 'INVALID_EVIDENCE')
  }
  let amount = clause.amount
  if (amount !== null) {
    const [whole, fraction = ''] = amount.split('.')
    amount = `${BigInt(whole)}.${fraction.padEnd(2, '0')}`
  }
  return { ...clause, amount }
}
export function prepare(input: ContractInput, expected: Context) {
  requireValue(input && expected, 'CONTEXT_REQUIRED')
  for (const key of ['playerId', 'clubId', 'context', 'season'] as const)
    requireValue(text(input[key]) && input[key] === expected[key], 'CONTEXT_MISMATCH')
  requireValue(['REAL_WORLD', 'EA_CAREER'].includes(input.context), 'INVALID_CONTEXT')
  requireValue(typeof input.provider === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(input.provider), 'INVALID_PROVIDER')
  reference(input.sourceReference)
  const observedAt = instant(input.observedAt)
  const providerEffectiveAt = input.providerEffectiveAt === null ? null : instant(input.providerEffectiveAt)
  validateDate(input.signedAt); validateDate(input.contractUntil)
  requireValue(['ACTIVE', 'INACTIVE', 'UNKNOWN'].includes(input.contractStatus), 'INVALID_STATUS')
  requireValue(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(input.identityConfidence), 'INVALID_IDENTITY_CONFIDENCE')
  requireValue(['PRIMARY', 'SECONDARY', 'UNVERIFIED', 'SYNTHETIC'].includes(input.evidenceQuality), 'INVALID_EVIDENCE_QUALITY')
  requireValue(input.provenance && ['AUTHORIZED', 'UNKNOWN', 'RESTRICTED'].includes(input.provenance.rights) &&
    typeof input.provenance.synthetic === 'boolean' && (input.evidenceQuality === 'SYNTHETIC') === input.provenance.synthetic, 'INVALID_PROVENANCE')
  reference(input.provenance.evidenceReference)
  requireValue(input.extensionOptions === null || Array.isArray(input.extensionOptions), 'INVALID_OPTIONS')
  for (const option of input.extensionOptions ?? []) {
    requireValue(option && ['PLAYER', 'CLUB', 'MUTUAL', 'UNKNOWN'].includes(option.holder), 'INVALID_OPTION')
    validateDate(option.until); reference(option.sourceReference)
    requireValue(option.conditions === null || text(option.conditions), 'INVALID_CONDITIONS')
  }
  const releaseClause = normalizeClause(input.releaseClause)
  const normalized = { ...input, observedAt, providerEffectiveAt, releaseClause }
  const { observedAt: observationTime, ...state } = normalized
  const contentHash = hash({ inputSchemaVersion, state })
  return { data: structuredClone(normalized), modelVersion, inputSchemaVersion, contentHash,
    inputHash: hash({ inputSchemaVersion, normalized }),
    observationHash: hash({ contentHash, observedAt: observationTime }),
    publicationAllowed: false as const, currentEligible: false as const }
}
export function simulateClause(input: Partial<Context> & { marketValue?: string | null; currency?: string | null }) {
  const validContext = input && ['playerId', 'clubId', 'season'].every(k => text(input[k as keyof Context])) &&
    ['REAL_WORLD', 'EA_CAREER'].includes(input.context ?? '')
  const validMoney = typeof input?.marketValue === 'string' && /^\d{1,18}(?:\.\d{1,2})?$/.test(input.marketValue) &&
    ['EUR', 'USD', 'GBP', 'SAR', 'BRL', 'JPY'].includes(input.currency ?? '')
  const valid = validContext && validMoney
  return { kind: 'HYPOTHETICAL_SIMULATION' as const, modelVersion, artifactHash: null,
    inputHash: valid ? hash({ inputSchemaVersion, input }) : null,
    prediction: null, statisticalUncertainty: 'NOT_EVALUATED', identityConfidence: null,
    applicabilityDomain: null, evaluationEvidence: null, currentEligible: false, publicationAllowed: false,
    abstentionReason: valid ? 'NO_APPROVED_MODEL' : 'INVALID_OR_MISSING_INPUT' }
}
