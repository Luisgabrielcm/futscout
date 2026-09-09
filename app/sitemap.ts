import type { MetadataRoute } from "next"
import { getSiteUrl } from "../lib/siteUrl"
import { locales, localizedHref } from "../lib/i18n/config"

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl()
  // Comparison/favorites are noindex; entity URLs are deliberately out of scope.
  return locales.flatMap((locale) => ["/", "/jogadores", "/clubes", "/ligas"].map((path) => ({
    url: origin + localizedHref(locale, path),
    alternates: { languages: {
      "pt-BR": origin + localizedHref("pt", path),
      en: origin + localizedHref("en", path),
    } },
  })))
}
