import { getLeagueCatalog } from "../../services/leagueService"
import { directoryHref, parseDirectoryParams } from "../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../lib/playerCatalogParams"
import { DirectoryNav, DirectoryPagination, DirectorySearch, LeagueCard } from "../components/DirectoryCatalog"

export const metadata = { title: "Ligas | FutScout" }

export default async function LeaguesPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const { search, page } = parseDirectoryParams(await searchParams)
  const result = await getLeagueCatalog({ search, page })
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <header className="playersPageHeader">
      <span>DATABASE</span><h1>Ligas</h1>
      <p>Conheça as ligas e explore seus clubes e jogadores.</p>
    </header>
    <DirectorySearch key={directoryHref("/ligas", { search })} action="/ligas" search={search} />
    <p className="playersResultsSummary">{result.total} ligas encontradas</p>
    {result.leagues.length
      ? <div className="directoryGrid">{result.leagues.map((league) => <LeagueCard key={league.id} league={league} />)}</div>
      : <p className="playersEmpty">Nenhuma liga encontrada para esta busca.</p>}
    <DirectoryPagination {...result} label="Paginação de ligas"
      href={(page) => directoryHref("/ligas", { search, page })} />
  </main>
}
