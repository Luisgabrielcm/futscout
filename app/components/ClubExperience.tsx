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

export function ClubRatingPanel({ locale, rating }: { locale: Locale; rating: ClubRating }) {
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString(localeTags[locale], { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return <section className="clubRatingPanel" aria-label={clubText(locale, "rating")}>
    <div><span>{clubText(locale, "rating")}</span><strong>{number(rating.overall)}</strong></div>
    <div><span>{clubText(locale, "goalkeeper")}</span><strong>{number(rating.goalkeeper)}</strong></div>
    <p>{clubText(locale, "coverage")}: {rating.rated}/{rating.total}</p>
    <p>{clubText(locale, "method")}</p>
  </section>
}

type PitchPlayer = { id: string; slug: string; name: string; imageUrl: string | null; position: string; officialOverall: number }
export function ClubPitch({ locale, players }: { locale: Locale; players: PitchPlayer[] }) {
  const positions = ["ATA", "PE", "PD", "MEI", "MC", "VOL", "LE", "ZAG", "LD", "GOL"]
  const extra = [...new Set(players.map(p => p.position))].filter(p => !positions.includes(p)).sort()
  return <section className="directorySection">
    <h2>{clubText(locale, "positions")}</h2><p className="clubDisclosure">{clubText(locale, "notLineup")}</p>
    {players.length ? <div className="clubPitch">{[...positions, ...extra].map(position => {
      const group = players.filter(p => p.position === position)
      return group.length ? <section key={position} className="clubPitchRow" aria-label={position}>
        <h3>{position}</h3><div className="clubPitchPlayers">{group.map(player => <Link key={player.id} prefetch={false}
          href={entityHref(locale, "jogadores", player.slug)!} className="clubPitchPlayer">
          <PlayerImage locale={locale} src={player.imageUrl ?? undefined} alt={player.name} />
          <strong>{player.name}</strong><span>{position} · EA {player.officialOverall}</span>
        </Link>)}</div>
      </section> : null
    })}</div> : <p>{clubText(locale, "empty")}</p>}
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
        <PlayerImage locale={locale} src={player.image} alt={player.name} /><strong>{player.name}</strong>
      </Link>
      <div className="clubSquadContext">
        {clubHref ? <Link href={clubHref}>{player.club?.name}</Link> : <span>{player.club?.name ?? t(locale, "Sem clube")}</span>}
        {countryHref && <Link href={countryHref}><CountryFlag locale={locale} country={player.nationality} /></Link>}
        <span>{[player.position, ...player.secondaryPositions].map(position => <Link key={position} href={relatedPlayersHref(locale, { position })}>{position} </Link>)}</span>
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
