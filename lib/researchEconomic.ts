import { createHash } from "node:crypto"
import { parseManualPayload, type ClausePayload, type SalaryPayload } from "./adminEconomic"
import type { PublishedWage } from "./wagePublication"

export type ResearchField = "SALARY" | "CONTRACT" | "CLAUSE"
export type ResearchAction = "RECORD" | "PUBLISH" | "ROLLBACK"
export type ResearchClassification = "OFFICIAL" | "REPORTED" | "ESTIMATED" | "UNKNOWN"
type PartialDate = { date: string; precision: "DAY" | "MONTH" | "YEAR" }
export type ResearchContract = { until: string; precision: "DAY" | "MONTH" | "YEAR";
  signed?: PartialDate | null; renewed?: PartialDate | null }
export type ResearchSalaryReference = { weeklyAmount: string; currency: "EUR" | "GBP" | "USD";
  taxType: "GROSS" | "NET" | "UNKNOWN"; composition: "BASE" | "GUARANTEED" | "TOTAL" | "UNKNOWN";
  weeklyEur?: string; season?: string; fx?: { unitsPerEur: string; asOf: string; sourceUrl: string } | null;
  originalAmount?: string; originalPeriod?: "WEEK" | "MONTH" | "YEAR" }
export type ResearchPayload = ResearchContract | ClausePayload | SalaryPayload | ResearchSalaryReference
export type ResearchCommand = {
  playerId: string; eaId: string; clubId: string; field: ResearchField; action: ResearchAction;
  requestId: string; sourceUrl: string; sourcePublishedOn: string | null; capturedOn: string;
  classification: ResearchClassification; payload: unknown; expectedHeadRevision?: number | null;
  rollbackToId?: string | null
}
const money = (value: unknown) => typeof value === "string" && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const validPartialDate = (value: string, precision: unknown) =>
  precision === "YEAR" && /^\d{4}$/.test(value) ||
  precision === "MONTH" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
  precision === "DAY" && validDay(value)
const validPublicUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 1000) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password
  } catch { return false }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
export const researchHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex")

