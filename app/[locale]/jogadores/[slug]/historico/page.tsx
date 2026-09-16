import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref, t } from "../../../../../lib/i18n"
import { requireLocale } from "../../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../../lib/i18n/metadata"
import { historyText } from "../../../../../lib/i18n/playerHistory"
import { getPlayerBySlug } from "../../../../../services/playerService"
import PlayerHistory from "../../../../components/PlayerHistory"

type HistoryPageProps = { params: Promise<{ slug: string; locale?: string }> }

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const profile = await getPlayerBySlug(slug)
  if (!profile) notFound()
  const name = profile.status === "incomplete" ? profile.name : profile.player.name
  const profileHref = localizedHref(locale, `/jogadores/${encodeURIComponent(slug)}`)
  return <main className="playerPage playerHistoryPage">
    <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}>
      <Link href={localizedHref(locale, "/jogadores")}>{t(locale, "Jogadores")}</Link><span aria-hidden="true">›</span>
      <Link href={profileHref}>{name}</Link><span aria-hidden="true">›</span>
      <span aria-current="page">{historyText(locale, "history")}</span>
    </nav>
    <Link href={profileHref} className="profileTextLink">{historyText(locale, "back")}</Link>
    <header className="careerHistoryHeader"><span className="sectionEyebrow">{historyText(locale, "history")}</span>
      <h1>{name}</h1><p className="mutedText">{historyText(locale, "description")}</p></header>
    {/* Public transfer projection is blocked pending revision-resolution policy.
        Never pass raw observations, proposals or unverified aggregates here. */}
    <PlayerHistory locale={locale} />
  </main>
}

export async function generateMetadata({ params }: HistoryPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const profile = await getPlayerBySlug(slug)
  const path = `/jogadores/${encodeURIComponent(slug)}/historico`
  if (!profile) return localizedMetadata(locale, path, t(locale, "Jogador não encontrado"), true)
  const name = profile.status === "incomplete" ? profile.name : profile.player.name
  return localizedMetadata(locale, path, `${name} · ${historyText(locale, "history")}`)
}
