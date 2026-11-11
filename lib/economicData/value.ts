import { createHash } from "node:crypto"
import { canonicalEconomicDecimal } from './decimal'

export const economicFields = ["MARKET_VALUE", "WAGE_WEEKLY", "CONTRACT_UNTIL", "RELEASE_CLAUSE"] as const
export type EconomicField = typeof economicFields[number]
export type EstimateMetadata = {
  method: 'D1_FULL_CONTEXT' | 'B_PARTIAL_CONTEXT' | 'B_BOUNDED_DOMAIN_EXTRAPOLATION'
  modelVersion: string; recordHash: string; artifactHash: string; inputHash: string
  quality: string; qualityApproved: false; commercialRights: 'UNKNOWN'; launchDecision: 'CONDITIONAL_OWNER_DECISION'
  context: 'COMPLETE' | 'UNKNOWN'; uncertaintyHash: string; provenanceHash: string; retentionHash: string
}
export type EconomicStateInput = {
  playerId: string; field: EconomicField; provider: string; providerPlayerId: string
  context: "REAL_WORLD" | "EA_CAREER"; snapshotVersion: string
  presence: "VALUE" | "NULL" | "ABSENT"; amount: string | null; currency: string | null
  period: "WEEK" | "MONTH" | "YEAR" | null
  contractUntil: string | null; datePrecision: "DAY" | "MONTH" | "YEAR" | null
  providerEffectiveAt: string | null
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NOT_FOUND"
  matchState: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND"
  status: "VALID" | "MISSING" | "REJECTED"
  metadata: { source: string; sourceVersion?: string; evidenceRef?: string; estimate?: EstimateMetadata }
}
export function normalizeAmount(value: unknown): string {
  // Decimal text only; no floating point rounding, abbreviations or guessed locale.
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) throw new Error("ECONOMIC_AMOUNT_INVALID")
  if (typeof value !== "string" && typeof value !== "number") throw new Error("ECONOMIC_AMOUNT_INVALID")
  const text = String(value)
  if (!/^\d{1,18}(?:\.\d{1,2})?$/.test(text)) throw new Error("ECONOMIC_AMOUNT_INVALID")
  const [whole, fraction = ""] = text.split(".")
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`
}
// Preserve the frozen number exactly. No rounding to cents or new prediction.
// Requires the separate NUMERIC(38,18) storage preparation before SQL staging.
export function normalizeEstimateAmount(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw Error('ECONOMIC_ESTIMATE_AMOUNT_INVALID')
  const text = String(value)
  if (!/^\d{1,18}(?:\.\d{1,18})?$/.test(text)) throw Error('ECONOMIC_ESTIMATE_AMOUNT_INVALID')
  const canonical = canonicalEconomicDecimal(text)
  const scaled = BigInt(canonical.replace('.', ''))
  if (scaled <= BigInt(0) || scaled > BigInt('9007199254740991') * BigInt(10) ** BigInt(18)) throw Error('ECONOMIC_ESTIMATE_AMOUNT_INVALID')
  return canonical
}
export function validInstant(value: string): boolean {
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value))
}
export function economicFingerprint(input: EconomicStateInput): string {
  if (!input.playerId || !economicFields.includes(input.field) || !/^[A-Z][A-Z0-9_]{1,63}$/.test(input.provider) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(input.providerPlayerId) || !["REAL_WORLD", "EA_CAREER"].includes(input.context) ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(input.snapshotVersion)) throw new Error("ECONOMIC_IDENTITY_INVALID")
  if (!["HIGH", "MEDIUM", "LOW", "NOT_FOUND"].includes(input.confidence) || !["MATCHED", "AMBIGUOUS", "NOT_FOUND"].includes(input.matchState) ||
      !["VALUE", "NULL", "ABSENT"].includes(input.presence) || !["VALID", "MISSING", "REJECTED"].includes(input.status)) throw new Error("ECONOMIC_STATE_INVALID")
  if (input.providerEffectiveAt !== null && !validInstant(input.providerEffectiveAt)) throw new Error("ECONOMIC_EFFECTIVE_AT_INVALID")
  const own = input.provider === 'FUTSCOUT_VALUE'
  const allowed = ["source", "sourceVersion", "evidenceRef", ...(own ? ['estimate'] : [])]
  if (!input.metadata || !input.metadata.source || Object.keys(input.metadata).some(key => !allowed.includes(key)) ||
      Object.entries(input.metadata).filter(([key]) => key !== 'estimate').some(([, value]) => typeof value !== "string" || !/^[a-zA-Z0-9._/-]{1,160}$/.test(value) || /(?:secret|password|token|api.?key)/i.test(value))) throw new Error("ECONOMIC_METADATA_INVALID")
  if (own) {
    if (input.field !== 'MARKET_VALUE' || input.context !== 'REAL_WORLD' || input.presence !== 'VALUE' ||
        input.currency !== 'EUR' || input.providerEffectiveAt !== null) throw Error('ECONOMIC_ESTIMATE_SCOPE_INVALID')
    const e = input.metadata.estimate
    const keys = ['method', 'modelVersion', 'recordHash', 'artifactHash', 'inputHash', 'quality', 'qualityApproved',
      'commercialRights', 'launchDecision', 'context', 'uncertaintyHash', 'provenanceHash', 'retentionHash']
    if (!e || Object.keys(e).length !== keys.length || Object.keys(e).some(k => !keys.includes(k)) ||
        !['D1_FULL_CONTEXT', 'B_PARTIAL_CONTEXT', 'B_BOUNDED_DOMAIN_EXTRAPOLATION'].includes(e.method) ||
        !/^[a-zA-Z0-9._-]{1,64}$/.test(e.modelVersion) || !/^[A-Z0-9_]{1,128}$/.test(e.quality) ||
        e.qualityApproved !== false || e.commercialRights !== 'UNKNOWN' || e.launchDecision !== 'CONDITIONAL_OWNER_DECISION' ||
        !['COMPLETE', 'UNKNOWN'].includes(e.context) ||
        [e.recordHash, e.artifactHash, e.inputHash, e.uncertaintyHash, e.provenanceHash, e.retentionHash].some(h => !/^[a-f0-9]{64}$/.test(h)))
      throw Error('ECONOMIC_ESTIMATE_METADATA_INVALID')
  }
  if (input.currency !== null && !/^[A-Z]{3}$/.test(input.currency)) throw new Error("ECONOMIC_CURRENCY_INVALID")
  const monetary = input.field !== "CONTRACT_UNTIL"
  if (input.presence !== "VALUE") {
    if (input.amount !== null || input.contractUntil !== null || input.datePrecision !== null || input.period !== null || input.status === "VALID") throw new Error("ECONOMIC_MISSING_INVALID")
  } else {
    if (input.status !== "VALID") throw new Error("ECONOMIC_STATUS_INVALID")
    if (monetary) {
      if (input.amount === null || (own ? normalizeEstimateAmount(input.amount) : normalizeAmount(input.amount)) !== input.amount || !input.currency || input.contractUntil !== null || input.datePrecision !== null) throw new Error("ECONOMIC_MONEY_INVALID")
    } else {
      const date = input.contractUntil
      if (input.amount !== null || input.currency !== null || !date || !/^\d{4}-\d\d-\d\d$/.test(date) ||
          !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !["DAY", "MONTH", "YEAR"].includes(input.datePrecision ?? "") ||
          (input.datePrecision === "MONTH" && !date.endsWith("-01")) || (input.datePrecision === "YEAR" && !date.endsWith("-01-01"))) throw new Error("ECONOMIC_CONTRACT_INVALID")
    }
    if ((input.field === "WAGE_WEEKLY" ? input.period !== "WEEK" : input.period !== null)) throw new Error("ECONOMIC_PERIOD_INVALID")
  }
  // Explicit canonical field order; observation time is deliberately excluded.
  const keys = ["playerId", "field", "provider", "providerPlayerId", "context", "snapshotVersion", "presence", "amount", "currency", "period", "contractUntil", "datePrecision", "providerEffectiveAt", "confidence", "matchState", "status"] as const
  const canonical = [...keys.map(key => [key, key === "providerEffectiveAt" && input[key] ? new Date(input[key]).toISOString() : input[key]]),
    ["metadata", Object.entries(input.metadata).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
      [key, key === 'estimate' && value ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value])]]
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}
