import Link from "next/link"
import { t, localeTags, type Locale } from "../../lib/i18n"
import { clubText, SQUAD_SORTS } from "../../lib/i18n/clubExperience"
import { displayForm, displayPosition } from "../../lib/i18n/presentation"
import { entityHref, nationalityHref, relatedPlayersHref } from "../../lib/connectedNavigation"
import type { ClubRating } from "../../lib/clubRating"
import type { Player } from "../../types/player"
import { formatCurrency } from "../../utils/formatCurrency"
import PlayerImage from "./PlayerImage"
import CountryFlag from "./CountryFlag"
import type { ReactNode } from "react"
import { organizeClubPitch, groupClubSquad, pitchPositions, validPitchOverall, type PitchPlayer } from "../../lib/clubPitchLayout"
import { getPlayerProfilePositions } from "../../lib/playerProfilePositions"
import { OfficialLineupPanel } from "./OfficialLineupPanel"
import type { OfficialLineupView } from "../../types/officialLineup"

export function ClubRatingPanel({ locale, rating }: { locale: Locale; rating: ClubRating }) {
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString(localeTags[locale], { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return <section className="clubRatingPanel" aria-label={clubText(locale, "rating")}>
    <div><span>{clubText(locale, "rating")}</span><strong>{number(rating.overall)}</strong></div>
    <div><span>{clubText(locale, "goalkeeper")}</span><strong>{number(rating.goalkeeper)}</strong></div>
    <p>{clubText(locale, "coverage")}: {rating.rated}/{rating.total}</p>
    <details className="ratingMethod"><summary>{clubText(locale, "methodology")}</summary><p>{clubText(locale, "method")}</p></details>
  </section>
}

function PitchPortrait({ locale, player, position }: { locale: Locale; player: PitchPlayer; position: string }) {
  return <Link prefetch={false} href={entityHref(locale, "jogadores", player.slug)!} className="clubPitchPlayer" data-position={position}>
    <PlayerImage locale={locale} src={player.imageUrl ?? undefined} alt={player.name} className="pitchPortrait" fallbackClassName="pitchPortrait portraitFallback" />
    <strong>{player.name}</strong><span className="clubPitchPosition">{displayPosition(position, locale)}</span>
    <span className="pitchOverall"><small>EA</small> {validPitchOverall(player.officialOverall) ? player.officialOverall : "—"}</span>
  </Link>
}

export function SquadPositionPanel({ locale, players, selectedIds, official = false }: { locale: Locale; players: PitchPlayer[]; selectedIds: ReadonlySet<string>; official?: boolean }) {
  const groups = groupClubSquad(players)
  return <section className="squadPositionPanel" aria-label={clubText(locale, "positions")}>
    <div className="sectionTitleRow"><h2>{clubText(locale, "positions")}</h2><span>{players.length}</span></div>
    <p className="clubDisclosure">{clubText(locale, official ? "notLineup" : "panelMethod")}</p>
    <div className="squadPositionGroups">{groups.map(group => <section key={group.key} className="squadPositionGroup" aria-label={clubText(locale, group.key)}>
      <h3>{clubText(locale, group.key)} <span>{group.players.length}</span></h3>
      {group.players.map(player => <Link key={player.id} prefetch={false} className="squadPositionCard" href={entityHref(locale, "jogadores", player.slug)!}>
        <PlayerImage locale={locale} src={player.imageUrl ?? undefined} alt={player.name} className="squadPanelPortrait" fallbackClassName="squadPanelPortrait portraitFallback" />
        <div className="squadPanelIdentity"><strong>{player.name}</strong>
          <span className="squadPanelPositions">{pitchPositions(player).map((position, index) => <span key={position} className={index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}>{displayPosition(position, locale)}</span>)}</span>
          {selectedIds.has(player.id) && <span className="xiMarker">{clubText(locale, "xiMarker")}</span>}
        </div>
        <dl className="squadPanelStats">
          <div><dt>OVR EA</dt><dd>{validPitchOverall(player.officialOverall) ? player.officialOverall : "—"}</dd></div>
          <div><dt>{clubText(locale, "potential")}</dt><dd>{player.potential ?? "—"}</dd></div>
          <div><dt>{clubText(locale, "value")}</dt><dd>{player.marketValue === null ? "—" : formatCurrency(Number(player.marketValue), locale)}</dd></div>
        </dl>
      </Link>)}
    </section>)}</div>
    {!players.length && <p className="playersEmpty">{clubText(locale, "empty")}</p>}
  </section>
}

export function ClubPitch({ locale, players, information, squadHref, officialLineup }: { locale: Locale; players: PitchPlayer[]; information?: ReactNode; squadHref?: string; officialLineup?: OfficialLineupView | null }) {
  if (officialLineup) return <section className="clubOverview">
    <OfficialLineupPanel locale={locale} lineup={officialLineup} />
    <aside className="clubOverviewAside"><div><SquadPositionPanel locale={locale} players={players} selectedIds={new Set()} official />
      {squadHref && <Link className="fullSquadLink" href={squadHref}>{clubText(locale, "allSquad")} <span aria-hidden="true">↗</span></Link>}
    </div>{information}</aside>
  </section>
  const xi = organizeClubPitch(players)
  const selectedIds = new Set(xi.selected.map(slot => slot.player.id))
  return <section className="clubOverview">
    <div className="clubFieldPanel">
      <div className="fieldHeading"><span className="sectionEyebrow">{clubText(locale, "previewLabel")}</span><h2>{clubText(locale, "organization")} {xi.formation && <span className="xiFormation">{xi.formation}</span>}</h2></div>
      <p className="clubDisclosure">{clubText(locale, "organizationMethod")}</p>
      {xi.formation ? <div className="clubPitch clubXiPitch" aria-label={clubText(locale, "organization")}>
        <div className="pitchMarkings" aria-hidden="true"><i className="pitchHalf" /><i className="pitchCircle" /><i className="pitchBox pitchBoxTop" /><i className="pitchBox pitchBoxBottom" /></div>
        {xi.rows.map((row, index) => <div key={index} className={`clubPitchRow ${row.length === 5 ? "xiRowWide" : ""}`}>
          <div className="clubPitchPlayers">{row.map(slot => <PitchPortrait key={slot.player.id} locale={locale} player={slot.player} position={slot.position} />)}</div>
        </div>)}
      </div> : <div className="xiUnavailable"><h3>{clubText(locale, "xiUnavailable")}</h3><p>{clubText(locale, "xiPartial").replace("{count}", String(xi.coverage))}</p></div>}
      <details className="ratingMethod xiMethod"><summary>{clubText(locale, "xiMethodTitle")}</summary><p>{clubText(locale, "xiMethod")}</p></details>
    </div>
    <aside className="clubOverviewAside">
      <div><SquadPositionPanel locale={locale} players={players} selectedIds={selectedIds} />
        {squadHref && <Link className="fullSquadLink" href={squadHref}>{clubText(locale, "allSquad")} <span aria-hidden="true">↗</span></Link>}
      </div>
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
    </select></label><button type="submit" className="uiButton uiButtonPrimary">{t(locale, "Buscar")}</button>
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
        <span className="squadPositions">{getPlayerProfilePositions(player).map((position, index) => <Link key={position} className={`positionChip ${index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}`} href={relatedPlayersHref(locale, { position })}>{displayPosition(position, locale)}</Link>)}</span>
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
