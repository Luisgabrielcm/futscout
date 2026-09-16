import type { Locale } from "../../lib/i18n"
import { visualText } from "../../lib/i18n/visualRevision"
import { displayCareerDate } from "../../lib/playerCareerPresentation"
import { historyText, displayCareerCount } from "../../lib/i18n/playerHistory"
import type { PlayerHistoryData } from "../../types/playerHistory"

export default function PlayerHistory({ locale, data }: { locale: Locale; data?: PlayerHistoryData | null }) {
  const verified = data?.source.trim() ? data : null
  const transfers = verified?.transfers
  return <div id="history" className="careerHistory" data-domain="real">
    <section className="profileSection" aria-labelledby="career-summary-title">
      <h2 id="career-summary-title">{historyText(locale, "summary")}</h2>
      <dl className="careerMetricGrid">{(["appearances", "goals", "assists", "trophies", "clubs"] as const).map(key =>
        <div key={key}><dt>{historyText(locale, key)}</dt><dd>{displayCareerCount(verified?.summary?.[key])}</dd></div>)}</dl>
      {!verified?.summary && <p className="careerEmpty">{historyText(locale, "summaryMissing")}</p>}
    </section>
    <section className="profileSection" aria-labelledby="career-seasons-title">
      <h2 id="career-seasons-title">{historyText(locale, "seasons")}</h2>
      {verified?.seasons?.length ? <ul className="careerRows">{verified.seasons.map((row, index) => <li key={index}>
        <h3>{row.season}</h3><p>{row.club ?? "—"} · {row.competition ?? "—"}</p>
        <dl className="careerMetricGrid">{(["appearances", "minutes", "goals", "assists"] as const).map(key =>
          <div key={key}><dt>{historyText(locale, key)}</dt><dd>{displayCareerCount(row[key])}</dd></div>)}</dl>
      </li>)}</ul> : <p className="careerEmpty">{historyText(locale, "seasonsMissing")}</p>}
    </section>
    <section className="profileSection" aria-labelledby="career-transfers-title">
    <h2 id="career-transfers-title">{visualText(locale, "transfers")}</h2>
    {transfers?.length ? <>
      <ol className="transferTimeline">{transfers.map((item, index) => <li key={index}>
        <span>{displayCareerDate(item.date, locale)}</span>
        <strong>{item.from ?? "—"} → {item.to ?? "—"}</strong><span>{item.typeRaw ?? "—"}</span>
      </li>)}</ol>
      <p className="mutedText">{visualText(locale, "transferNote")}</p>
    </> : <p className="careerEmpty">{visualText(locale, "noTransfers")}</p>}
    </section>
    <section className="profileSection" aria-labelledby="career-clubs-title">
      <h2 id="career-clubs-title">{historyText(locale, "clubs")}</h2>
      {verified?.clubs?.length ? <ul className="careerRows">{verified.clubs.map((row, index) => <li key={index}>
        <h3>{row.name}</h3><p>{displayCareerDate(row.from, locale)} → {displayCareerDate(row.until, locale)}</p>
      </li>)}</ul> : <p className="careerEmpty">{historyText(locale, "clubsMissing")}</p>}
    </section>
    <section className="profileSection" aria-labelledby="career-trophies-title">
      <h2 id="career-trophies-title">{historyText(locale, "trophies")}</h2>
      {verified?.trophies?.length ? <ul className="careerRows">{verified.trophies.map((row, index) => <li key={index}>
        <h3>{row.competition}</h3><p>{row.season} · {row.team ?? "—"}</p>
      </li>)}</ul> : <p className="careerEmpty">{historyText(locale, "trophiesMissing")}</p>}
    </section>
    <section className="profileSection" aria-labelledby="career-international-title">
      <h2 id="career-international-title">{historyText(locale, "international")}</h2>
      {verified?.international?.length ? <ul className="careerRows">{verified.international.map((row, index) => <li key={index}>
        <h3>{row.team}</h3><p>{row.period ?? "—"}</p>
        <dl className="careerMetricGrid">{(["appearances", "goals", "assists"] as const).map(key =>
          <div key={key}><dt>{historyText(locale, key)}</dt><dd>{displayCareerCount(row[key])}</dd></div>)}</dl>
      </li>)}</ul> : <p className="careerEmpty">{historyText(locale, "internationalMissing")}</p>}
    </section>
  </div>
}
