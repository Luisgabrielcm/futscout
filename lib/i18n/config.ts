export const locales = ["pt", "en"] as const
export type Locale = typeof locales[number]
export const defaultLocale: Locale = "pt"
export const localeTags = { pt: "pt-BR", en: "en" } as const
export const LOCALE_COOKIE = "futscout-locale"
export type LocaleProps = { locale?: Locale }

export function isLocale(value: unknown): value is Locale {
  return value === "pt" || value === "en"
}
export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale
}
export function localeFromPath(pathname: string): Locale {
  return parseLocale(pathname.split("/")[1])
}

// Preference is explicit; browser negotiation is used only for unprefixed URLs.
export function preferredLocale(cookie: unknown, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie
  const languages = (acceptLanguage ?? "").split(",").map((entry, index) => {
    const [language, ...parameters] = entry.trim().toLowerCase().split(";")
    const quality = parameters.find((part) => part.trim().startsWith("q="))
    const weight = quality ? Number(quality.trim().slice(2)) : 1
    return { language, weight, index }
  }).filter(({ language, weight }) => /^[a-z]+(?:-[a-z0-9]+)*$/.test(language) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  if (!languages.length) return defaultLocale
  return /^pt(?:-|$)/.test(languages[0].language) ? "pt" : "en"
}

export function localizedHref(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href
  const match = href.match(/^([^?#]*)(.*)$/)!
  const path = match[1].replace(/^\/(pt|en)(?=\/|$)/, "")
  return `/${locale}${path === "/" ? "" : path}${match[2]}`
}
export function switchLanguageHref(locale: Locale, pathname: string, query = "", hash = "") {
  return localizedHref(locale, pathname) + (query ? `?${query.replace(/^\?/, "")}` : "") + hash
}
export function localePreferenceCookie(locale: Locale, secure = false) {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`
}
