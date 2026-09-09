"use client"

import { t, localizedHref, type LocaleProps } from "../../lib/i18n"


import Link from "next/link"
import { usePlayerSelections } from "./usePlayerSelections"
import { playersHref } from "../../lib/playerSelections"

export default function ComparisonSelection({ locale = "pt" }: LocaleProps = {}) {
  const { slugs, ready, toggle } = usePlayerSelections("comparison")
  if (!ready || !slugs.length) return null
  return <aside className="comparisonSelection" aria-label={t(locale, "Seleção local de comparação")}>
    <strong>{t(locale, "Seleção local (")}{slugs.length}/2)</strong>
    {slugs.map((slug, index) => <button type="button" key={slug} onClick={() => toggle(slug)}
      aria-label={t(locale, "removeSelection", { name: slug })} title={slug}>{t(locale, "Remover jogador")}{" "}{index + 1}</button>)}
    <Link href={localizedHref(locale, playersHref("/comparar", slugs))}>{slugs.length === 2 ? t(locale, "Comparar agora") : t(locale, "Ver seleção")}</Link>
    <Link href={localizedHref(locale, "/jogadores")}>{t(locale, "Escolher jogadores")}</Link>
  </aside>
}
