import { t, localizedHref, localeTags, type Locale, type LocaleProps } from "../../lib/i18n"

import Link from "next/link"
import PlayerImage from "./PlayerImage"
import PlayerCard from "./PlayerCard"
import type { Player } from "../../types/player"
import { displayCountry } from "../../lib/directoryCatalogParams"
import { displayNationality } from "../../lib/i18n/countries"
import { CLUB_SORTS } from "../../lib/directoryCatalogParams"
import { clubText } from "../../lib/i18n/clubExperience"
import type { ClubRating } from "../../lib/clubRating"
import LeagueLogo from "./LeagueLogo"
export { default as DirectoryPagination } from "./CatalogPagination"

export function DirectoryNav({ locale = "pt" }: LocaleProps = {}) {
  return <nav className="directoryNav" aria-label={t(locale, "Catálogo FutScout")}>
    <Link href={localizedHref(locale, "/")}>{t(locale, "← Início")}</Link>
  </nav>
}

export function DirectorySearch({ locale = "pt", action, search, league, leagues, sort }: { locale?: Locale;
  sort?: string
  action: string; search?: string; league?: string
  leagues?: { id: string; name: string; slug: string }[]
}) {
  return <form action={action} method="get" className="directoryFilters">
    <label>{t(locale, "Buscar por nome")}{" "}<input name="search" type="search" defaultValue={search ?? ""} maxLength={200} placeholder={t(locale, "Digite um nome")} />
    </label>
    {leagues && <label>{t(locale, "Liga")}{" "}<select name="league" defaultValue={league ?? ""}>
        <option value="">{t(locale, "Todas as ligas")}</option>
        {league && !leagues.some((item) => item.slug === league) &&
          <option value={league}>{t(locale, "Liga não encontrada")}</option>}
        {leagues.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
      </select>
    </label>}
    {leagues && <label>{clubText(locale, "sort")}<select name="sort" defaultValue={sort ?? "name-asc"}>
      {CLUB_SORTS.map(value => <option key={value} value={value}>{clubText(locale, value)}</option>)}
    </select></label>}
    <button className="uiButton uiButtonPrimary" type="submit">{t(locale, "Buscar")}</button>
    <Link href={action} className="uiButton uiButtonSecondary">{t(locale, "Limpar filtros")}</Link>
  </form>
}

export function DirectoryBadge({ locale = "pt", name, imageUrl }: { locale?: Locale; name: string; imageUrl?: string | null }) {
  return <PlayerImage locale={locale} key={imageUrl ?? name} src={imageUrl ?? undefined} alt={name} kind="club"
    width={72} height={72} className="directoryBadge" fallbackClassName="directoryBadge directoryBadgeFallback" />
}

export function ClubCard({ locale = "pt", club }: { locale?: Locale; club: {
  name: string; slug: string; imageUrl: string | null
  league: { name: string }; _count: { players: number }
  rating?: ClubRating
} }) {
  return <Link href={localizedHref(locale, `/clubes/${encodeURIComponent(club.slug)}`)} className="directoryCard">
    <DirectoryBadge locale={locale} name={club.name} imageUrl={club.imageUrl} />
    <h3>{club.name}</h3>
    <p>{club.league.name}</p>
    <span>{club._count.players} {t(locale, "jogadores cadastrados")}</span>
    {club.rating && <p className="clubCardRating" title={clubText(locale, "method")}>{clubText(locale, "rating")}: <strong>{club.rating.overall?.toLocaleString(localeTags[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? "—"}</strong>
      <small>{clubText(locale, "coverage")}: {club.rating.rated}/{club.rating.total}</small>
    </p>}
  </Link>
}

export function LeagueCard({ locale = "pt", league }: { locale?: Locale; league: {
  name: string; slug: string; country: string; logoUrl?: string | null; _count: { clubs: number }
} }) {
  const country = displayCountry(league.country)
  return <Link href={localizedHref(locale, `/ligas/${encodeURIComponent(league.slug)}`)} className="directoryCard">
    <LeagueLogo locale={locale} name={league.name} logoUrl={league.logoUrl} />
    <h3>{league.name}</h3>
    {country && <p>{displayNationality(country, locale)}</p>}
    <span>{league._count.clubs} {t(locale, "clubes cadastrados")}</span>
  </Link>
}

export function DirectoryPlayers({ locale = "pt", players, empty }: { locale?: Locale; players: Player[]; empty: string }) {
  if (!players.length) return <p className="playersEmpty">{empty}</p>
  return <div className="playersPageGrid">
    {players.map((player) => <PlayerCard locale={locale} key={player.id} {...player} club={player.club?.name ?? null} clubImageUrl={player.club?.imageUrl} />)}
  </div>
}
