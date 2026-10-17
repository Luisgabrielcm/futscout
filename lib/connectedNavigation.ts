import { localizedHref, type Locale } from "./i18n"
import { playerCatalogQuery, type GetPlayersParams } from "./playerCatalogParams"
import { getCountryFlag } from "./countryFlags"
export { displayNationality as countryName } from "./i18n/countries"

export function entityHref(locale: Locale, entity: "clubes" | "ligas" | "jogadores" | "selecoes", slug?: string | null) {
  return slug?.trim() ? localizedHref(locale, `/${entity}/${encodeURIComponent(slug)}`) : null
}

export function relatedPlayersHref(locale: Locale, filters: GetPlayersParams) {
  const query = playerCatalogQuery(filters)
  return localizedHref(locale, `/jogadores${query ? `?${query}` : ""}`)
}

// Carry only canonical public catalog parameters, never a return URL or origin.
export function playerCatalogContext(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first !== "string" || first.length > 4000) return ""
  const query = new URLSearchParams(first)
  const filters = Object.fromEntries([...query.keys()].map(key => [key, query.getAll(key)]))
  return playerCatalogQuery(filters)
}

export function playerCatalogReturnHref(locale: Locale, context?: unknown) {
  const query = playerCatalogContext(context)
  return localizedHref(locale, `/jogadores${query ? `?${query}` : ""}`)
}

export function playerProfileHref(locale: Locale, slug: string, context?: unknown, view: "ea" | "real" = "ea") {
  const query = playerCatalogContext(context)
  const suffix = query ? `?${new URLSearchParams({ catalog: query })}` : ""
  return localizedHref(locale, `/jogadores/${encodeURIComponent(slug)}${view === "real" ? "/vida-real" : ""}${suffix}`)
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
