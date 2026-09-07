import { DirectoryNav } from "../components/DirectoryCatalog"
import FavoritesView from "../components/FavoritesView"
import { getSelectedPlayers } from "../../services/playerSelectionService"
import { FAVORITES_LIMIT, parsePlayersParam } from "../../lib/playerSelections"
import type { CatalogSearchParams } from "../../lib/playerCatalogParams"

export const metadata = { title: "Favoritos | FutScout", robots: { index: false, follow: false } }

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const slugs = parsePlayersParam((await searchParams).players, FAVORITES_LIMIT)
  const players = await getSelectedPlayers(slugs)
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <header className="playersPageHeader"><span>SEU CATÁLOGO</span><h1>Favoritos</h1>
      <p>Até {FAVORITES_LIMIT} jogadores salvos somente neste navegador. Sem conta e sem sincronização entre dispositivos.</p>
    </header>
    <FavoritesView requested={slugs} players={players} />
  </main>
}
