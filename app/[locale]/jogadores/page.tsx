import { t, localizedHref, localeTags, type Locale } from "../../../lib/i18n"
import { requireLocale } from "../../../lib/i18n/server"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import Link from "next/link"
import { Suspense } from "react"
import { getLeagues, getPlayers } from "../../../services/playerService"
import { parsePlayerCatalogParams, playerCatalogQuery } from "../../../lib/playerCatalogParams"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import PlayersSearch from "../../components/PlayersSearch"

type PlayersPageProps = { params?: Promise<{ locale: string }>; locale?: Locale; searchParams: Promise<CatalogSearchParams> }

// Local Suspense is intentional: a route-level loading file would also stream
// the player detail before its existence check, preventing an HTTP 404.
export default async function PlayersPage(props: PlayersPageProps) {
  const locale = requireLocale((await props.params)?.locale ?? "pt")
  return (
    <Suspense fallback={
      <main className="playersPage" aria-busy="true">
        <div className="playersEmpty" role="status">
          <h1>{t(locale, "Carregando jogadores…")}</h1>
          <p>{t(locale, "Preparando o catálogo FutScout.")}</p>
        </div>
      </main>
    }>
      <PlayersResults {...props} locale={locale} />
    </Suspense>
  )
}

async function PlayersResults({ searchParams, locale = "pt" }: PlayersPageProps) {
  const params = parsePlayerCatalogParams(await searchParams)
  const [result, leagues] = await Promise.all([
    getPlayers({ ...params, pageSize: 24 }),
    getLeagues(),
  ])
  const query = playerCatalogQuery(params)
  function createPageHref(page: number) {
    return localizedHref(locale, `/jogadores?${playerCatalogQuery({ ...params, page })}`)
  }

  return (
    <main className="playersPage">
      <Link href={localizedHref(locale, "/")} className="backButton">{t(locale, "← Voltar")}</Link>
      <header className="playersPageHeader">
        <span>DATABASE</span>
        <h1>{t(locale, "Jogadores")}</h1>
        <p>{t(locale, "Explore os jogadores disponíveis no FutScout e encontre a melhor opção para seu elenco.")}</p>
      </header>
      <div className="playersResultsSummary">
        <strong>{result.total.toLocaleString(localeTags[locale])}</strong>{" "}
        {result.total === 1 ? t(locale, "jogador encontrado") : t(locale, "jogadores encontrados")}
      </div>
      <PlayersSearch locale={locale}
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
          {t(locale, "Esta página não tem resultados.")}{" "}
          <Link href={createPageHref(1)}>{t(locale, "Voltar à primeira página")}</Link>
        </p>
      )}
      {result.totalPages > 1 && (
        <nav className="playersPagination" aria-label={t(locale, "Paginação de jogadores")}>
          {result.page > 1 ? (
            <Link href={createPageHref(Math.min(result.page - 1, result.totalPages))} className="paginationButton">{t(locale, "← Anterior")}</Link>
          ) : <span className="paginationButton paginationButtonDisabled">{t(locale, "← Anterior")}</span>}
          <span className="paginationStatus">
            {t(locale, "Página")}{" "}<strong>{result.page}</strong> {t(locale, "de")}{" "}<strong>{result.totalPages}</strong>
          </span>
          {result.page < result.totalPages ? (
            <Link href={createPageHref(result.page + 1)} className="paginationButton">{t(locale, "Próxima →")}</Link>
          ) : <span className="paginationButton paginationButtonDisabled">{t(locale, "Próxima →")}</span>}
        </nav>
      )}
    </main>
  )
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/jogadores", t(locale, "Jogadores"), false)
}
