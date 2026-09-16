import type { Locale } from "../../lib/i18n"
import { visualText } from "../../lib/i18n/visualRevision"
import { displayCareerDate, displaySalary } from "../../lib/playerCareerPresentation"
import type { PlayerCareerData } from "../../types/playerCareer"

export default function PlayerCareer({ locale, catalogClub, data }: {
  locale: Locale; catalogClub: string | null; data?: PlayerCareerData | null
}) {
  const verified = data?.source.trim() ? data : null
  const fields = [
    [visualText(locale, "catalogClub"), catalogClub ?? "—"],
    [visualText(locale, "currentClub"), verified?.currentClub ?? "—"],
    [visualText(locale, "realLeague"), verified?.realLeague ?? "—"],
    [visualText(locale, "salary"), displaySalary(verified?.salary, locale) ?? "—"],
    [visualText(locale, "contractUntil"), displayCareerDate(verified?.contractUntil, locale)],
    [visualText(locale, "shirt"), verified?.shirtNumber ?? "—"],
    [visualText(locale, "since"), displayCareerDate(verified?.since, locale)],
    [visualText(locale, "contractStatus"), verified?.contractStatus ?? "—"],
    [visualText(locale, "nationalTeam"), verified?.nationalTeam?.name ?? "—"],
    [visualText(locale, "lastTransfer"), verified?.latestTransfer ?? "—"],
  ]
  return <section id="real-life" className="profileSection playerCareer" data-domain="real" aria-labelledby="real-life-title">
    <h2 id="real-life-title">{visualText(locale, "realLife")}</h2>
    <h3>{visualText(locale, "career")}</h3>
    <p className="mutedText">{visualText(locale, "catalogNote")}</p>
    <dl className="careerFields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <a className="profileTextLink" href="#history">{visualText(locale, "transfers")} → {visualText(locale, "history")}</a>
  </section>
}
