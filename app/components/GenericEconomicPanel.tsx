import type { Locale } from "../../lib/i18n/config"
import type { GenericEconomicView } from "../../lib/genericEconomicTypes"
import styles from "./GenericEconomicPanel.module.css"

export default function GenericEconomicPanel({ view, locale }: { view: GenericEconomicView; locale: Locale }) {
  const pt = locale === "pt"
  const money = (value: number) => new Intl.NumberFormat(pt ? "pt-BR" : "en-GB", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(value)
  return <section className={styles.panel} data-domain="simulation" data-ea-id={view.eaId}
    data-status="ESTIMATED" data-confidence="LOW" aria-labelledby="game-economic-simulation-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>FutScout · {pt ? "Modo carreira" : "Career Mode"}</p>
        <h2 id="game-economic-simulation-title">{pt ? "Estimativas para simulação" : "Simulation estimates"}</h2></div>
      <span className={styles.badge}>ESTIMATED · {pt ? "confiança LOW" : "LOW confidence"}</span>
    </header>
    <p className={styles.notice}>{pt
      ? "Dados estatísticos estimados pelo FutScout, sem confirmação como valores oficiais do EA FC 27. A identidade real deste jogador permanece não verificada (UNKNOWN)."
      : "Estimated statistical data by FutScout, unconfirmed as official EA FC 27 values. This player's real identity remains unverified (UNKNOWN)."}</p>
    <dl className={styles.figures}>
      <div><dt>{pt ? "Salário semanal estimado" : "Estimated weekly wage"}</dt>
        <dd data-field="simulation-weekly-wage">{money(view.weeklyWageEur)}<small> / {pt ? "semana" : "week"}</small></dd>
        <p>{pt ? "Equivalente de remuneração total; composição não confirmada." : "Total remuneration equivalent; composition unconfirmed."}</p></div>
      <div><dt>{pt ? "Valor estimado para simulação" : "Estimated simulation value"}</dt>
        <dd data-field="simulation-market-value">{money(view.marketValueEur)}</dd>
        <p>{pt ? "Modelo adaptado à simulação, sem calibração específica para este lote." : "Model adapted to simulation, without specific calibration for this batch."}</p></div>
    </dl>
    <div className={styles.reference} data-domain="game-source-reference">
      <strong>{pt ? "Contrato no arquivo local" : "Contract in the local file"}: {view.contractReference.endYear} ({pt ? "ano" : "year"})</strong>
      <p>{pt ? "Ano observado no arquivo de origem. Não confirma contrato na vida real nem na versão atual do elenco." : "Year observed in the source file. It does not confirm a real-life contract or the current squad version."}</p>
      <p>{pt ? "Cláusula existente no jogo: desconhecida (UNKNOWN)." : "Existing in-game release clause: unknown (UNKNOWN)."}</p>
    </div>
    <details className={styles.details} data-domain="simulation-hypotheses">
      <summary>{pt ? "Hipóteses de simulação" : "Simulation assumptions"}</summary>
      <p>{pt ? "Cenários hipotéticos, sem afirmar condições contratuais existentes." : "Hypothetical scenarios, without claiming existing contractual terms."}</p>
      <dl className={styles.hypotheses}>
        <div><dt>{pt ? "Duração hipotética" : "Hypothetical duration"}</dt><dd>{view.simulation.durationYears} {pt ? view.simulation.durationYears === 1 ? "ano" : "anos" : view.simulation.durationYears === 1 ? "year" : "years"}</dd></div>
        <div><dt>{pt ? "Cláusula hipotética" : "Hypothetical release clause"}</dt><dd data-field="hypothetical-clause">{money(view.simulation.releaseClauseEur)}</dd>
          <small>{pt ? "Cenário de 2 × o valor simulado. Não é uma cláusula comprovada." : "Scenario of 2 × the simulation value. Not a confirmed release clause."}</small></div>
      </dl>
    </details>
    <details className={styles.details}>
      <summary>{pt ? "Fonte e limites" : "Source and limitations"}</summary>
      <p>{pt ? "Avaliação em" : "Assessment on"} {pt ? "15/11/2026" : view.asOf}. {pt ? "Idade usada no cálculo é a do jogo, sem comprovação como idade real." : "The calculation uses game age, unconfirmed as real age."}</p>
      <p>{pt ? "Arquivo declarado FC27 pelo eafc-db-kit. Data efetiva e referência canônica do elenco indefinidas." : "File declared as FC27 by eafc-db-kit. Effective date and canonical squad reference remain undefined."}</p>
      <a href={`https://github.com/ViniMacacari/eafc-db-kit/tree/${view.contractReference.sourceCommit}`} target="_blank" rel="noopener noreferrer">{pt ? "Procedência do arquivo local" : "Local file provenance"}</a>
      <p className={styles.hash}>SHA-256: {view.contractReference.sourceFileSha256}</p>
      <p>{pt ? "Salário por comparáveis FutScout; valor por comparáveis de resultados do modelo B, originalmente treinado no contexto real. Todos os valores desta seção pertencem apenas à simulação." : "Wage from FutScout comparables; value from comparable outputs of model B, originally trained in the real-world context. Every amount in this section belongs only to simulation."}</p>
    </details>
  </section>
}
