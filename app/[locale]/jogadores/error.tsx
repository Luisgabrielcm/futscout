"use client"

import { usePathname } from "next/navigation"
import { t, localizedHref } from "../../../lib/i18n"
import { localeFromPath } from "../../../lib/i18n/config"
import Link from "next/link"

export default function CatalogError({ retry }: { retry: () => void }) {
  const locale = localeFromPath(usePathname())
  return (
    <main className="playersPage">
      <div className="playersEmpty" role="alert">
        <h1>{t(locale, "Não foi possível carregar o catálogo")}</h1>
        <p>{t(locale, "Tente novamente em instantes. Seus dados não foram alterados.")}</p>
        <button type="button" className="backButton" onClick={() => retry()}>
          {t(locale, "Tentar novamente")}</button>
        <Link href={localizedHref(locale, "/")} className="backButton">{t(locale, "← Início")}</Link>
      </div>
    </main>
  )
}
