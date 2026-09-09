import { t, localizedHref } from "../../../lib/i18n"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import Link from "next/link"
import { DirectoryNav } from "../../components/DirectoryCatalog"
import PlayerCard from "../../components/PlayerCard"
import PlayerComparison from "../../components/PlayerComparison"
import ComparisonSelection from "../../components/ComparisonSelection"
import { getSelectedPlayers } from "../../../services/playerSelectionService"
import { parsePlayersParam } from "../../../lib/playerSelections"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"


export default async function ComparePage({ searchParams, params: routeParams }: { searchParams: Promise<CatalogSearchParams>; params?: Promise<{ locale: string }> }) {
  const locale = requireLocale((await routeParams)?.locale ?? "pt")
  const slugs = parsePlayersParam((await searchParams).players)
  const players = await getSelectedPlayers(slugs, 2)
  const missing = slugs.filter((slug) => !players.some((player) => player.slug === slug))
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <header className="playersPageHeader"><span>CAREER MODE</span><h1>{t(locale, "Comparar jogadores")}</h1>
      <p>{t(locale, "Compare exatamente dois jogadores. A URL usa os dois primeiros slugs válidos e distintos, na ordem informada.")}</p>
    </header>
    <ComparisonSelection locale={locale} />
    {missing.length > 0 && <p className="playersEmpty" role="status">{t(locale, "Jogador não encontrado:")}{" "}{missing.join(", ")}.</p>}
    {players.length === 2 ? <PlayerComparison locale={locale} players={[players[0], players[1]]} /> : <>
      <div className="playersEmpty"><h2>{players.length ? t(locale, "Falta um jogador") : t(locale, "Escolha dois jogadores")}</h2>
        <p>{t(locale, "Use Comparar nos cards. Para substituir uma seleção cheia, remova um jogador da seleção local.")}</p>
        <Link href={localizedHref(locale, "/jogadores")} className="backButton">{t(locale, "Escolher jogadores")}</Link>
      </div>
      {players.length === 1 && <div className="comparisonSingle"><PlayerCard locale={locale} {...players[0]} /></div>}
    </>}
  </main>
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/comparar", t(locale, "Comparar jogadores"), true)
}
