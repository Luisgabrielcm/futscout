import Link from "next/link"
import PlayerImage from "./PlayerImage"
import PlayerCard from "./PlayerCard"
import type { Player } from "../../types/player"
import { displayCountry } from "../../lib/directoryCatalogParams"

export function DirectoryNav() {
  return <nav className="directoryNav" aria-label="Catálogo FutScout">
    <Link href="/">← Início</Link>
  </nav>
}

export function DirectorySearch({ action, search, league, leagues }: {
  action: string; search?: string; league?: string
  leagues?: { id: string; name: string; slug: string }[]
}) {
  return <form action={action} method="get" className="directoryFilters">
    <label>Buscar por nome
      <input name="search" type="search" defaultValue={search ?? ""} maxLength={200} placeholder="Digite um nome" />
    </label>
    {leagues && <label>Liga
      <select name="league" defaultValue={league ?? ""}>
        <option value="">Todas as ligas</option>
        {league && !leagues.some((item) => item.slug === league) &&
          <option value={league}>Liga não encontrada</option>}
        {leagues.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
      </select>
    </label>}
    <button className="paginationButton" type="submit">Buscar</button>
    <Link href={action} className="paginationButton">Limpar filtros</Link>
  </form>
}

export function DirectoryBadge({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return <PlayerImage key={imageUrl ?? name} src={imageUrl ?? undefined} alt={name} kind="club"
    className="directoryBadge" fallbackClassName="directoryBadge directoryBadgeFallback" />
}

export function ClubCard({ club }: { club: {
  name: string; slug: string; imageUrl: string | null
  league: { name: string }; _count: { players: number }
} }) {
  return <Link href={`/clubes/${encodeURIComponent(club.slug)}`} className="directoryCard">
    <DirectoryBadge name={club.name} imageUrl={club.imageUrl} />
    <h3>{club.name}</h3>
    <p>{club.league.name}</p>
    <span>{club._count.players} jogadores cadastrados</span>
  </Link>
}

export function LeagueCard({ league }: { league: {
  name: string; slug: string; country: string; _count: { clubs: number }
} }) {
  const country = displayCountry(league.country)
  return <Link href={`/ligas/${encodeURIComponent(league.slug)}`} className="directoryCard">
    <DirectoryBadge name={league.name} />
    <h3>{league.name}</h3>
    {country && <p>{country}</p>}
    <span>{league._count.clubs} clubes cadastrados</span>
  </Link>
}

export function DirectoryPagination({ page, totalPages, href, label }: {
  page: number; totalPages: number; href: (page: number) => string; label: string
}) {
  if (page > totalPages) return <p className="playersEmpty">
    Esta página não tem resultados. <Link href={href(1)}>Voltar à primeira página</Link>
  </p>
  if (totalPages <= 1) return null
  return <nav className="playersPagination" aria-label={label}>
    {page > 1
      ? <Link className="paginationButton" href={href(page - 1)}>← Anterior</Link>
      : <span className="paginationButton paginationButtonDisabled">← Anterior</span>}
    <span className="paginationStatus">Página {page} de {totalPages}</span>
    {page < totalPages
      ? <Link className="paginationButton" href={href(page + 1)}>Próxima →</Link>
      : <span className="paginationButton paginationButtonDisabled">Próxima →</span>}
  </nav>
}

export function DirectoryPlayers({ players, empty }: { players: Player[]; empty: string }) {
  if (!players.length) return <p className="playersEmpty">{empty}</p>
  return <div className="playersPageGrid">
    {players.map((player) => <PlayerCard key={player.id} {...player} club={player.club?.name ?? null} />)}
  </div>
}
