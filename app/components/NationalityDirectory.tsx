"use client"

import { useState } from "react"
import Link from "next/link"
import { t, type Locale } from "../../lib/i18n"
import { visualText } from "../../lib/i18n/visualRevision"
import { clubText } from "../../lib/i18n/clubExperience"
import { entityHref } from "../../lib/connectedNavigation"
import { ALPHABET_BUCKETS, filterNationalities, popularNationalities, type AlphabetBucket, type NationalityEntry } from "../../lib/nationalityDirectory"
import CountryFlag from "./CountryFlag"

export default function NationalityDirectory({ locale, countries }: { locale: Locale; countries: NationalityEntry[] }) {
  const [search, setSearch] = useState("")
  const [bucket, setBucket] = useState<AlphabetBucket>("all")
  const results = filterNationalities(countries, locale, search, bucket)
  return <>
    <section className="nationalityPopular" aria-labelledby="popular-title">
      <h2 id="popular-title">{visualText(locale, "popular")}</h2>
      <div className="nationalityShortcuts">{popularNationalities(countries).map(country =>
        <Link prefetch={false} key={country.slug} href={entityHref(locale, "selecoes", country.slug)!}>
          <CountryFlag locale={locale} country={country.name} /> <span>{country.total} <span className="srOnly">{clubText(locale, "registered")}</span></span>
        </Link>)}</div>
    </section>
    <div className="nationalityFilters">
      <label htmlFor="nationality-search">{visualText(locale, "countrySearch")}</label>
      <div className="nationalitySearchRow"><input id="nationality-search" type="search" value={search} maxLength={200}
        placeholder={visualText(locale, "countrySearch")} aria-controls="nationality-results"
        onChange={event => setSearch(event.target.value)} />
        <button type="button" className="uiButton uiButtonSecondary" disabled={!search && bucket === "all"}
          onClick={() => { setSearch(""); setBucket("all") }}>{t(locale, "Limpar filtros")}</button></div>
      <div className="alphabetFilters" role="group" aria-label={visualText(locale, "alphabet")}>
        {ALPHABET_BUCKETS.map(value => <button type="button" key={value} className="uiButton uiButtonSecondary"
          aria-pressed={bucket === value} aria-controls="nationality-results" onClick={() => setBucket(value)}>
          {value === "all" ? visualText(locale, "all") : value}
        </button>)}
      </div>
      <p className="mutedText">{visualText(locale, "withinRange")}</p>
    </div>
    <p role="status" aria-live="polite">{results.length} {visualText(locale, results.length === 1 ? "countryResult" : "countryResults")}</p>
    <div id="nationality-results" className="directoryGrid">
      {results.map(country => <Link prefetch={false} key={country.slug} className="directoryCard" href={entityHref(locale, "selecoes", country.slug)!}>
        <h2><CountryFlag locale={locale} country={country.name} /></h2><p>{country.total} · {clubText(locale, "registered")}</p>
      </Link>)}
    </div>
    {!results.length && <p className="playersEmpty">{visualText(locale, "noCountries")}</p>}
  </>
}
