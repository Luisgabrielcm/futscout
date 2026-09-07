"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePlayerSelections } from "./usePlayerSelections"
import { FAVORITES_LIMIT, playersHref } from "../../lib/playerSelections"
import type { SelectedPlayer } from "../../types/playerSelection"
import PlayerCard from "./PlayerCard"

export default function FavoritesView({ requested, players }: { requested: string[]; players: SelectedPlayer[] }) {
  const { slugs, ready, toggle } = usePlayerSelections("favorites")
  const router = useRouter()
  const target = playersHref("/favoritos", slugs)
  const inSync = slugs.join(",") === requested.join(",")
  useEffect(() => {
    if (ready && !inSync) router.replace(target, { scroll: false })
  }, [ready, inSync, target, router])
  if (!ready || !inSync) return <p className="playersEmpty" role="status">Carregando seus favoritos locais…</p>
  if (!slugs.length) return <div className="playersEmpty">
    <h2>Nenhum favorito ainda</h2><p>Use ☆ Favoritar nos cards para salvar jogadores neste navegador.</p>
    <Link href="/jogadores" className="backButton">Explorar jogadores</Link>
  </div>
  const missing = slugs.filter((slug) => !players.some((player) => player.slug === slug))
  return <>
    <p className="playersResultsSummary">{slugs.length}/{FAVORITES_LIMIT} favoritos locais · sem login</p>
    <div className="playersPageGrid">{players.map((player) => <PlayerCard key={player.id} {...player} />)}</div>
    {missing.length > 0 && <div className="playersEmpty">
      <h2>Jogadores indisponíveis</h2>
      <p>Alguns registros não estão mais disponíveis. Você pode removê-los da lista local.</p>
      {missing.map((slug) => <button className="paginationButton" key={slug} type="button"
        onClick={() => toggle(slug)} aria-label={`Remover ${slug} dos favoritos`}>Remover {slug}</button>)}
    </div>}
  </>
}
