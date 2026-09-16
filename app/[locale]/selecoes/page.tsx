import { getCountries } from "../../../services/countryService"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { clubText } from "../../../lib/i18n/clubExperience"
import { DirectoryNav } from "../../components/DirectoryCatalog"
import NationalityDirectory from "../../components/NationalityDirectory"

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
    <NationalityDirectory locale={locale} countries={countries} />
  </main>
}
