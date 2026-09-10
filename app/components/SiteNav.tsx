"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { t, localizedHref, localeTags, type LocaleProps } from "../../lib/i18n"
import { switchLanguageHref, type Locale } from "../../lib/i18n/config"
import { persistLocalePreference } from "../../lib/i18n/browser"
import { clubText } from "../../lib/i18n/clubExperience"

const links = [
  ["/", "Início"], ["/jogadores", "Jogadores"], ["/clubes", "Clubes"],
  ["/ligas", "Ligas"], ["/comparar", "Comparar"], ["/favoritos", "Favoritos"],
] as const

export default function SiteNav({ locale = "pt" }: LocaleProps = {}) {
  const pathname = usePathname()
  const query = useSearchParams().toString()
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const open = openedPath === pathname
  function chooseLanguage(next: Locale, event: React.MouseEvent<HTMLAnchorElement>) {
    persistLocalePreference(next)
    // Preserve the exact current query and fragment, including unsaved URL selections.
    event.currentTarget.href = switchLanguageHref(next, window.location.pathname, window.location.search, window.location.hash)
  }
  return <header className="siteNav" onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      setOpenedPath(null)
      menuButton.current?.focus()
    }
  }}>
    <div className="siteNavTop">
      <Link className="siteBrand" href={localizedHref(locale, "/")} onClick={() => setOpenedPath(null)} aria-label={t(locale, "FutScout — início")}>
        <span className="logoF" aria-hidden="true">F</span><span>FUT<span className="green">SCOUT</span></span>
      </Link>
      <nav className="languageSwitch" aria-label={t(locale, "selectLanguage")}>
        {(["pt", "en"] as const).map((next) =>
          <a key={next} href={switchLanguageHref(next, pathname, query)} hrefLang={localeTags[next]}
            lang={localeTags[next]} aria-current={locale === next ? "true" : undefined}
            onClick={(event) => chooseLanguage(next, event)}>{next.toUpperCase()}</a>
        )}
      </nav>
      <button ref={menuButton} className="mobileMenuButton" type="button" aria-controls="site-navigation"
        aria-expanded={open} onClick={() => setOpenedPath(open ? null : pathname)}>
        {t(locale, open ? "Fechar menu" : "Abrir menu")}
      </button>
    </div>
    <nav id="site-navigation" className={`siteNavLinks ${open ? "isOpen" : ""}`} aria-label={t(locale, "Navegação principal")}>
      {links.map(([path, label]) => {
        const href = localizedHref(locale, path)
        const active = path === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}
          onClick={() => setOpenedPath(null)}>{t(locale, label)}</Link>
      })}
      <span className="siteNavUnavailable">{t(locale, "Scout IA")} <small>{t(locale, "Em breve")}</small></span>
      <Link href={localizedHref(locale, "/selecoes")} aria-current={pathname.startsWith(localizedHref(locale, "/selecoes")) ? "page" : undefined} onClick={() => setOpenedPath(null)}>{clubText(locale, "countries")}</Link>
      <span className="siteNavUnavailable">{t(locale, "Elencos")} <small>{t(locale, "Em breve")}</small></span>
    </nav>
  </header>
}
