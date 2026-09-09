import { localeTags, type Locale } from "../lib/i18n/config"
export function formatDate(value: Date | string | null, locale: Locale = "pt"): string {
  if (value === null) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat(localeTags[locale], { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(date)
}
