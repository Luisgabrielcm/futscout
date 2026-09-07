import Link from "next/link"
import { notFound } from "next/navigation"
import { getClubBySlug, getClubPlayers } from "../../../services/clubService"
import { directoryHref, parseDirectoryParams } from "../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import { DirectoryBadge, DirectoryNav, DirectoryPagination, DirectoryPlayers } from "../../components/DirectoryCatalog"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<CatalogSearchParams> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const club = await getClubBySlug((await params).slug)
  if (!club) notFound()
  return { title: `${club.name} — jogadores e elenco | FutScout` }
}

export default async function ClubPage({ params, searchParams }: Props) {
  // Check existence before rendering; no inherited loading boundary/soft 404.
  const club = await getClubBySlug((await params).slug)
  if (!club) notFound()
  const { page } = parseDirectoryParams(await searchParams)
  const roster = await getClubPlayers(club.id, { page })
  const path = `/clubes/${encodeURIComponent(club.slug)}`
  return <main className="playersPage directoryPage">
    <DirectoryNav />
    <Link href="/clubes" className="backButton">← Todos os clubes</Link>
    <header className="playersPageHeader directoryHeader">
      <DirectoryBadge name={club.name} imageUrl={club.imageUrl} />
      <div><h1>{club.name}</h1>
        <p><Link href={`/ligas/${encodeURIComponent(club.league.slug)}`}>{club.league.name}</Link></p>
        <p>{club._count.players} jogadores cadastrados</p>
      </div>
    </header>
    <section className="directorySection" aria-labelledby="roster-title">
      <h2 id="roster-title">Elenco</h2>
      <p>{roster.total} jogadores com atributos disponíveis · Overall EA decrescente</p>
      <DirectoryPlayers players={roster.players} empty="Nenhum jogador com atributos disponíveis neste elenco." />
      <DirectoryPagination {...roster} label="Paginação do elenco" href={(page) => directoryHref(path, { page })} />
    </section>
  </main>
}
