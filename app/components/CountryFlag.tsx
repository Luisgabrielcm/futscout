import { t, type Locale } from "../../lib/i18n"

import { getCountryFlag } from "../../lib/countryFlags"
import PlayerImage from "./PlayerImage"

export default function CountryFlag({ locale = "pt", country }: { locale?: Locale; country: string | null }) {
  const flag = getCountryFlag(country)
  return <span className="playerNationality">
    {flag?.iconSrc && <PlayerImage locale={locale} src={flag.iconSrc} alt={t(locale, "flagFor", { name: country ?? "" })} kind="asset"
      className="countryFlag" fallbackClassName="countryFlagUnavailable" fallbackText="" />}
    {country?.trim() || t(locale, "Não informada")}
  </span>
}
