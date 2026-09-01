import type { Player } from "../../types/player"
import { getOverallDifference } from "../../utils/getOverallDifference"

type PlayerOverviewProps = {
  player: Player
}

export default function PlayerOverview({
  player,
}: PlayerOverviewProps) {
  const overallDifference =
    player.dynamicOverall !== null
      ? getOverallDifference(
          player.baseOverall,
          player.dynamicOverall
        )
      : null

  return (
    <section className="playerOverview">
      <div className="overviewHeader">
        <span>VISÃO GERAL</span>
        <h2>Resumo do jogador</h2>
      </div>

      <div className="overviewGrid">
        <div className="overviewCard">
          <span>OVR BASE</span>

          <strong>
            {player.baseOverall}
          </strong>
        </div>

        <div className="overviewCard">
          <span>OVR ATUAL</span>

          <strong className="overviewCurrent">
            {player.dynamicOverall !== null
              ? player.dynamicOverall
              : "—"}
          </strong>

          {overallDifference !== null && (
            <small>
              {overallDifference >= 0
                ? "+"
                : ""}
              {overallDifference}
            </small>
          )}
        </div>

        <div className="overviewCard">
          <span>POTENCIAL</span>

          <strong>
            {player.potential ??
              "—"}
          </strong>
        </div>

        <div className="overviewCard">
          <span>FORMA</span>

          <strong className="overviewForm">
            {player.form ??
              "Não informada"}
          </strong>
        </div>
      </div>
    </section>
  )
}