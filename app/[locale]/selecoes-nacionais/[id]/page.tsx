import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref } from "../../../../lib/i18n"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import { requireLocale } from "../../../../lib/i18n/server"
import { getNationalTeam, getNationalTeamPlayers, nationalTeamsPublicEnabled } from "../../../../services/nationalTeamService"
import { DirectoryNav } from "../../../components/DirectoryCatalog"
import CountryFlag from "../../../components/CountryFlag"
import { getCountry } from "../../../../services/countryService"

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ search?: string; page?: string }> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { locale: value, id } = await params
  const locale = requireLocale(value)
  const team = await getNationalTeam(id)
  return localizedMetadata(locale, `/selecoes-nacionais/${id}`, team?.name ?? "Seleção", !team)
}

export default async function NationalTeamPage({ params, searchParams }: Props) {
  const { locale: value, id } = await params
  const locale = requireLocale(value)
  if (!nationalTeamsPublicEnabled()) notFound()
  const team = await getNationalTeam(id)
  if (!team) notFound()
  const countryPage = team.countryKey ? await getCountry(team.countryKey) : null
  const query = await searchParams
  const search = query.search?.trim().slice(0, 100) ?? ""
  const page = Number(query.page)
  const roster = await getNationalTeamPlayers(id, { search, page: Number.isSafeInteger(page) ? page : 1 })
  const path = localizedHref(locale, `/selecoes-nacionais/${id}`)
  const pageHref = (next: number) => `${path}?${new URLSearchParams({ ...(search ? { search } : {}), page: String(next) })}`
  return <main className="playersPage directoryPage countryProfilePage">
    <DirectoryNav locale={locale} />
    <nav className="entityBreadcrumb"><Link href={localizedHref(locale, "/selecoes-nacionais")}>{locale === "pt" ? "Seleções" : "National teams"}</Link>
      <span aria-hidden="true">›</span><span aria-current="page">{team.name}</span></nav>
    <header className="playersPageHeader countryProfileHero">
      <div className="countryHeroFlag"><CountryFlag locale={locale} country={team.countryName} /></div>
      <div><h1>{team.name}</h1>
        {countryPage && <Link href={localizedHref(locale, `/selecoes/${countryPage.slug}`)}>{team.countryName}</Link>}
        {!countryPage && team.countryName && <span>{team.countryName}</span>}
        <p>{locale === "pt" ? "Elenco da base EA em" : "EA database squad dated"} {team.rosterDate.toLocaleDateString(locale === "pt" ? "pt-BR" : "en-GB", { timeZone: "UTC" })}.
          {" "}{locale === "pt" ? "Não é confirmação de convocação atual." : "Not a confirmation of a current call-up."}</p>
        <span className="countryTotal"><strong>{team.playerCount}</strong> {locale === "pt" ? "jogadores vinculados" : "linked players"}</span>
      </div>
    </header>
    <form action={path} method="get" className="directoryFilters">
      <label>{locale === "pt" ? "Buscar jogador nesta seleção" : "Search this squad"}{" "}
        <input name="search" type="search" defaultValue={search} maxLength={100} /></label>
      <button className="uiButton uiButtonPrimary" type="submit">{locale === "pt" ? "Buscar" : "Search"}</button>
    </form>
    <p role="status">{roster.total} {locale === "pt" ? "jogadores encontrados" : "players found"}</p>
    <div className="directoryGrid">{roster.players.map(player =>
      <Link className="directoryCard" key={player.id} href={localizedHref(locale, `/jogadores/${encodeURIComponent(player.slug)}`)}>
        <h2>{player.name}</h2>
        <p>{player.position} · OVR {player.officialOverall} · {player.age ?? "—"} {locale === "pt" ? "anos" : "years"}</p>
        <span>{player.clubName ?? (locale === "pt" ? "Clube não informado" : "Club unavailable")}</span>
      </Link>)}</div>
    {roster.totalPages > 1 && <nav className="directoryPagination" aria-label={locale === "pt" ? "Páginas" : "Pages"}>
      {roster.page > 1 && <Link href={pageHref(roster.page - 1)}>{locale === "pt" ? "Anterior" : "Previous"}</Link>}
      <span>{roster.page} / {roster.totalPages}</span>
      {roster.page < roster.totalPages && <Link href={pageHref(roster.page + 1)}>{locale === "pt" ? "Próxima" : "Next"}</Link>}
    </nav>}
  </main>
}
