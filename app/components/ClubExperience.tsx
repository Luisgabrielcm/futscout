import Link from "next/link"
import { t, localeTags, type Locale } from "../../lib/i18n"
import { clubText, SQUAD_SORTS } from "../../lib/i18n/clubExperience"
import { displayForm } from "../../lib/i18n/presentation"
import { entityHref, nationalityHref, relatedPlayersHref } from "../../lib/connectedNavigation"
import type { ClubRating } from "../../lib/clubRating"
import type { Player } from "../../types/player"
import { formatCurrency } from "../../utils/formatCurrency"
import PlayerImage from "./PlayerImage"
import CountryFlag from "./CountryFlag"
import type { ReactNode } from "react"
import { organizeClubPitch, validPitchOverall, type PitchPlayer } from "../../lib/clubPitchLayout"
import { getPlayerProfilePositions } from "../../lib/playerProfilePositions"

export function ClubRatingPanel({ locale, rating }: { locale: Locale; rating: ClubRating }) {
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString(localeTags[locale], { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return <section className="clubRatingPanel" aria-label={clubText(locale, "rating")}>
    <div><span>{clubText(locale, "rating")}</span><strong>{number(rating.overall)}</strong></div>
    <div><span>{clubText(locale, "goalkeeper")}</span><strong>{number(rating.goalkeeper)}</strong></div>
    <p>{clubText(locale, "coverage")}: {rating.rated}/{rating.total}</p>
    <details className="ratingMethod"><summary>{clubText(locale, "methodology")}</summary><p>{clubText(locale, "method")}</p></details>
  </section>
}

function PitchPortrait({ locale, player, compact = false }: { locale: Locale; player: PitchPlayer; compact?: boolean }) {
  return <Link prefetch={false} href={entityHref(locale, "jogadores", player.slug)!} className={compact ? "squadOption" : "clubPitchPlayer"}>
    <PlayerImage locale={locale} src={player.imageUrl ?? undefined} alt={player.name} className="pitchPortrait" fallbackClassName="pitchPortrait portraitFallback" />
    <strong>{player.name}</strong><span className="clubPitchPosition">{player.position}</span>
    <span className="pitchOverall"><small>EA</small> {validPitchOverall(player.officialOverall) ? player.officialOverall : "—"}</span>
  </Link>
}

export function ClubPitch({ locale, players, information, squadHref }: { locale: Locale; players: PitchPlayer[]; information?: ReactNode; squadHref?: string }) {
  const { sectors, options } = organizeClubPitch(players)
  return <section className="clubOverview">
    <div className="clubFieldPanel">
      <div className="fieldHeading"><span className="sectionEyebrow">{clubText(locale, "previewLabel")}</span><h2>{clubText(locale, "organization")}</h2></div>
      <p className="clubDisclosure">{clubText(locale, "organizationMethod")}</p>
      {players.length ? <div className="clubPitch">
        <div className="pitchMarkings" aria-hidden="true"><i className="pitchHalf" /><i className="pitchCircle" /><i className="pitchBox pitchBoxTop" /><i className="pitchBox pitchBoxBottom" /></div>
        {sectors.map(sector => <section key={sector.key} className="clubPitchRow" aria-label={clubText(locale, sector.key)}>
          <h3>{clubText(locale, sector.key)}</h3><div className="clubPitchPlayers">
            {sector.players.map(player => <PitchPortrait key={player.id} locale={locale} player={player} />)}
            {!sector.players.length && <p className="pitchEmpty">{clubText(locale, "noSector")}</p>}
          </div>
        </section>)}
      </div> : <p className="playersEmpty">{clubText(locale, "empty")}</p>}
    </div>
    <aside className="clubOverviewAside">
      <section className="squadOptionsPanel"><div className="sectionTitleRow"><h2>{clubText(locale, "options")}</h2><span>{options.length}</span></div>
        {options.length ? <div className="squadOptionsGrid">{options.map(player => <PitchPortrait key={player.id} locale={locale} player={player} compact />)}</div> : <p className="clubDisclosure">{clubText(locale, "noOptions")}</p>}
        {squadHref && <Link className="fullSquadLink" href={squadHref}>{clubText(locale, "allSquad")} <span aria-hidden="true">↗</span></Link>}
      </section>
      {information}
    </aside>
  </section>
}

export function SquadSort({ locale, sort, tab, search }: { locale: Locale; sort: string; tab?: string; search?: string }) {
  return <form method="get" className="directoryFilters">
    {tab && <input type="hidden" name="tab" value={tab} />}
    <label>{t(locale, "Buscar por nome")}<input type="search" name="search" defaultValue={search} maxLength={200} /></label>
    <label>{clubText(locale, "sort")}<select name="sort" defaultValue={sort}>
      {SQUAD_SORTS.map(value => <option key={value} value={value}>{clubText(locale, value)}</option>)}
    </select></label><button type="submit" className="paginationButton">{t(locale, "Buscar")}</button>
  </form>
}

export function SquadList({ locale, players }: { locale: Locale; players: Player[] }) {
  if (!players.length) return <p className="playersEmpty">{clubText(locale, "empty")}</p>
  return <div className="clubSquadList">{players.map(player => {
    const clubHref = entityHref(locale, "clubes", player.club?.slug)
    const countryHref = nationalityHref(locale, player.nationality)
    return <article className="clubSquadPlayer" key={player.id}>
      <Link className="clubSquadIdentity" prefetch={false} href={entityHref(locale, "jogadores", player.slug)!}>
        <PlayerImage locale={locale} src={player.image} alt={player.name} className="squadPortrait" fallbackClassName="squadPortrait portraitFallback" /><strong>{player.name}</strong><span className="cardDestination" aria-hidden="true">↗</span>
      </Link>
      <div className="clubSquadContext">
        {clubHref ? <Link href={clubHref}>{player.club?.name}</Link> : <span>{player.club?.name ?? t(locale, "Sem clube")}</span>}
        {countryHref && <Link href={countryHref}><CountryFlag locale={locale} country={player.nationality} /></Link>}
        <span className="squadPositions">{getPlayerProfilePositions(player).map((position, index) => <Link key={position} className={`positionChip ${index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}`} href={relatedPlayersHref(locale, { position })}>{position}</Link>)}</span>
      </div>
      <dl>
        <div><dt>OVR EA</dt><dd>{player.baseOverall}</dd></div>
        <div><dt>OVR FutScout</dt><dd>{player.dynamicOverall ?? "—"}</dd></div>
        <div><dt>{clubText(locale, "potential")}</dt><dd>{player.potential ?? "—"}</dd></div>
        <div><dt>{clubText(locale, "age")}</dt><dd>{player.age ?? "—"}</dd></div>
        <div><dt>{clubText(locale, "value")}</dt><dd>{player.marketValue === null ? "—" : formatCurrency(player.marketValue, locale)}</dd></div>
        <div><dt>{clubText(locale, "form")}</dt><dd>{displayForm(player.form, locale) ?? "—"}</dd></div>
      </dl>
    </article>
  })}</div>
}
