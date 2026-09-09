"use client"

import { t, localizedHref, type Locale } from "../../lib/i18n"


import Link from "next/link"
import { useState } from "react"
import { usePlayerSelections } from "./usePlayerSelections"
import { FAVORITES_LIMIT, playersHref } from "../../lib/playerSelections"

export default function PlayerActions({ locale = "pt", slug, name }: { locale?: Locale; slug: string; name: string }) {
  const favorites = usePlayerSelections("favorites")
  const comparison = usePlayerSelections("comparison")
  const [message, setMessage] = useState("")
  const favorite = favorites.slugs.includes(slug)
  const comparing = comparison.slugs.includes(slug)
  function toggle(kind: "favorites" | "comparison") {
    const result = (kind === "favorites" ? favorites : comparison).toggle(slug)
    if (result.status === "full") {
      setMessage(kind === "favorites" ? t(locale, "favoriteLimit", { count: FAVORITES_LIMIT })
        : t(locale, "Seleção cheia. Remova um jogador na página Comparar."))
    } else if (result.status === "invalid") {
      setMessage(t(locale, "Este identificador de jogador não pode ser selecionado."))
    } else {
      setMessage(result.persisted ? (result.status === "added" ? t(locale, "Jogador adicionado.") : t(locale, "Jogador removido."))
        : t(locale, "Alteração mantida apenas nesta sessão: armazenamento local indisponível."))
    }
  }
  return <div className="playerActions">
    <div className="playerActionButtons">
      <button type="button" disabled={!favorites.ready} aria-pressed={favorite}
        aria-label={t(locale, favorite ? "favoriteRemove" : "favoriteAdd", { name })}
        title={favorite ? t(locale, "Remover dos favoritos") : t(locale, "Adicionar aos favoritos")} onClick={() => toggle("favorites")}>
        {favorite ? t(locale, "★ Favorito") : t(locale, "☆ Favoritar")}
      </button>
      <button type="button" disabled={!comparison.ready} aria-pressed={comparing}
        aria-label={t(locale, comparing ? "compareRemove" : "compareAdd", { name })}
        title={comparing ? t(locale, "Remover da comparação") : t(locale, "Selecionar para comparar")} onClick={() => toggle("comparison")}>
        {comparing ? t(locale, "✓ Selecionado") : t(locale, "Comparar")}
      </button>
    </div>
    {comparison.slugs.length > 0 && <Link href={localizedHref(locale, playersHref("/comparar", comparison.slugs))}>
      {comparison.slugs.length === 2 ? t(locale, "Comparar agora →") : t(locale, "Seleção: 1/2 →")}
    </Link>}
    <span className="playerActionFeedback" role="status">{message}</span>
  </div>
}
