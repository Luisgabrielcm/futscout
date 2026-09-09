import { t, localizedHref } from "../../../lib/i18n"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { getClubs } from "../../../services/clubService"
import { getLeagues } from "../../../services/playerService"
import { directoryHref, parseDirectoryParams } from "../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import { ClubCard, DirectoryNav, DirectoryPagination, DirectorySearch } from "../../components/DirectoryCatalog"


export default async function ClubsPage({ searchParams, params: routeParams }: { searchParams: Promise<CatalogSearchParams>; params?: Promise<{ locale: string }> }) {
  const locale = requireLocale((await routeParams)?.locale ?? "pt")
  const params = parseDirectoryParams(await searchParams)
  const [result, leagues] = await Promise.all([getClubs(params), getLeagues()])
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <header className="playersPageHeader">
      <span>DATABASE</span><h1>{t(locale, "Clubes")}</h1>
      <p>{t(locale, "Explore clubes, ligas e os jogadores cadastrados no FutScout.")}</p>
    </header>
    <DirectorySearch locale={locale} key={directoryHref(localizedHref(locale, "/clubes"), params)} action={localizedHref(locale, "/clubes")} {...params} leagues={leagues} />
    <p className="playersResultsSummary">{result.total} {t(locale, "clubes encontrados")}</p>
    {result.clubs.length
      ? <div className="directoryGrid">{result.clubs.map((club) => <ClubCard locale={locale} key={club.id} club={club} />)}</div>
      : <p className="playersEmpty">{t(locale, "Nenhum clube encontrado para esta busca.")}</p>}
    <DirectoryPagination locale={locale} {...result} label={t(locale, "Paginação de clubes")}
      href={(page) => directoryHref(localizedHref(locale, "/clubes"), { ...params, page })} />
  </main>
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/clubes", t(locale, "Clubes"), false)
}
