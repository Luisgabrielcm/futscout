import { t, localizedHref } from "../../../../lib/i18n"
import { requireLocale } from "../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getLeagueBySlug, getLeagueClubs, getLeaguePlayers } from "../../../../services/leagueService"
import { directoryHref, displayCountry, parseDirectoryParams } from "../../../../lib/directoryCatalogParams"
import type { CatalogSearchParams } from "../../../../lib/playerCatalogParams"
import { ClubCard, DirectoryNav, DirectoryPagination, DirectoryPlayers } from "../../../components/DirectoryCatalog"
import { CLUB_SORTS } from "../../../../lib/directoryCatalogParams"
import { clubText } from "../../../../lib/i18n/clubExperience"
import { displayNationality } from "../../../../lib/i18n/countries"
import LeagueLogo from "../../../components/LeagueLogo"

type Props = { params: Promise<{ slug: string; locale?: string }>; searchParams: Promise<CatalogSearchParams> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const locale = requireLocale((await params).locale ?? "pt")
  const league = await getLeagueBySlug((await params).slug)
  if (!league) return localizedMetadata(locale, `/ligas/${encodeURIComponent((await params).slug)}`, t(locale, "Liga não encontrada"), true)
  return localizedMetadata(locale, `/ligas/${encodeURIComponent(league.slug)}`, t(locale, "leagueDetailTitle", { name: league.name }))
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const locale = requireLocale((await params).locale ?? "pt")
  const league = await getLeagueBySlug((await params).slug)
  if (!league) notFound()
  const query = await searchParams
  const { page, sort } = parseDirectoryParams(query)
  const clubsPage = parseDirectoryParams({ page: query.clubsPage }).page
  const [clubs, roster] = await Promise.all([
    getLeagueClubs(league.slug, { page: clubsPage, sort }), getLeaguePlayers(league.slug, { page }),
  ])
  const country = displayCountry(league.country)
  const path = localizedHref(locale, `/ligas/${encodeURIComponent(league.slug)}`)
  function href(playerPage: number, clubPage: number, anchor: string) {
    const base = directoryHref(path, { page: playerPage, sort })
    return `${base}${clubPage > 1 ? `${base.includes("?") ? "&" : "?"}clubsPage=${clubPage}` : ""}#${anchor}`
  }
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <Link href={localizedHref(locale, "/ligas")} className="backButton">{t(locale, "← Todas as ligas")}</Link>
    <header className="playersPageHeader directoryHeader">
      <LeagueLogo locale={locale} name={league.name} asset={league.asset} size="large" />
      <div><h1>{league.name}</h1>{country && <p>{displayNationality(country, locale)}</p>}
        <p>{league._count.clubs} {t(locale, "clubes cadastrados")}</p>
      </div>
    </header>
    <section id="clubes" className="directorySection" aria-labelledby="clubs-title">
      <h2 id="clubs-title">{t(locale, "Clubes")}</h2>
      <form method="get" className="directoryFilters"><input type="hidden" name="page" value={page} />
        <label>{clubText(locale, "sort")}<select name="sort" defaultValue={sort}>{CLUB_SORTS.map(value => <option key={value} value={value}>{clubText(locale, value)}</option>)}</select></label>
        <button className="uiButton uiButtonPrimary" type="submit">{t(locale, "Buscar")}</button>
      </form>
      {clubs.clubs.length
        ? <div className="directoryGrid">{clubs.clubs.map((club) => <ClubCard locale={locale} key={club.id} club={club} />)}</div>
        : <p className="playersEmpty">{t(locale, "Nenhum clube encontrado nesta página da liga.")}</p>}
      <DirectoryPagination locale={locale} {...clubs} label={t(locale, "Paginação de clubes da liga")}
        href={(next) => href(page, next, "clubes")} />
    </section>
    <section id={t(locale, "jogadores")} className="directorySection" aria-labelledby="players-title">
      <h2 id="players-title">{t(locale, "Jogadores")}</h2>
      <p>{roster.total} {t(locale, "jogadores com atributos disponíveis · Overall EA decrescente")}</p>
      <DirectoryPlayers locale={locale} players={roster.players} empty={t(locale, "Nenhum jogador com atributos disponíveis nesta liga.")} />
      <DirectoryPagination locale={locale} {...roster} label={t(locale, "Paginação de jogadores da liga")}
        href={(next) => href(next, clubsPage, t(locale, "jogadores"))} />
    </section>
  </main>
}
