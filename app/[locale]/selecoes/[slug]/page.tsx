import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref } from "../../../../lib/i18n"
import { clubText, SQUAD_SORTS } from "../../../../lib/i18n/clubExperience"
import { requireLocale } from "../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import { countryName } from "../../../../lib/connectedNavigation"
import { getCountry, getCountryPlayers } from "../../../../services/countryService"
import { parsePlayerCatalogParams, playerCatalogQuery, type CatalogSearchParams } from "../../../../lib/playerCatalogParams"
import { DirectoryNav, DirectoryPagination } from "../../../components/DirectoryCatalog"
import { SquadSort, SquadList } from "../../../components/ClubExperience"
import CountryFlag from "../../../components/CountryFlag"

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<CatalogSearchParams> }
export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { locale: value, slug } = await params
  const locale = requireLocale(value)
  const country = await getCountry(slug)
  return localizedMetadata(locale, `/selecoes/${encodeURIComponent(slug)}`, country ? countryName(country.name, locale) : clubText(locale, "missing"), !country)
}
export default async function CountryPage({ params, searchParams }: Props) {
  const { locale: value, slug } = await params
  const locale = requireLocale(value)
  const country = await getCountry(slug)
  if (!country) notFound()
  const parsed = parsePlayerCatalogParams(await searchParams)
  const filters = { search: parsed.search, page: parsed.page, sort: SQUAD_SORTS.find(value => value === parsed.sort) ?? "overall-desc" as const }
  const roster = await getCountryPlayers(country.nationalities, filters)
  const path = localizedHref(locale, `/selecoes/${encodeURIComponent(country.slug)}`)
  return <main className="playersPage directoryPage countryProfilePage">
    <DirectoryNav locale={locale} /><nav className="entityBreadcrumb" aria-label={clubText(locale, "countries")}><Link className="backButton" href={localizedHref(locale, "/selecoes")}>{clubText(locale, "countries")}</Link><span aria-hidden="true">›</span><span aria-current="page">{countryName(country.name, locale)}</span></nav>
    <header className="playersPageHeader countryProfileHero"><div className="countryHeroFlag"><CountryFlag locale={locale} country={country.name} /></div>
      <div><span className="sectionEyebrow">{clubText(locale, "countries")}</span><h1>{countryName(country.name, locale)}</h1>
      <p>{clubText(locale, "registeredFrom").replace("{country}", countryName(country.name, locale))}</p>
      <span className="countryTotal"><strong>{country.total}</strong> {clubText(locale, "registered")}</span></div>
    </header><p className="countryDisclaimer">{clubText(locale, "notCallup")}</p>
    <SquadSort locale={locale} {...filters} /><SquadList locale={locale} players={roster.players} />
    <DirectoryPagination locale={locale} {...roster} label={clubText(locale, "registered")} href={page => `${path}?${playerCatalogQuery({ ...filters, page })}`} />
  </main>
}
