"use client"

import React, { useState } from "react"
import type { Locale } from "../../lib/i18n"
import { statisticsForSeason, type RealStatisticView } from "../../lib/realStatistics"

export default function PlayerSeasonStatistics({ locale, rows }: { locale: Locale; rows: RealStatisticView[] }) {
  const pt = locale === "pt"
  const seasons = [...new Set(rows.map(row => row.season))].sort((a, b) => b - a)
  const [selected, setSelected] = useState<number | null>(null)
  const season = selected !== null && seasons.includes(selected) ? selected : seasons[0]
  const visible = statisticsForSeason(rows, season)
  return <section id="statistics" className="profileSection" data-domain="real" aria-labelledby="statistics-title">
    <h2 id="statistics-title">{pt ? "Estatísticas por temporada" : "Season statistics"}</h2>
    {seasons.length > 0 && <label>{pt ? "Temporada (ano da fonte) " : "Season (source year) "}
      <select value={season} onChange={event => setSelected(Number(event.target.value))}>
        {seasons.map(year => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>}
    <p className="mutedText">{pt ? "Dados históricos por clube e competição; não indicam o clube atual. Cobertura parcial ou não comprovada." : "Historical club and competition data; not the current club. Coverage is partial or unverified."}</p>
    {visible.length === 0 && <p className="careerEmpty">{pt ? "Estatísticas indisponíveis. Ausência de dados não significa zero jogos." : "Statistics unavailable. Missing data does not mean zero appearances."}</p>}
    {visible.map(row => {
      const goalkeeper = row.position === "Goalkeeper" || row.position === "GOL"
      const metrics = goalkeeper ? ["appearances", "minutes"] as const : ["appearances", "minutes", "goals", "assists"] as const
      const labels = pt ? { appearances: "Jogos", minutes: "Minutos", goals: "Gols", assists: "Assistências" } : { appearances: "Appearances", minutes: "Minutes", goals: "Goals", assists: "Assists" }
      return <article key={row.id}>
        <h3>{row.teamName} · {row.competitionName}</h3>
        <p className="mutedText">{row.source} · {row.observedAt && Number.isFinite(Date.parse(row.observedAt))
          ? `${pt ? "Coletado em" : "Collected"} ${new Date(row.observedAt).toISOString().slice(0, 10)} UTC`
          : pt ? "Data de coleta não comprovada" : "Collection date unverified"}</p>
        <dl className="careerMetricGrid">{metrics.map(key => <div key={key}><dt>{labels[key]}</dt><dd>{row[key] ?? "—"}</dd></div>)}</dl>
        {goalkeeper && <p className="mutedText">{pt ? "Métricas específicas de goleiro aguardam validação de unidades e cobertura." : "Goalkeeper-specific metrics await unit and coverage validation."}</p>}
      </article>
    })}
  </section>
}
