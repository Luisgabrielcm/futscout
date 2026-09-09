import { t, type Locale } from "../../lib/i18n"

import type { Player } from "../../types/player"

import {
    generateScoutAnalysis,
} from "../../utils/generateScoutAnalysis"

type ScoutAnalysisProps = {
  locale?: Locale
  player: Player
}

export default function ScoutAnalysis({ locale = "pt",
  player,
}: ScoutAnalysisProps) {
  const analysis =
    generateScoutAnalysis(player, locale)

  return (
    <section className="scoutAnalysis">
      <div className="scoutAnalysisHeader">
        <span>{t(locale, "ANÁLISE POR ATRIBUTOS")}</span>

        <h2>{t(locale, "Análise FutScout")}</h2>
        <p>{t(locale, "Leitura heurística dos atributos disponíveis, não uma análise em tempo real.")}</p>
      </div>

      <div className="scoutAnalysisGrid">
        {/* PONTOS FORTES */}

        <div className="scoutAnalysisCard">
          <span className="scoutAnalysisLabel">
            {t(locale, "PONTOS FORTES")}</span>

          <div className="scoutAnalysisList strengths">
            {analysis.strengths.map(
              (item) => (
                <div key={item}>
                  <span>✓</span>
                  <p>{item}</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* PONTOS DE ATENÇÃO */}

        <div className="scoutAnalysisCard">
          <span className="scoutAnalysisLabel">
            {t(locale, "PONTOS DE ATENÇÃO")}</span>

          <div className="scoutAnalysisList weaknesses">
            {analysis.weaknesses.map(
              (item) => (
                <div key={item}>
                  <span>•</span>
                  <p>{item}</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* FUNÇÕES IDEAIS */}

        <div className="scoutAnalysisCard">
          <span className="scoutAnalysisLabel">
            {t(locale, "IDEAL PARA")}</span>

          <div className="scoutRoles">
            {analysis.roles.map(
              (role) => (
                <span key={role}>
                  {role}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
