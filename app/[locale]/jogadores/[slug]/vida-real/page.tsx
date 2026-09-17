import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref, t } from "../../../../../lib/i18n"
import { localizedMetadata } from "../../../../../lib/i18n/metadata"
import { playerExperienceText } from "../../../../../lib/i18n/playerExperience"
import { requireLocale } from "../../../../../lib/i18n/server"
import { getPlayerRealLifeBySlug } from "../../../../../services/playerRealLifeService"
import PlayerCareer from "../../../../components/PlayerCareer"
import PlayerCurrentStatistics from "../../../../components/PlayerCurrentStatistics"
import PlayerExperienceNav from "../../../../components/PlayerExperienceNav"
import PlayerHistory from "../../../../components/PlayerHistory"
import PlayerRealLifeHeader from "../../../../components/PlayerRealLifeHeader"

type RealLifePageProps = { params: Promise<{ slug: string; locale?: string }> }

export default async function PlayerRealLifePage({ params }: RealLifePageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const player = await getPlayerRealLifeBySlug(slug)
  if (!player) notFound()
  const approvedClub = player.approvedCurrentClub
  const career = approvedClub ? {
    source: "approved-current-club-v2",
    currentClub: approvedClub.name,
    realLeague: approvedClub.league.name,
  } : null

  return <main className="playerPage playerRealLifePage">
    <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}>
      <Link href={localizedHref(locale, "/jogadores")}>{t(locale, "Jogadores")}</Link><span aria-hidden="true">›</span>
      <Link href={localizedHref(locale, `/jogadores/${encodeURIComponent(slug)}`)}>{player.name}</Link><span aria-hidden="true">›</span>
      <span aria-current="page">{playerExperienceText(locale, "realLife")}</span>
    </nav>
    <PlayerRealLifeHeader locale={locale} player={player} />
    <PlayerExperienceNav locale={locale} slug={slug} active="real" />
    <PlayerCareer locale={locale} catalogClub={player.eaCatalogClub?.name ?? null} data={career} />
    <section className="profileSection realMarketValue" aria-labelledby="real-market-title">
      <h2 id="real-market-title">{playerExperienceText(locale, "marketValue")}</h2>
      <p className="careerEmpty">{playerExperienceText(locale, "marketValueMissing")}</p>
    </section>
    <PlayerCurrentStatistics locale={locale} />
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
