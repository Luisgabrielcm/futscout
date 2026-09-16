import { t, localizedHref } from "../../../../lib/i18n"
import { requireLocale } from "../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getPlayerBySlug,
} from "../../../../services/playerService"

import PlayerAttributes from "../../../components/PlayerAttributes"
import PlayerHeader from "../../../components/PlayerHeader"
import PlayerPlayStyles from "../../../components/PlayerPlayStyles"
import PlayerPositions from "../../../components/PlayerPositions"
import PlayerQuickProfile from "../../../components/PlayerQuickProfile"
import ScoutAnalysis from "../../../components/ScoutAnalysis"
import PlayerActions from "../../../components/PlayerActions"
import PlayerCareer from "../../../components/PlayerCareer"
import PlayerHistory from "../../../components/PlayerHistory"
import { visualText } from "../../../../lib/i18n/visualRevision"

type PlayerPageProps = {
  params: Promise<{
    slug: string
    locale?: string
  }>
}

export default async function PlayerPage({
  params,
}: PlayerPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")

  const profile =
    await getPlayerBySlug(slug)

  if (!profile) {
    notFound()
  }

  if (profile.status === "incomplete") {
    return (
      <main className="playerPage">
        <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}><Link
          href={localizedHref(locale, "/jogadores")}
          className="backButton"
        >
          {t(locale, "Jogadores")}</Link><span aria-hidden="true">›</span><span aria-current="page">{profile.name}</span></nav>

        <div className="playersEmpty">
          <h1>
            {profile.name}
          </h1>
          <PlayerActions locale={locale} slug={slug} name={profile.name} />

          <p>
            {t(locale, "Perfil incompleto: os atributos deste jogador ainda não estão disponíveis. Nenhuma estatística foi estimada para preencher esses dados.")}</p>
        </div>
      </main>
    )
  }

  const player = profile.player
  const isGoalkeeper = player.position === "GOL"

  return (
    <main className="playerPage">
      <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}><Link
        href={localizedHref(locale, "/jogadores")}
        className="backButton"
      >
        {t(locale, "Jogadores")}</Link><span aria-hidden="true">›</span><span aria-current="page">{player.name}</span></nav>

      <PlayerHeader locale={locale}
        player={player}
      />
      <PlayerActions locale={locale} slug={player.slug} name={player.name} />

      <nav className="playerSectionNav" aria-label={visualText(locale, "profileNav")}>
        <a href="#overview">{visualText(locale, "overview")}</a>
        <a href="#ea-sports-fc">EA SPORTS FC</a>
        <a href="#real-life">{visualText(locale, "realLife")}</a>
        <a href="#attributes">{visualText(locale, "attributes")}</a>
        <a href="#playstyles">PlayStyles</a>
        <a href="#statistics">{visualText(locale, "statistics")}</a>
        <a href="#history">{visualText(locale, "history")}</a>
      </nav>

      <section id="overview" className="profileSection" aria-labelledby="overview-title">
        <h2 id="overview-title">{visualText(locale, "overview")}</h2>
        <PlayerQuickProfile locale={locale} player={player} />
      </section>

      <section id="ea-sports-fc" className="profileSection" data-domain="ea" aria-labelledby="ea-title">
        <h2 id="ea-title">EA SPORTS FC</h2>
        <dl className="careerFields eaCatalogContext">
          <div><dt>{visualText(locale, "catalogClub")}</dt><dd>{player.club?.name ?? "—"}</dd></div>
          <div><dt>{visualText(locale, "catalogLeague")}</dt><dd>{player.league ?? "—"}</dd></div>
        </dl>

      {isGoalkeeper ? (
        <section className="playersEmpty">
          <h2>{t(locale, "Análise FutScout")}</h2>
          <p>{t(locale, "Análise específica para goleiros em desenvolvimento.")}</p>
        </section>
      ) : <PlayerPositions locale={locale} player={player} />}
      </section>

      <PlayerCareer locale={locale} catalogClub={player.club?.name ?? null} />

      <section id="attributes" className="profileSection" data-domain="ea" aria-label={visualText(locale, "attributes")}>
        <span className="sectionEyebrow">EA SPORTS FC</span>
        <PlayerAttributes locale={locale} isGoalkeeper={isGoalkeeper} attributes={player.attributes} />
      </section>
      <div id="playstyles" className="profileSection" data-domain="ea">
        <PlayerPlayStyles locale={locale} player={player} />
      </div>

      <section id="statistics" className="profileSection" aria-labelledby="statistics-title">
        <h2 id="statistics-title">{visualText(locale, "statistics")}</h2>
        <p className="mutedText">{visualText(locale, "realStatsMissing")}</p>
        {!isGoalkeeper && <span className="sectionEyebrow">FutScout · EA SPORTS FC</span>}
      {!isGoalkeeper && <ScoutAnalysis locale={locale}
        player={player}
      />}
      </section>
      <PlayerHistory locale={locale} />
    </main>
  )
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const profile = await getPlayerBySlug(slug)
  if (!profile) return localizedMetadata(locale, `/jogadores/${encodeURIComponent(slug)}`, t(locale, "Jogador não encontrado"), true)
  const name = profile.status === "incomplete" ? profile.name : profile.player.name
  return localizedMetadata(locale, `/jogadores/${encodeURIComponent(slug)}`, t(locale, "playerDetailTitle", { name }))
}
