"use client"

import Link from "next/link"
import { usePlayerSelections } from "./usePlayerSelections"
import { playersHref } from "../../lib/playerSelections"

export default function ComparisonSelection() {
  const { slugs, ready, toggle } = usePlayerSelections("comparison")
  if (!ready || !slugs.length) return null
  return <aside className="comparisonSelection" aria-label="Seleção local de comparação">
    <strong>Seleção local ({slugs.length}/2)</strong>
    {slugs.map((slug, index) => <button type="button" key={slug} onClick={() => toggle(slug)}
      aria-label={`Remover ${slug} da seleção`} title={slug}>Remover jogador {index + 1}</button>)}
    <Link href={playersHref("/comparar", slugs)}>{slugs.length === 2 ? "Comparar agora" : "Ver seleção"}</Link>
    <Link href="/jogadores">Escolher jogadores</Link>
  </aside>
}
