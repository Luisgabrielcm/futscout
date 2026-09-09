import { t, localizedHref, type Locale, type LocaleProps } from "../../lib/i18n"

import Link from "next/link"
import PlayerImage from "./PlayerImage"
import PlayerCard from "./PlayerCard"
import type { Player } from "../../types/player"
import { displayCountry } from "../../lib/directoryCatalogParams"

export function DirectoryNav({ locale = "pt" }: LocaleProps = {}) {
  return <nav className="directoryNav" aria-label={t(locale, "Catálogo FutScout")}>
    <Link href={localizedHref(locale, "/")}>{t(locale, "← Início")}</Link>
  </nav>
}

export function DirectorySearch({ locale = "pt", action, search, league, leagues }: { locale?: Locale;
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
    <button className="paginationButton" type="submit">{t(locale, "Buscar")}</button>
    <Link href={action} className="paginationButton">{t(locale, "Limpar filtros")}</Link>
  </form>
}

export function DirectoryBadge({ locale = "pt", name, imageUrl }: { locale?: Locale; name: string; imageUrl?: string | null }) {
  return <PlayerImage locale={locale} key={imageUrl ?? name} src={imageUrl ?? undefined} alt={name} kind="club"
    className="directoryBadge" fallbackClassName="directoryBadge directoryBadgeFallback" />
}

export function ClubCard({ locale = "pt", club }: { locale?: Locale; club: {
  name: string; slug: string; imageUrl: string | null
  league: { name: string }; _count: { players: number }
} }) {
  return <Link href={localizedHref(locale, `/clubes/${encodeURIComponent(club.slug)}`)} className="directoryCard">
    <DirectoryBadge locale={locale} name={club.name} imageUrl={club.imageUrl} />
    <h3>{club.name}</h3>
    <p>{club.league.name}</p>
    <span>{club._count.players} {t(locale, "jogadores cadastrados")}</span>
  </Link>
}

export function LeagueCard({ locale = "pt", league }: { locale?: Locale; league: {
  name: string; slug: string; country: string; _count: { clubs: number }
} }) {
  const country = displayCountry(league.country)
  return <Link href={localizedHref(locale, `/ligas/${encodeURIComponent(league.slug)}`)} className="directoryCard">
    <DirectoryBadge locale={locale} name={league.name} />
    <h3>{league.name}</h3>
    {country && <p>{country}</p>}
    <span>{league._count.clubs} {t(locale, "clubes cadastrados")}</span>
  </Link>
}

export function DirectoryPagination({ locale = "pt", page, totalPages, href, label }: { locale?: Locale;
  page: number; totalPages: number; href: (page: number) => string; label: string
}) {
  if (page > totalPages) return <p className="playersEmpty">
    {t(locale, "Esta página não tem resultados.")}{" "}<Link href={href(1)}>{t(locale, "Voltar à primeira página")}</Link>
  </p>
  if (totalPages <= 1) return null
  return <nav className="playersPagination" aria-label={label}>
    {page > 1
      ? <Link className="paginationButton" href={href(page - 1)}>{t(locale, "← Anterior")}</Link>
      : <span className="paginationButton paginationButtonDisabled">{t(locale, "← Anterior")}</span>}
    <span className="paginationStatus">{t(locale, "Página")}{" "}{page} {t(locale, "de")}{" "}{totalPages}</span>
    {page < totalPages
      ? <Link className="paginationButton" href={href(page + 1)}>{t(locale, "Próxima →")}</Link>
      : <span className="paginationButton paginationButtonDisabled">{t(locale, "Próxima →")}</span>}
  </nav>
}

export function DirectoryPlayers({ locale = "pt", players, empty }: { locale?: Locale; players: Player[]; empty: string }) {
  if (!players.length) return <p className="playersEmpty">{empty}</p>
  return <div className="playersPageGrid">
    {players.map((player) => <PlayerCard locale={locale} key={player.id} {...player} club={player.club?.name ?? null} />)}
  </div>
}
