import { getCountryFlag } from "../countryFlags"
import { t, type Locale } from "./index"
import { countryNames } from "./countryNames"

// Presentation only: never use this output as a persisted value or route key.
const special: Record<string, readonly [string, string]> = {
  "GB-ENG": ["Inglaterra", "England"], "GB-SCT": ["Escócia", "Scotland"],
  "GB-WLS": ["País de Gales", "Wales"],
  "northern ireland": ["Irlanda do Norte", "Northern Ireland"],
  "chinese taipei": ["Taipei Chinesa", "Chinese Taipei"],
}
export function displayNationality(value: string | null | undefined, locale: Locale): string {
  const name = value?.trim()
  if (!name) return t(locale, "Não informada")
  const code = getCountryFlag(name)?.code
  const exact = special[code ?? name.toLowerCase()]
  if (exact) return exact[locale === "pt" ? 0 : 1]
  return code ? countryNames[code]?.[locale === "pt" ? 0 : 1] ?? name : name
}
