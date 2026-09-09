import { t, localizedHref } from "../../../../lib/i18n"
import { requireLocale } from "../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getClubBySlug, getClubPlayers } from "../../../../services/clubService"
import { directoryHref, parseDirectoryParams } from "../../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../../lib/playerCatalogParams"
import { DirectoryBadge, DirectoryNav, DirectoryPagination, DirectoryPlayers } from "../../../components/DirectoryCatalog"

type Props = { params: Promise<{ slug: string; locale?: string }>; searchParams: Promise<CatalogSearchParams> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const locale = requireLocale((await params).locale ?? "pt")
  const club = await getClubBySlug((await params).slug)
  if (!club) return localizedMetadata(locale, `/clubes/${encodeURIComponent((await params).slug)}`, t(locale, "Clube não encontrado"), true)
  return localizedMetadata(locale, `/clubes/${encodeURIComponent(club.slug)}`, t(locale, "clubDetailTitle", { name: club.name }))
}

export default async function ClubPage({ params, searchParams }: Props) {
  const locale = requireLocale((await params).locale ?? "pt")
  // Check existence before rendering; no inherited loading boundary/soft 404.
  const club = await getClubBySlug((await params).slug)
  if (!club) notFound()
  const { page } = parseDirectoryParams(await searchParams)
  const roster = await getClubPlayers(club.id, { page })
  const path = localizedHref(locale, `/clubes/${encodeURIComponent(club.slug)}`)
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <Link href={localizedHref(locale, "/clubes")} className="backButton">{t(locale, "← Todos os clubes")}</Link>
    <header className="playersPageHeader directoryHeader">
      <DirectoryBadge locale={locale} name={club.name} imageUrl={club.imageUrl} />
      <div><h1>{club.name}</h1>
        <p><Link href={localizedHref(locale, `/ligas/${encodeURIComponent(club.league.slug)}`)}>{club.league.name}</Link></p>
        <p>{club._count.players} {t(locale, "jogadores cadastrados")}</p>
      </div>
    </header>
    <section className="directorySection" aria-labelledby="roster-title">
      <h2 id="roster-title">{t(locale, "Elenco")}</h2>
      <p>{roster.total} {t(locale, "jogadores com atributos disponíveis · Overall EA decrescente")}</p>
      <DirectoryPlayers locale={locale} players={roster.players} empty={t(locale, "Nenhum jogador com atributos disponíveis neste elenco.")} />
      <DirectoryPagination locale={locale} {...roster} label={t(locale, "Paginação do elenco")} href={(page) => directoryHref(path, { page })} />
    </section>
  </main>
}
