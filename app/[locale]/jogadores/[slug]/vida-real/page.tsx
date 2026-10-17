import Link from "next/link"
import { notFound } from "next/navigation"
import { t } from "../../../../../lib/i18n"
import { playerCatalogContext, playerCatalogReturnHref, playerProfileHref } from "../../../../../lib/connectedNavigation"
import type { CatalogSearchParams } from "../../../../../lib/playerCatalogParams"
import { localizedMetadata } from "../../../../../lib/i18n/metadata"
import { playerExperienceText } from "../../../../../lib/i18n/playerExperience"
import { requireLocale } from "../../../../../lib/i18n/server"
import { getPlayerRealLifeBySlug } from "../../../../../services/playerRealLifeService"
import PlayerCareer from "../../../../components/PlayerCareer"
import PlayerSeasonStatistics from "../../../../components/PlayerSeasonStatistics"
import PlayerExperienceNav from "../../../../components/PlayerExperienceNav"
import PlayerHistory from "../../../../components/PlayerHistory"
import PlayerRealLifeHeader from "../../../../components/PlayerRealLifeHeader"
import PlayerRealMarketValue from "../../../../components/PlayerRealMarketValue"

type RealLifePageProps = { params: Promise<{ slug: string; locale?: string }>; searchParams?: Promise<CatalogSearchParams> }

export default async function PlayerRealLifePage({ params, searchParams }: RealLifePageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const player = await getPlayerRealLifeBySlug(slug)
  if (!player) notFound()
  const catalogContext = playerCatalogContext((await searchParams)?.catalog)
  const approvedClub = player.approvedCurrentClub
  const career = approvedClub ? {
    source: "approved-current-club-v2",
    currentClub: approvedClub.name,
    realLeague: approvedClub.league.name,
  } : null

  return <main className="playerPage playerRealLifePage">
    <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}>
      <Link href={playerCatalogReturnHref(locale, catalogContext)}>{t(locale, catalogContext ? "Voltar aos resultados" : "Jogadores")}</Link><span aria-hidden="true">›</span>
      <Link href={playerProfileHref(locale, slug, catalogContext)}>{player.name}</Link><span aria-hidden="true">›</span>
      <span aria-current="page">{playerExperienceText(locale, "realLife")}</span>
    </nav>
    <PlayerRealLifeHeader locale={locale} player={player} />
    <PlayerExperienceNav locale={locale} slug={slug} active="real" catalogContext={catalogContext} />
    <PlayerRealMarketValue locale={locale} value={player.realMarketValue} />
    <PlayerCareer locale={locale} catalogClub={player.eaCatalogClub?.name ?? null} data={career} />
    <PlayerSeasonStatistics locale={locale} rows={player.statistics ?? []} />
    {/* A public transfer projection stays empty until revision resolution is safe. */}
    <PlayerHistory locale={locale} />
  </main>
}

export async function generateMetadata({ params }: RealLifePageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const player = await getPlayerRealLifeBySlug(slug)
  const path = `/jogadores/${encodeURIComponent(slug)}/vida-real`
  if (!player) return localizedMetadata(locale, path, t(locale, "Jogador não encontrado"), true)
  return localizedMetadata(locale, path, `${player.name} · ${playerExperienceText(locale, "realLife")}`)
}
