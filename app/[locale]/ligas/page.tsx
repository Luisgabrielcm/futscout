import { t, localizedHref } from "../../../lib/i18n"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { getLeagueCatalog } from "../../../services/leagueService"
import { directoryHref, parseDirectoryParams } from "../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import { DirectoryNav, DirectoryPagination, DirectorySearch, LeagueCard } from "../../components/DirectoryCatalog"


export default async function LeaguesPage({ searchParams, params: routeParams }: { searchParams: Promise<CatalogSearchParams>; params?: Promise<{ locale: string }> }) {
  const locale = requireLocale((await routeParams)?.locale ?? "pt")
  const { search, page } = parseDirectoryParams(await searchParams)
  const result = await getLeagueCatalog({ search, page })
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <header className="playersPageHeader">
      <span>DATABASE</span><h1>{t(locale, "Ligas")}</h1>
      <p>{t(locale, "Conheça as ligas e explore seus clubes e jogadores.")}</p>
    </header>
    <DirectorySearch locale={locale} key={directoryHref(localizedHref(locale, "/ligas"), { search })} action={localizedHref(locale, "/ligas")} search={search} />
    <p className="playersResultsSummary">{result.total} {t(locale, "ligas encontradas")}</p>
    {result.leagues.length
      ? <div className="directoryGrid">{result.leagues.map((league) => <LeagueCard locale={locale} key={league.id} league={league} />)}</div>
      : <p className="playersEmpty">{t(locale, "Nenhuma liga encontrada para esta busca.")}</p>}
    <DirectoryPagination locale={locale} {...result} label={t(locale, "Paginação de ligas")}
      href={(page) => directoryHref(localizedHref(locale, "/ligas"), { search, page })} />
  </main>
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/ligas", t(locale, "Ligas"), false)
}
