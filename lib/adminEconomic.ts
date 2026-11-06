export type ManualSection = "SALARY" | "CONTRACT" | "CLAUSE"
export type SalaryPayload = { weeklyEur: string; taxType: "GROSS" | "NET" | "UNKNOWN"; composition: "BASE" | "GUARANTEED" | "TOTAL" | "UNKNOWN" }
export type ContractPayload = { start: string | null; until: string | null; renewed: string | null }
export type ClausePayload = { status: "YES" | "NO" | "UNKNOWN"; amount: string | null; currency: string | null; conditions: string | null; validUntil: string | null }
export type ManualPayload = SalaryPayload | ContractPayload | ClausePayload

const date = (value: unknown) => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
const text = (value: unknown) => value === null || (typeof value === "string" && value.length <= 1000)
const amount = (value: unknown) => typeof value === "string" && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Math.round(Number(value) * 100))

export function parseManualPayload(section: ManualSection, value: unknown): ManualPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("INVALID_PAYLOAD")
  const p = value as Record<string, unknown>
  if (section === "SALARY") {
    if (!amount(p.weeklyEur) || !["GROSS", "NET", "UNKNOWN"].includes(String(p.taxType)) ||
        !["BASE", "GUARANTEED", "TOTAL", "UNKNOWN"].includes(String(p.composition))) throw Error("INVALID_SALARY")
    return { weeklyEur: p.weeklyEur as string, taxType: p.taxType as SalaryPayload["taxType"], composition: p.composition as SalaryPayload["composition"] }
  }
  if (section === "CONTRACT") {
    if (![p.start, p.until, p.renewed].every(date) || (p.start && p.until && p.start > p.until) ||
        (p.renewed && p.until && p.renewed > p.until)) throw Error("INVALID_CONTRACT")
    return { start: p.start as string | null, until: p.until as string | null, renewed: p.renewed as string | null }
  }
  if (section === "CLAUSE") {
    if (!["YES", "NO", "UNKNOWN"].includes(String(p.status)) || !date(p.validUntil) || !text(p.conditions) ||
        (p.status === "YES" && !((p.amount === null && p.currency === null) ||
          (amount(p.amount) && ["EUR", "GBP", "USD"].includes(String(p.currency))))) ||
        (p.status !== "YES" && (p.amount !== null || p.currency !== null || p.conditions !== null || p.validUntil !== null))) throw Error("INVALID_CLAUSE")
    return { status: p.status as ClausePayload["status"], amount: p.amount as string | null, currency: p.currency as string | null,
      conditions: p.conditions as string | null, validUntil: p.validUntil as string | null }
  }
  throw Error("INVALID_SECTION")
}
