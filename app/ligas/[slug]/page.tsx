import Link from "next/link"
import { notFound } from "next/navigation"
import { getLeagueBySlug, getLeagueClubs, getLeaguePlayers } from "../../../services/leagueService"
import { directoryHref, displayCountry, parseDirectoryParams } from "../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import { ClubCard, DirectoryBadge, DirectoryNav, DirectoryPagination, DirectoryPlayers } from "../../components/DirectoryCatalog"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<CatalogSearchParams> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const league = await getLeagueBySlug((await params).slug)
  if (!league) notFound()
  return { title: `${league.name} — clubes e jogadores | FutScout` }
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const league = await getLeagueBySlug((await params).slug)
  if (!league) notFound()
  const query = await searchParams
  const { page } = parseDirectoryParams(query)
  const clubsPage = parseDirectoryParams({ page: query.clubsPage }).page
  const [clubs, roster] = await Promise.all([
    getLeagueClubs(league.slug, { page: clubsPage }), getLeaguePlayers(league.slug, { page }),
  ])
  const country = displayCountry(league.country)
  const path = `/ligas/${encodeURIComponent(league.slug)}`
  function href(playerPage: number, clubPage: number, anchor: string) {
    const base = directoryHref(path, { page: playerPage })
    return `${base}${clubPage > 1 ? `${base.includes("?") ? "&" : "?"}clubsPage=${clubPage}` : ""}#${anchor}`
  }
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <Link href="/ligas" className="backButton">← Todas as ligas</Link>
    <header className="playersPageHeader directoryHeader">
      <DirectoryBadge name={league.name} />
      <div><h1>{league.name}</h1>{country && <p>{country}</p>}
        <p>{league._count.clubs} clubes cadastrados</p>
      </div>
    </header>
    <section id="clubes" className="directorySection" aria-labelledby="clubs-title">
      <h2 id="clubs-title">Clubes</h2>
      {clubs.clubs.length
        ? <div className="directoryGrid">{clubs.clubs.map((club) => <ClubCard key={club.id} club={club} />)}</div>
        : <p className="playersEmpty">Nenhum clube encontrado nesta página da liga.</p>}
      <DirectoryPagination {...clubs} label="Paginação de clubes da liga"
        href={(next) => href(page, next, "clubes")} />
    </section>
    <section id="jogadores" className="directorySection" aria-labelledby="players-title">
      <h2 id="players-title">Jogadores</h2>
      <p>{roster.total} jogadores com atributos disponíveis · Overall EA decrescente</p>
      <DirectoryPlayers players={roster.players} empty="Nenhum jogador com atributos disponíveis nesta liga." />
      <DirectoryPagination {...roster} label="Paginação de jogadores da liga"
        href={(next) => href(next, clubsPage, "jogadores")} />
    </section>
  </main>
}