export function parseResearchPayload(field: ResearchField, action: ResearchAction, raw: unknown): ResearchPayload | null {
  if (action === "ROLLBACK" && raw === null) return null
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("RESEARCH_PAYLOAD_INVALID")
  const p = raw as Record<string, unknown>
  if (field === "SALARY") {
    if ((action === "PUBLISH" || action === "ROLLBACK") && !Object.hasOwn(p, "weeklyAmount")) {
      const salary = parseManualPayload("SALARY", raw) as SalaryPayload
      if (salary.taxType !== "GROSS" || salary.composition !== "TOTAL") throw Error("RESEARCH_SALARY_NOT_GROSS_TOTAL")
      return salary
    }
    if (!money(p.weeklyAmount) || !["EUR", "GBP", "USD"].includes(String(p.currency)) ||
        !["GROSS", "NET", "UNKNOWN"].includes(String(p.taxType)) ||
        !["BASE", "GUARANTEED", "TOTAL", "UNKNOWN"].includes(String(p.composition)))
      throw Error("RESEARCH_SALARY_REFERENCE_INVALID")
    const normalized = p.weeklyEur !== undefined
    if (action !== "RECORD" && !normalized && (p.taxType !== "GROSS" || p.composition !== "BASE"))
      throw Error("RESEARCH_SALARY_REFERENCE_NOT_PUBLISHABLE")
    const reference: ResearchSalaryReference = { weeklyAmount: p.weeklyAmount as string,
      currency: p.currency as ResearchSalaryReference["currency"],
      taxType: p.taxType as ResearchSalaryReference["taxType"],
      composition: p.composition as ResearchSalaryReference["composition"] }
    if (normalized) {
      if (!money(p.weeklyEur) || typeof p.season !== "string" || !/^20\d{2}(?:-20\d{2})?$/.test(p.season))
        throw Error("RESEARCH_SALARY_NORMALIZATION_INVALID")
      const fx = p.fx as Record<string, unknown> | null | undefined
      if (p.currency === "EUR") {
        if (fx !== null && fx !== undefined || Number(p.weeklyEur) !== Number(p.weeklyAmount))
          throw Error("RESEARCH_SALARY_NORMALIZATION_INVALID")
      } else {
        if (!fx || typeof fx !== "object" || typeof fx.unitsPerEur !== "string" ||
            !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/.test(fx.unitsPerEur) || Number(fx.unitsPerEur) <= 0 ||
            !validDay(String(fx.asOf ?? "")) ||
            !validPublicUrl(fx.sourceUrl) ||
            Math.abs(Number(p.weeklyEur) - Number(p.weeklyAmount) / Number(fx.unitsPerEur)) > 0.0051)
          throw Error("RESEARCH_SALARY_NORMALIZATION_INVALID")
      }
      reference.weeklyEur = p.weeklyEur as string
      reference.season = p.season
      reference.fx = p.currency === "EUR" ? null : fx as ResearchSalaryReference["fx"]
    }
    if (p.originalAmount !== undefined || p.originalPeriod !== undefined) {
      if (!money(p.originalAmount) || !["WEEK", "MONTH", "YEAR"].includes(String(p.originalPeriod)))
        throw Error("RESEARCH_SALARY_PERIOD_INVALID")
      const factor = p.originalPeriod === "YEAR" ? 1 / 52 : p.originalPeriod === "MONTH" ? 12 / 52 : 1
      if (Math.abs(Number(p.weeklyAmount) - Number(p.originalAmount) * factor) > 0.0051)
        throw Error("RESEARCH_SALARY_PERIOD_INVALID")
      reference.originalAmount = p.originalAmount as string
      reference.originalPeriod = p.originalPeriod as ResearchSalaryReference["originalPeriod"]
    }
    return reference
  }
  if (field === "CONTRACT") {
    const until = String(p.until ?? ""), precision = p.precision
    if (!validPartialDate(until, precision)) throw Error("RESEARCH_CONTRACT_DATE_INVALID")
    const optional = (value: unknown): PartialDate | null => {
      if (value === undefined || value === null) return null
      if (typeof value !== "object" || Array.isArray(value)) throw Error("RESEARCH_CONTRACT_DATE_INVALID")
      const date = value as Record<string, unknown>
      if (!validPartialDate(String(date.date ?? ""), date.precision)) throw Error("RESEARCH_CONTRACT_DATE_INVALID")
      return { date: String(date.date), precision: date.precision as PartialDate["precision"] }
    }
    return { until, precision, signed: optional(p.signed), renewed: optional(p.renewed) } as ResearchContract
  }
  if (field === "CLAUSE") {
    const clause = parseManualPayload("CLAUSE", raw) as ClausePayload
    if (action !== "RECORD" && (clause.status !== "YES" || !clause.amount || !clause.currency))
      throw Error("RESEARCH_CLAUSE_UNCONFIRMED")
    return clause
  }
  throw Error("RESEARCH_FIELD_INVALID")
}

export function normalizeResearchSalary(input: Omit<ResearchSalaryReference, "weeklyAmount" | "weeklyEur" | "originalAmount" | "originalPeriod"> &
  { amount: string; period: "WEEK" | "MONTH" | "YEAR" }): ResearchSalaryReference {
  if (!money(input.amount) || !input.season) throw Error("RESEARCH_SALARY_PERIOD_INVALID")
  const factor = input.period === "YEAR" ? 1 / 52 : input.period === "MONTH" ? 12 / 52 : 1
  const weeklyAmount = (Number(input.amount) * factor).toFixed(2)
  const weeklyEur = input.currency === "EUR" ? weeklyAmount :
    input.fx?.unitsPerEur ? (Number(weeklyAmount) / Number(input.fx.unitsPerEur)).toFixed(2) : ""
  const payload = { weeklyAmount, weeklyEur, originalAmount: input.amount, originalPeriod: input.period,
    currency: input.currency, taxType: input.taxType, composition: input.composition,
    season: input.season, fx: input.currency === "EUR" ? null : input.fx }
  return parseResearchPayload("SALARY", "PUBLISH", payload) as ResearchSalaryReference
}

