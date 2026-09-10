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

      <PlayerQuickProfile locale={locale}
        player={player}
      />

      {isGoalkeeper ? (
        <section className="playersEmpty">
          <h2>{t(locale, "Análise FutScout")}</h2>
          <p>{t(locale, "Análise específica para goleiros em desenvolvimento.")}</p>
        </section>
      ) : <PlayerPositions locale={locale} player={player} />}

      <PlayerPlayStyles locale={locale}
        player={player}
      />

      {!isGoalkeeper && <ScoutAnalysis locale={locale}
        player={player}
      />}

      {!isGoalkeeper && <PlayerAttributes locale={locale}
        attributes={
          player.attributes
        }
      />}
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
