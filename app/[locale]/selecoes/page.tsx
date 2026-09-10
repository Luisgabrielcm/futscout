import Link from "next/link"
import { getCountries } from "../../../services/countryService"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { clubText } from "../../../lib/i18n/clubExperience"
import { countryName, entityHref } from "../../../lib/connectedNavigation"
import { DirectoryNav } from "../../components/DirectoryCatalog"
import CountryFlag from "../../components/CountryFlag"

type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props) {
  const locale = requireLocale((await params).locale)
  return localizedMetadata(locale, "/selecoes", clubText(locale, "countries"), false)
}
export default async function CountriesPage({ params }: Props) {
  const locale = requireLocale((await params).locale)
  const countries = await getCountries()
  return <main className="playersPage directoryPage"><DirectoryNav locale={locale} />
    <header className="playersPageHeader"><h1>{clubText(locale, "countries")}</h1><p>{clubText(locale, "notCallup")}</p></header>
    <div className="directoryGrid">{countries.map(country => <Link prefetch={false} key={country.slug} className="directoryCard" href={entityHref(locale, "selecoes", country.slug)!}>
      <CountryFlag locale={locale} country={country.name} /><h2>{countryName(country.name, locale)}</h2><p>{country.total} · {clubText(locale, "registered")}</p>
    </Link>)}</div>
  </main>
}
