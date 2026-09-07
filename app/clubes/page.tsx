import { getClubs } from "../../services/clubService"
import { getLeagues } from "../../services/playerService"
import { directoryHref, parseDirectoryParams } from "../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../lib/playerCatalogParams"
import { ClubCard, DirectoryNav, DirectoryPagination, DirectorySearch } from "../components/DirectoryCatalog"

export const metadata = { title: "Clubes | FutScout" }

export default async function ClubsPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const params = parseDirectoryParams(await searchParams)
  const [result, leagues] = await Promise.all([getClubs(params), getLeagues()])
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <header className="playersPageHeader">
      <span>DATABASE</span><h1>Clubes</h1>
      <p>Explore clubes, ligas e os jogadores cadastrados no FutScout.</p>
    </header>
    <DirectorySearch key={directoryHref("/clubes", params)} action="/clubes" {...params} leagues={leagues} />
    <p className="playersResultsSummary">{result.total} clubes encontrados</p>
    {result.clubs.length
      ? <div className="directoryGrid">{result.clubs.map((club) => <ClubCard key={club.id} club={club} />)}</div>
      : <p className="playersEmpty">Nenhum clube encontrado para esta busca.</p>}
    <DirectoryPagination {...result} label="Paginação de clubes"
      href={(page) => directoryHref("/clubes", { ...params, page })} />
  </main>
}
