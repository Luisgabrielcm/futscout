import { getCountryFlag } from "../../lib/countryFlags"
import PlayerImage from "./PlayerImage"

export default function CountryFlag({ country }: { country: string | null }) {
  const flag = getCountryFlag(country)
  return <span className="playerNationality">
    {flag?.iconSrc && <PlayerImage src={flag.iconSrc} alt={`Bandeira: ${country}`} kind="asset"
      className="countryFlag" fallbackClassName="countryFlagUnavailable" fallbackText="" />}
    {country?.trim() || "Não informada"}
  </span>
}
