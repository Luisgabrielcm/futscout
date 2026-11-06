import Link from "next/link"
import { notFound } from "next/navigation"
import { localizedHref, t } from "../../../../lib/i18n"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import { playerExperienceText } from "../../../../lib/i18n/playerExperience"
import { requireLocale } from "../../../../lib/i18n/server"
import { visualText } from "../../../../lib/i18n/visualRevision"
import { getPlayerBySlug } from "../../../../services/playerService"
import { manualWage, readManualEconomics } from "../../../../services/adminEconomic.server"
import { wagePresentation } from "../../../../lib/wagePublication"
import PlayerActions from "../../../components/PlayerActions"
import PlayerAttributes from "../../../components/PlayerAttributes"
import PlayerGoalkeeperAttributes from "../../../components/PlayerGoalkeeperAttributes"
import PlayerExperienceNav from "../../../components/PlayerExperienceNav"
import PlayerHeader from "../../../components/PlayerHeader"
import PlayerPlayStyles from "../../../components/PlayerPlayStyles"
import PlayerPositions from "../../../components/PlayerPositions"
import PlayerQuickProfile from "../../../components/PlayerQuickProfile"
import ScoutAnalysis from "../../../components/ScoutAnalysis"
import GoalkeeperScoutAnalysis from "../../../components/GoalkeeperScoutAnalysis"

type PlayerPageProps = { params: Promise<{ slug: string; locale?: string }> }

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const profile = await getPlayerBySlug(slug)
  if (!profile) notFound()

  if (profile.status === "incomplete") {
    const manual = (await readManualEconomics([profile.id])).get(profile.id)
    const wage = wagePresentation(manualWage(profile.id, manual), profile.id, locale)
    return <main className="playerPage">
      <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}>
        <Link href={localizedHref(locale, "/jogadores")} className="backButton">{t(locale, "Jogadores")}</Link>
        <span aria-hidden="true">›</span><span aria-current="page">{profile.name}</span>
      </nav>
      <div className="playersEmpty">
        <h1>{profile.name}</h1>
        <PlayerActions locale={locale} slug={slug} name={profile.name} />
        <PlayerExperienceNav locale={locale} slug={slug} active="ea" />
        <p>{t(locale, "Perfil incompleto: os atributos deste jogador ainda não estão disponíveis. Nenhuma estatística foi estimada para preencher esses dados.")}</p>
        <dl className="careerFields" aria-label={visualText(locale, "economicData")}>
          <div><dt>{visualText(locale, "weeklySalary")}</dt><dd>{wage?.value ?? "—"}</dd></div>
          <div><dt>{visualText(locale, "contractUntil")}</dt><dd>{manual?.contract?.until
            ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-GB", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(manual.contract.until + "T00:00:00Z"))
            : "—"}</dd></div>
          <div><dt>{visualText(locale, "releaseClause")}</dt><dd>{manual?.clause?.status === "YES" && manual.clause.amount && manual.clause.currency
            ? new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-GB", { style: "currency", currency: manual.clause.currency }).format(Number(manual.clause.amount))
            : manual?.clause?.status === "NO" ? (locale === "pt" ? "Sem cláusula" : "No clause") : "—"}</dd></div>
        </dl>
      </div>
    </main>
  }

  const player = profile.player
  const isGoalkeeper = player.position === "GOL"
  const manual = (await readManualEconomics([player.id])).get(player.id)
  const wage = manualWage(player.id, manual)
  return <main className="playerPage">
    <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}>
      <Link href={localizedHref(locale, "/jogadores")} className="backButton">{t(locale, "Jogadores")}</Link>
      <span aria-hidden="true">›</span><span aria-current="page">{player.name}</span>
    </nav>
    <PlayerHeader locale={locale} player={player} valueContext="career-mode" wage={wage} manualEconomic={manual} />
    <PlayerActions locale={locale} slug={player.slug} name={player.name} />
    <PlayerExperienceNav locale={locale} slug={slug} active="ea" />

    <section id="ea-sports-fc" className="profileSection" data-domain="ea" aria-labelledby="ea-title">
      <span className="sectionEyebrow">{playerExperienceText(locale, "eaContext")}</span>
      <h2 id="ea-title">EA SPORTS FC</h2>
      <PlayerQuickProfile locale={locale} player={player} />
      <dl className="careerFields eaCatalogContext">
        <div><dt>{visualText(locale, "catalogClub")}</dt><dd>{player.club?.name ?? "—"}</dd></div>
        <div><dt>{visualText(locale, "catalogLeague")}</dt><dd>{player.league ?? "—"}</dd></div>
      </dl>
      {isGoalkeeper
        ? <GoalkeeperScoutAnalysis locale={locale} attributes={player.goalkeeperAttributes ?? null} />
        : <PlayerPositions locale={locale} player={player} />}
    </section>

    <section id="attributes" className="profileSection" data-domain="ea" aria-label={visualText(locale, "attributes")}>
      <span className="sectionEyebrow">EA SPORTS FC</span>
      {isGoalkeeper
        ? <PlayerGoalkeeperAttributes locale={locale} attributes={player.goalkeeperAttributes ?? null} />
        : <PlayerAttributes locale={locale} attributes={player.attributes} />}
    </section>
    <div id="playstyles" className="profileSection" data-domain="ea">
      <PlayerPlayStyles locale={locale} player={player} />
    </div>
    {!isGoalkeeper && <section className="profileSection" data-domain="ea">
      <ScoutAnalysis locale={locale} player={player} />
    </section>}
  </main>
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  const profile = await getPlayerBySlug(slug)
  if (!profile) return localizedMetadata(locale, `/jogadores/${encodeURIComponent(slug)}`, t(locale, "Jogador não encontrado"), true)
  const name = profile.status === "incomplete" ? profile.name : profile.player.name
  return localizedMetadata(locale, `/jogadores/${encodeURIComponent(slug)}`, t(locale, "playerDetailTitle", { name }))
}
