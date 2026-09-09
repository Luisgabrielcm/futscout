import { t } from "../../../lib/i18n"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { DirectoryNav } from "../../components/DirectoryCatalog"
import FavoritesView from "../../components/FavoritesView"
import { getSelectedPlayers } from "../../../services/playerSelectionService"
import { FAVORITES_LIMIT, parsePlayersParam } from "../../../lib/playerSelections"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"


export default async function FavoritesPage({ searchParams, params: routeParams }: { searchParams: Promise<CatalogSearchParams>; params?: Promise<{ locale: string }> }) {
  const locale = requireLocale((await routeParams)?.locale ?? "pt")
  const slugs = parsePlayersParam((await searchParams).players, FAVORITES_LIMIT)
  const players = await getSelectedPlayers(slugs)
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <header className="playersPageHeader"><span>{t(locale, "SEU CATÁLOGO")}</span><h1>{t(locale, "Favoritos")}</h1>
      <p>{t(locale, "Até")}{" "}{FAVORITES_LIMIT} {t(locale, "jogadores salvos somente neste navegador. Sem conta e sem sincronização entre dispositivos.")}</p>
    </header>
    <FavoritesView locale={locale} requested={slugs} players={players} />
  </main>
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/favoritos", t(locale, "Favoritos"), true)
}
