import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref } from "../../../lib/i18n"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { requireLocale } from "../../../lib/i18n/server"
import { getNationalTeams, nationalTeamsPublicEnabled } from "../../../services/nationalTeamService"
import { DirectoryNav } from "../../components/DirectoryCatalog"
import CountryFlag from "../../components/CountryFlag"

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ search?: string }> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const locale = requireLocale((await params).locale)
  return localizedMetadata(locale, "/selecoes-nacionais", locale === "pt" ? "Seleções nacionais" : "National teams", !nationalTeamsPublicEnabled())
}

export default async function NationalTeamsPage({ params, searchParams }: Props) {
  const locale = requireLocale((await params).locale)
  if (!nationalTeamsPublicEnabled()) notFound()
  const search = (await searchParams).search?.trim().slice(0, 100) ?? ""
  const teams = (await getNationalTeams()).filter(team =>
    !search || `${team.name} ${team.countryName ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const path = localizedHref(locale, "/selecoes-nacionais")
  return <main className="playersPage directoryPage">
    <DirectoryNav locale={locale} />
    <header className="playersPageHeader"><h1>{locale === "pt" ? "Seleções nacionais" : "National teams"}</h1>
      <p>{locale === "pt" ? "Elencos registrados por versão da base EA. Não representam convocações atuais." :
        "Squads recorded by EA database version. They are not current call-ups."}</p></header>
    <form action={path} method="get" className="directoryFilters">
      <label>{locale === "pt" ? "Buscar seleção" : "Search team"}{" "}
        <input name="search" type="search" defaultValue={search} maxLength={100} /></label>
      <button className="uiButton uiButtonPrimary" type="submit">{locale === "pt" ? "Buscar" : "Search"}</button>
    </form>
    <p role="status">{teams.length} {locale === "pt" ? "seleções" : "teams"}</p>
    <div className="directoryGrid">{teams.map(team =>
      <Link key={team.eaTeamId} className="directoryCard" href={localizedHref(locale, `/selecoes-nacionais/${team.eaTeamId}`)}>
        <CountryFlag locale={locale} country={team.countryName} /><h2>{team.name}</h2>
        <p>{team.countryName ?? (locale === "pt" ? "País não vinculado" : "Country pending")}</p>
        <span>{team.playerCount} {locale === "pt" ? "jogadores vinculados" : "linked players"}</span>
      </Link>)}</div>
  </main>
}
