import { getCountryAliases } from "./countryFlags"
import { countryNames } from "./i18n/countryNames"
import { displayNationality } from "./i18n/countries"

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
const codes = [...Object.keys(countryNames), "GB-ENG", "GB-SCT", "GB-WLS"]

// Exact localized country names expand a read-only search, never a stored
// identity or route key. Partial/unknown text retains the ordinary text search.
export function nationalitySearchAliases(search: string): string[] {
  const term = normalize(search)
  if (!term) return []
  const aliases = new Set(getCountryAliases(search))
  for (const code of codes) {
    if ([displayNationality(code, "pt"), displayNationality(code, "en")].some(name => normalize(name) === term)) {
      for (const alias of getCountryAliases(code)) aliases.add(alias)
    }
  }
  return [...aliases]
}
