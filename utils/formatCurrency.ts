import { localeTags, type Locale } from "../lib/i18n/config"

export function formatCurrency(value: number, locale: Locale = "pt") {
  const number = new Intl.NumberFormat(localeTags[locale], { maximumFractionDigits: 0 })
  if (value >= 1000000) {
    return `€${number.format(value / 1000000)}M`
  }

  return `€${number.format(value)}`
}
