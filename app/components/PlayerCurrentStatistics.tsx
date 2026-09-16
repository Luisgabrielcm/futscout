import type { Locale } from "../../lib/i18n"
import { historyText, displayCareerCount } from "../../lib/i18n/playerHistory"
import type { CurrentPlayerStatistics } from "../../types/playerHistory"

export default function PlayerCurrentStatistics({ locale, data }: { locale: Locale; data?: CurrentPlayerStatistics | null }) {
  const verified = data?.source.trim() && data.period.trim() && data.competition.trim() ? data : null
  return <section id="statistics" className="profileSection" data-domain="real" aria-labelledby="statistics-title">
    <h2 id="statistics-title">{historyText(locale, "statistics")}</h2>
    <p className="mutedText">{historyText(locale, "current")}</p>
    {verified ? <p>{verified.period} · {verified.competition}</p> : <p className="careerEmpty">{historyText(locale, "statsMissing")}</p>}
    <dl className="careerMetricGrid">{(["appearances", "goals", "assists", "minutes", "starts"] as const).map(key =>
      <div key={key}><dt>{historyText(locale, key)}</dt><dd>{displayCareerCount(verified?.[key])}</dd></div>)}</dl>
  </section>
}