export function prepareResearchCommand(input: ResearchCommand) {
  const safeSource = validPublicUrl(input.sourceUrl)
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId) || !/^[0-9]+$/.test(input.eaId) ||
      !input.playerId || !input.clubId || !["SALARY", "CONTRACT", "CLAUSE"].includes(input.field) ||
      !["RECORD", "PUBLISH", "ROLLBACK"].includes(input.action) ||
      !["OFFICIAL", "REPORTED", "ESTIMATED", "UNKNOWN"].includes(input.classification) ||
      !safeSource || input.sourceUrl.length > 1000 ||
      !validDay(input.capturedOn) ||
      input.sourcePublishedOn !== null && !validDay(input.sourcePublishedOn) ||
      input.action !== "RECORD" && (!Number.isSafeInteger(input.expectedHeadRevision) || input.expectedHeadRevision! < 0) ||
      input.action === "ROLLBACK" && input.rollbackToId !== null && !input.rollbackToId)
    throw Error("RESEARCH_COMMAND_INVALID")
  const payload = input.action === "ROLLBACK" ? null : parseResearchPayload(input.field, input.action, input.payload)
  return { ...input, payload, requestHash: researchHash({ ...input, payload }) }
}

export function formatResearchContract(contract: ResearchContract, locale: "pt" | "en") {
  if (contract.precision === "YEAR") return contract.until
  if (contract.precision === "MONTH") {
    const [year, month] = contract.until.split("-")
    return locale === "pt" ? `${month}/${year}` : `${year}-${month}`
  }
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-GB", { timeZone: "UTC",
    day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${contract.until}T00:00:00Z`))
}

export function researchWage(playerId: string, research: { salary?: { value: SalaryPayload | ResearchSalaryReference; sourceUrl: string;
  sourcePublishedOn: string | null } } | undefined): PublishedWage | undefined {
  const salary = research?.salary
  if (!salary || !("weeklyEur" in salary.value) || !salary.value.weeklyEur ||
      !("weeklyAmount" in salary.value) && (salary.value.taxType !== "GROSS" || salary.value.composition !== "TOTAL")) return undefined
  const amount = Number(salary.value.weeklyEur)
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  return { playerId, weeklyEur: amount, kind: "RESEARCHED", source: "External",
    sourceUrl: salary.sourceUrl, sourceName: "Fonte pesquisada",
    period: "season" in salary.value ? salary.value.season ?? salary.sourcePublishedOn : salary.sourcePublishedOn,
    classification: { taxType: salary.value.taxType, composition: salary.value.composition, method: "RESEARCHED_REFERENCE" },
    confidence: "LOW", contractVerified: false }
}

export function researchFixedSalary(research: { salary?: { value: SalaryPayload | ResearchSalaryReference;
  sourceUrl: string; classification: ResearchClassification } } | undefined, locale: "pt" | "en") {
  const salary = research?.salary
  if (!salary || !("weeklyAmount" in salary.value) || salary.value.taxType !== "GROSS" ||
      salary.value.composition !== "BASE" || !["EUR", "GBP", "USD"].includes(salary.value.currency)) return undefined
  const amount = Number(salary.value.weeklyAmount)
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  const pt = locale === "pt"
  const symbol = { EUR: "€", GBP: "£", USD: "$" }[salary.value.currency]
  return { title: pt ? "Salário bruto fixo estimado" : "Estimated gross base salary",
    value: `${symbol} ${new Intl.NumberFormat(pt ? "pt-BR" : "en-GB", { maximumFractionDigits: 0 }).format(amount)}/${pt ? "semana" : "week"}`,
    detail: pt ? "Estimativa da fonte; bônus excluídos" : "Source estimate; bonuses excluded",
    sourceUrl: salary.sourceUrl }
}
