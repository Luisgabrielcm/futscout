import Link from "next/link"
import type { AssociatedLineupPlayer, OfficialLineupView } from "../../types/officialLineup"
import { localeTags, type Locale } from "../../lib/i18n"
import { lineupText } from "../../lib/i18n/officialLineup"
import { clubText } from "../../lib/i18n/clubExperience"
import { entityHref } from "../../lib/connectedNavigation"
import { validPitchOverall } from "../../lib/clubPitchLayout"
import { formatCurrency } from "../../utils/formatCurrency"
import PlayerImage from "./PlayerImage"

function OfficialPlayer({ player, locale, bench = false }: { player: AssociatedLineupPlayer; locale: Locale; bench?: boolean }) {
  const catalog = player.catalog
  const position = player.position && ["G", "D", "M", "F"].includes(player.position) ? lineupText(locale, `position${player.position}` as "positionG" | "positionD" | "positionM" | "positionF") : "—"
  const content = <>
    <PlayerImage locale={locale} src={catalog?.imageUrl ?? undefined} alt={player.name} className="pitchPortrait" fallbackClassName="pitchPortrait portraitFallback" />
    <strong>{player.name}</strong><span>{position}</span>
    <span className="pitchOverall"><small>OVR EA</small> {catalog && validPitchOverall(catalog.officialOverall) ? catalog.officialOverall : "—"}</span>
    {!catalog && <small>{lineupText(locale, "unresolved")}</small>}
    {bench && <dl><div><dt>{clubText(locale, "potential")}</dt><dd>{catalog?.potential ?? "—"}</dd></div><div><dt>{clubText(locale, "value")}</dt><dd>{catalog?.marketValue == null ? "—" : formatCurrency(Number(catalog.marketValue), locale)}</dd></div></dl>}
  </>
  const className = bench ? "officialBenchPlayer" : "clubPitchPlayer officialStarter"
  return catalog ? <Link prefetch={false} className={className} href={entityHref(locale, "jogadores", catalog.slug)!}>{content}</Link> : <div className={className}>{content}</div>
}

export function OfficialLineupPanel({ lineup, locale }: { lineup: OfficialLineupView; locale: Locale }) {
  const displayDate = new Date(lineup.fixture.date).toLocaleDateString(localeTags[locale], { timeZone: "UTC" })
  return <div className="clubFieldPanel officialLineupPanel">
    <div className="fieldHeading"><span className="sectionEyebrow">API-FOOTBALL</span><h2>{lineupText(locale, "title")}</h2></div>
    <p>{lineupText(locale, "latest")}</p>
    <h3>{lineup.fixture.home.name} × {lineup.fixture.away.name}</h3>
    <p>{lineup.fixture.competition.name} · <time dateTime={lineup.fixture.date}>{displayDate}</time> · UTC</p>
    <p>{lineupText(locale, "formation")}: {lineup.formation ?? "—"}</p>
    <p className="clubDisclosure">{lineupText(locale, "date")}: {displayDate}. {lineupText(locale, "rating")}</p>
    {lineup.stale && <p role="status">{lineupText(locale, "stale")}</p>}
    {lineup.rows ? <div className="clubPitch clubXiPitch" aria-label={lineupText(locale, "title")}>
      <div className="pitchMarkings" aria-hidden="true"><i className="pitchHalf" /><i className="pitchCircle" /><i className="pitchBox pitchBoxTop" /><i className="pitchBox pitchBoxBottom" /></div>
      {lineup.rows.map((row, i) => <div className={`clubPitchRow ${row.length === 5 ? "xiRowWide" : ""}`} key={i}><div className="clubPitchPlayers">{row.map((p, j) => <OfficialPlayer key={j} locale={locale} player={p} />)}</div></div>)}
    </div> : <div><p>{lineupText(locale, "placement")}</p><div className="officialUnplaced">{lineup.startXI.map((p, i) => <OfficialPlayer key={i} locale={locale} player={p} />)}</div></div>}
    <section className="officialBench" aria-label={lineupText(locale, "substitutes")}><h2>{lineupText(locale, "substitutes")}</h2>
      {lineup.substitutes?.length ? <div className="officialBenchGrid">{lineup.substitutes.map((p, i) => <OfficialPlayer key={i} locale={locale} player={p} bench />)}</div> : <p>{lineupText(locale, "unavailable")}</p>}
    </section>
  </div>
}
