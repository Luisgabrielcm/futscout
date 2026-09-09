"use client"

import { t, localizedHref, type Locale } from "../../lib/i18n"


import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePlayerSelections } from "./usePlayerSelections"
import { FAVORITES_LIMIT, playersHref } from "../../lib/playerSelections"
import type { SelectedPlayer } from "../../types/playerSelection"
import PlayerCard from "./PlayerCard"

export default function FavoritesView({ locale = "pt", requested, players }: { locale?: Locale; requested: string[]; players: SelectedPlayer[] }) {
  const { slugs, ready, toggle } = usePlayerSelections("favorites")
  const router = useRouter()
  const target = localizedHref(locale, playersHref("/favoritos", slugs))
  const inSync = slugs.join(",") === requested.join(",")
  useEffect(() => {
    if (ready && !inSync) router.replace(target, { scroll: false })
  }, [ready, inSync, target, router])
  if (!ready || !inSync) return <p className="playersEmpty" role="status">{t(locale, "Carregando seus favoritos locais…")}</p>
  if (!slugs.length) return <div className="playersEmpty">
    <h2>{t(locale, "Nenhum favorito ainda")}</h2><p>{t(locale, "Use ☆ Favoritar nos cards para salvar jogadores neste navegador.")}</p>
    <Link href={localizedHref(locale, "/jogadores")} className="backButton">{t(locale, "Explorar jogadores")}</Link>
  </div>
  const missing = slugs.filter((slug) => !players.some((player) => player.slug === slug))
  return <>
    <p className="playersResultsSummary">{slugs.length}/{FAVORITES_LIMIT} {t(locale, "favoritos locais · sem login")}</p>
    <div className="playersPageGrid">{players.map((player) => <PlayerCard locale={locale} key={player.id} {...player} />)}</div>
    {missing.length > 0 && <div className="playersEmpty">
      <h2>{t(locale, "Jogadores indisponíveis")}</h2>
      <p>{t(locale, "Alguns registros não estão mais disponíveis. Você pode removê-los da lista local.")}</p>
      {missing.map((slug) => <button className="paginationButton" key={slug} type="button"
        onClick={() => toggle(slug)} aria-label={t(locale, "favoriteRemove", { name: slug })}>{t(locale, "Remover")}{" "}{slug}</button>)}
    </div>}
  </>
}
