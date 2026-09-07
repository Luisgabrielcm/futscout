"use client"

import Link from "next/link"
import { useState } from "react"
import { usePlayerSelections } from "./usePlayerSelections"
import { FAVORITES_LIMIT, playersHref } from "../../lib/playerSelections"

export default function PlayerActions({ slug, name }: { slug: string; name: string }) {
  const favorites = usePlayerSelections("favorites")
  const comparison = usePlayerSelections("comparison")
  const [message, setMessage] = useState("")
  const favorite = favorites.slugs.includes(slug)
  const comparing = comparison.slugs.includes(slug)
  function toggle(kind: "favorites" | "comparison") {
    const result = (kind === "favorites" ? favorites : comparison).toggle(slug)
    if (result.status === "full") {
      setMessage(kind === "favorites" ? `Limite de ${FAVORITES_LIMIT} favoritos. Remova um para adicionar outro.`
        : "Seleção cheia. Remova um jogador na página Comparar.")
    } else if (result.status === "invalid") {
      setMessage("Este identificador de jogador não pode ser selecionado.")
    } else {
      setMessage(result.persisted ? (result.status === "added" ? "Jogador adicionado." : "Jogador removido.")
        : "Alteração mantida apenas nesta sessão: armazenamento local indisponível.")
    }
  }
  return <div className="playerActions">
    <div className="playerActionButtons">
      <button type="button" disabled={!favorites.ready} aria-pressed={favorite}
        aria-label={`${favorite ? "Remover" : "Adicionar"} ${name} ${favorite ? "dos" : "aos"} favoritos`}
        title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => toggle("favorites")}>
        {favorite ? "★ Favorito" : "☆ Favoritar"}
      </button>
      <button type="button" disabled={!comparison.ready} aria-pressed={comparing}
        aria-label={`${comparing ? "Remover" : "Selecionar"} ${name} para comparação`}
        title={comparing ? "Remover da comparação" : "Selecionar para comparar"} onClick={() => toggle("comparison")}>
        {comparing ? "✓ Selecionado" : "Comparar"}
      </button>
    </div>
    {comparison.slugs.length > 0 && <Link href={playersHref("/comparar", comparison.slugs)}>
      {comparison.slugs.length === 2 ? "Comparar agora →" : "Seleção: 1/2 →"}
    </Link>}
    <span className="playerActionFeedback" role="status">{message}</span>
  </div>
}
