import Link from "next/link"
import { DirectoryNav } from "../components/DirectoryCatalog"
import PlayerCard from "../components/PlayerCard"
import PlayerComparison from "../components/PlayerComparison"
import ComparisonSelection from "../components/ComparisonSelection"
import { getSelectedPlayers } from "../../services/playerSelectionService"
import { parsePlayersParam } from "../../lib/playerSelections"
import type { CatalogSearchParams } from "../../lib/playerCatalogParams"

export const metadata = { title: "Comparar jogadores | FutScout", robots: { index: false, follow: true } }

export default async function ComparePage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const slugs = parsePlayersParam((await searchParams).players)
  const players = await getSelectedPlayers(slugs, 2)
  const missing = slugs.filter((slug) => !players.some((player) => player.slug === slug))
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <header className="playersPageHeader"><span>CAREER MODE</span><h1>Comparar jogadores</h1>
      <p>Compare exatamente dois jogadores. A URL usa os dois primeiros slugs válidos e distintos, na ordem informada.</p>
    </header>
    <ComparisonSelection />
    {missing.length > 0 && <p className="playersEmpty" role="status">Jogador não encontrado: {missing.join(", ")}.</p>}
    {players.length === 2 ? <PlayerComparison players={[players[0], players[1]]} /> : <>
      <div className="playersEmpty"><h2>{players.length ? "Falta um jogador" : "Escolha dois jogadores"}</h2>
        <p>Use Comparar nos cards. Para substituir uma seleção cheia, remova um jogador da seleção local.</p>
        <Link href="/jogadores" className="backButton">Escolher jogadores</Link>
      </div>
      {players.length === 1 && <div className="comparisonSingle"><PlayerCard {...players[0]} /></div>}
    </>}
  </main>
}
