import type { Metadata } from "next"
import { getSiteUrl } from "../siteUrl"
import { localizedHref, type Locale } from "./config"
import { t } from "./index"

export function localizedMetadata(locale: Locale, path: string, title?: string, noindex = false): Metadata {
  const origin = getSiteUrl()
  return {
    ...(title ? { title } : {}),
    description: t(locale, "Explore jogadores, clubes e ligas para planejar seu Modo Carreira."),
    alternates: {
      canonical: origin + localizedHref(locale, path),
      languages: { "pt-BR": origin + localizedHref("pt", path), en: origin + localizedHref("en", path) },
    },
    ...(noindex ? { robots: { index: false, follow: path !== "/favoritos" } } : {}),
  }
}
