import type { Player } from "../../types/player"

import {
    generateScoutAnalysis,
} from "../../utils/generateScoutAnalysis"

type ScoutAnalysisProps = {
  player: Player
}

export default function ScoutAnalysis({
  player,
}: ScoutAnalysisProps) {
  const analysis =
    generateScoutAnalysis(player)

  return (
    <section className="scoutAnalysis">
      <div className="scoutAnalysisHeader">
        <span>ANÁLISE POR ATRIBUTOS</span>

        <h2>Análise FutScout</h2>
        <p>Leitura heurística dos atributos disponíveis, não uma análise em tempo real.</p>
      </div>

      <div className="scoutAnalysisGrid">
        {/* PONTOS FORTES */}

        <div className="scoutAnalysisCard">
          <span className="scoutAnalysisLabel">
            PONTOS FORTES
          </span>

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
            PONTOS DE ATENÇÃO
          </span>

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
            IDEAL PARA
          </span>

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
