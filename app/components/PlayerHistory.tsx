import type { Locale } from "../../lib/i18n"
import { visualText } from "../../lib/i18n/visualRevision"
import { displayCareerDate } from "../../lib/playerCareerPresentation"
import type { PlayerCareerData } from "../../types/playerCareer"

export default function PlayerHistory({ locale, data }: { locale: Locale; data?: PlayerCareerData | null }) {
  const transfers = data?.source.trim() ? data.transfers : null
  return <section id="history" className="profileSection" data-domain="real" aria-labelledby="history-title">
    <span className="sectionEyebrow">{visualText(locale, "realLife")}</span>
    <h2 id="history-title">{visualText(locale, "history")}</h2>
    <h3>{visualText(locale, "transfers")}</h3>
    {transfers?.length ? <>
      <ol className="transferTimeline">{transfers.map(item => <li key={item.id}>
        <span>{displayCareerDate(item.date, locale)}</span>
        <strong>{item.from ?? "—"} → {item.to ?? "—"}</strong><span>{item.typeRaw ?? "—"}</span>
      </li>)}</ol>
      <p className="mutedText">{visualText(locale, "transferNote")}</p>
    </> : <p className="mutedText">{visualText(locale, "noTransfers")}</p>}
  </section>
}
