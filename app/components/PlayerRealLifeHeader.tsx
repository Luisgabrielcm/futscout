import Link from "next/link"
import { localizedHref, type Locale } from "../../lib/i18n"
import { playerExperienceText } from "../../lib/i18n/playerExperience"
import type { PlayerRealLifeProfile } from "../../types/playerRealLife"
import ClubLogo from "./ClubLogo"
import CountryFlag from "./CountryFlag"
import LeagueLogo from "./LeagueLogo"
import PlayerImage from "./PlayerImage"

export default function PlayerRealLifeHeader({ locale, player }: {
  locale: Locale
  player: PlayerRealLifeProfile
}) {
  const club = player.approvedCurrentClub
  return <header className="playerRealLifeHeader">
    <div className="playerRealLifeIdentity">
      <PlayerImage locale={locale} src={player.imageUrl ?? undefined} alt={player.name} />
      <div>
        <span className="sectionEyebrow">{playerExperienceText(locale, "realContext")}</span>
        <h1>{player.name}</h1>
        <CountryFlag locale={locale} country={player.nationality} />
      </div>
    </div>
    <section className="realClubContext" aria-labelledby="real-club-title">
      <span className="sectionEyebrow">{playerExperienceText(locale, "approvedClub")}</span>
      {club ? <>
        <Link href={localizedHref(locale, `/clubes/${encodeURIComponent(club.slug)}`)} className="realClubIdentity">
          <ClubLogo locale={locale} name={club.name} asset={club.asset} size="large" />
          <span><strong id="real-club-title">{club.name}</strong><small>{playerExperienceText(locale, "approvedClubNote")}</small></span>
        </Link>
        <Link href={localizedHref(locale, `/ligas/${encodeURIComponent(club.league.slug)}`)} className="realLeagueIdentity">
          <LeagueLogo locale={locale} name={club.league.name} asset={club.league.asset} size="small" />
          <span>{playerExperienceText(locale, "realLeague")}: <strong>{club.league.name}</strong></span>
        </Link>
      </> : <div className="realClubIdentity realClubUnavailable">
        <ClubLogo locale={locale} name={playerExperienceText(locale, "noApprovedClub")} size="large" />
        <span><strong id="real-club-title">{playerExperienceText(locale, "noApprovedClub")}</strong><small>{playerExperienceText(locale, "approvedClubNote")}</small></span>
      </div>}
    </section>
  </header>
}
