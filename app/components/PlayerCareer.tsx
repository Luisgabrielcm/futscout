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
    [visualText(locale, "salary"), displaySalary(verified?.salary, locale) ?? "—"],
    [visualText(locale, "contractUntil"), displayCareerDate(verified?.contractUntil, locale)],
    [visualText(locale, "shirt"), verified?.shirtNumber ?? "—"],
    [visualText(locale, "since"), displayCareerDate(verified?.since, locale)],
    [visualText(locale, "contractStatus"), verified?.contractStatus ?? "—"],
    [visualText(locale, "nationalTeam"), verified?.nationalTeam?.name ?? "—"],
  ]
  return <section className="playerCareer" aria-labelledby="career-title">
    <h2 id="career-title">{visualText(locale, "career")}</h2>
    <p className="mutedText">{visualText(locale, "catalogNote")}</p>
    <dl className="careerFields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3>{visualText(locale, "transfers")}</h3>
    {verified?.transfers?.length ? <>
      <ol className="transferTimeline">{verified.transfers.map(item => <li key={item.id}>
        <span>{displayCareerDate(item.date, locale)}</span>
        <strong>{item.from ?? "—"} → {item.to ?? "—"}</strong><span>{item.typeRaw ?? "—"}</span>
      </li>)}</ol>
      <p className="mutedText">{visualText(locale, "transferNote")}</p>
    </> : <p className="mutedText">{visualText(locale, "noTransfers")}</p>}
  </section>
}
