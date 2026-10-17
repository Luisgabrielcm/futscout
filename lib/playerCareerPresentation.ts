import type { VerifiedSalary } from "../types/playerCareer"
import { localeTags, type Locale } from "./i18n"
import { visualText } from "./i18n/visualRevision"

export function displaySalary(salary: VerifiedSalary | null | undefined, locale: Locale): string | null {
  if (salary?.publicationAllowed !== true || salary.nature !== "OBSERVED" ||
      typeof salary.source !== "string" || !salary.source.trim() ||
      !Number.isFinite(salary.amount) || salary.amount < 0 || salary.amount > Number.MAX_SAFE_INTEGER ||
      !Intl.supportedValuesOf("currency").includes(salary.currency) || !["week", "year"].includes(salary.period)) return null
  return `${new Intl.NumberFormat(localeTags[locale], { style: "currency", currency: salary.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(salary.amount)} / ${visualText(locale, salary.period)}`
}

export function displayCareerDate(value: string | null | undefined, locale: Locale): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—"
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "—"
  return new Intl.DateTimeFormat(localeTags[locale], { timeZone: "UTC", dateStyle: "medium" }).format(date)
}
