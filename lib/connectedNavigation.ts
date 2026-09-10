import { localizedHref, type Locale } from "./i18n"
import { playerCatalogQuery, type GetPlayersParams } from "./playerCatalogParams"
import { getCountryFlag } from "./countryFlags"

export function entityHref(locale: Locale, entity: "clubes" | "ligas" | "jogadores" | "selecoes", slug?: string | null) {
  return slug?.trim() ? localizedHref(locale, `/${entity}/${encodeURIComponent(slug)}`) : null
}

export function relatedPlayersHref(locale: Locale, filters: GetPlayersParams) {
  const query = playerCatalogQuery(filters)
  return localizedHref(locale, `/jogadores${query ? `?${query}` : ""}`)
}

// Identity for a derived directory, NOT an official national-team ID.
// Known country aliases share the existing flag registry; unknown names stay distinct.
export function nationalityKey(name: string | null) {
  if (!name?.trim() || ["não informada", "não informado", "unknown", "n/a"].includes(name.trim().toLowerCase())) return ""
  return getCountryFlag(name)?.code.toLowerCase() ?? name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function nationalityHref(locale: Locale, name: string | null) {
  return entityHref(locale, "selecoes", nationalityKey(name))
}

export function countryName(name: string, locale: Locale) {
  const code = getCountryFlag(name)?.code
  const special: Record<string, [string, string]> = {
    "GB-ENG": ["Inglaterra", "England"], "GB-SCT": ["Escócia", "Scotland"], "GB-WLS": ["País de Gales", "Wales"],
  }
  if (code && special[code]) return special[code][locale === "pt" ? 0 : 1]
  return code && /^[A-Z]{2}$/.test(code)
    ? new Intl.DisplayNames([locale === "pt" ? "pt-BR" : "en"], { type: "region" }).of(code) ?? name : name
}
