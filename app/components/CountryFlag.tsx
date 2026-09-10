import { t, type Locale } from "../../lib/i18n"

import { getCountryFlag } from "../../lib/countryFlags"
import { displayNationality } from "../../lib/i18n/countries"
import PlayerImage from "./PlayerImage"

export default function CountryFlag({ locale = "pt", country }: { locale?: Locale; country: string | null }) {
  const flag = getCountryFlag(country)
  const name = displayNationality(country, locale)
  return <span className="playerNationality">
    {flag?.iconSrc && <PlayerImage locale={locale} src={flag.iconSrc} alt={t(locale, "flagFor", { name })} kind="asset"
      className="countryFlag" fallbackClassName="countryFlagUnavailable" fallbackText="" />}
    {name}
  </span>
}
