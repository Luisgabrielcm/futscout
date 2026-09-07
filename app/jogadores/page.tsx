import Link from "next/link"
import { Suspense } from "react"
import { getLeagues, getPlayers } from "../../services/playerService"
import { parsePlayerCatalogParams, playerCatalogQuery } from "../../lib/playerCatalogParams"
import type { CatalogSearchParams } from "../../lib/playerCatalogParams"
import PlayersSearch from "../components/PlayersSearch"

type PlayersPageProps = { searchParams: Promise<CatalogSearchParams> }

// Local Suspense is intentional: a route-level loading file would also stream
// the player detail before its existence check, preventing an HTTP 404.
export default function PlayersPage(props: PlayersPageProps) {
  return (
    <Suspense fallback={
      <main className="playersPage" aria-busy="true">
        <div className="playersEmpty" role="status">
          <h1>Carregando jogadores…</h1>
          <p>Preparando o catálogo FutScout.</p>
        </div>
      </main>
    }>
      <PlayersResults {...props} />
    </Suspense>
  )
}

async function PlayersResults({ searchParams }: PlayersPageProps) {
  const params = parsePlayerCatalogParams(await searchParams)
  const [result, leagues] = await Promise.all([
    getPlayers({ ...params, pageSize: 24 }),
    getLeagues(),
  ])
  const query = playerCatalogQuery(params)
  function createPageHref(page: number) {
    return `/jogadores?${playerCatalogQuery({ ...params, page })}`
  }

  return (
    <main className="playersPage">
      <Link href="/" className="backButton">← Voltar</Link>
      <header className="playersPageHeader">
        <span>DATABASE</span>
        <h1>Jogadores</h1>
        <p>Explore os jogadores disponíveis no FutScout e encontre a melhor opção para seu elenco.</p>
      </header>
      <div className="playersResultsSummary">
        <strong>{result.total.toLocaleString("pt-BR")}</strong>{" "}
        {result.total === 1 ? "jogador encontrado" : "jogadores encontrados"}
      </div>
      <PlayersSearch
        key={query}
        players={result.players}
        leagues={leagues}
        initialSearch={params.search ?? ""}
        initialPosition={params.position ?? ""}
        initialLeague={params.league ?? ""}
        initialMaxAge={String(params.maxAge ?? "")}
        initialMinOverall={String(params.minOverall ?? "")}
        initialMinPotential={String(params.minPotential ?? "")}
        initialMaxValue={String(params.maxValue ?? "")}
        initialMinPace={String(params.minPace ?? "")}
        initialMinShooting={String(params.minShooting ?? "")}
        initialMinPassing={String(params.minPassing ?? "")}
        initialMinDribbling={String(params.minDribbling ?? "")}
        initialMinDefending={String(params.minDefending ?? "")}
        initialMinPhysical={String(params.minPhysical ?? "")}
        initialSort={params.sort}
      />
      {result.page > result.totalPages && (
        <p className="playersEmpty">
          Esta página não tem resultados.{" "}
          <Link href={createPageHref(1)}>Voltar à primeira página</Link>
        </p>
      )}
      {result.totalPages > 1 && (
        <nav className="playersPagination" aria-label="Paginação de jogadores">
          {result.page > 1 ? (
            <Link href={createPageHref(Math.min(result.page - 1, result.totalPages))} className="paginationButton">← Anterior</Link>
          ) : <span className="paginationButton paginationButtonDisabled">← Anterior</span>}
          <span className="paginationStatus">
            Página <strong>{result.page}</strong> de <strong>{result.totalPages}</strong>
          </span>
          {result.page < result.totalPages ? (
            <Link href={createPageHref(result.page + 1)} className="paginationButton">Próxima →</Link>
          ) : <span className="paginationButton paginationButtonDisabled">Próxima →</span>}
        </nav>
      )}
    </main>
  )
}
