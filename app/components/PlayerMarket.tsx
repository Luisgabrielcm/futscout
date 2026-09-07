import type { Player } from "../../types/player"
import { formatCurrency } from "../../utils/formatCurrency"

type PlayerMarketProps = {
  player: Player
}

export default function PlayerMarket({
  player,
}: PlayerMarketProps) {
  const hasMarketValue =
    player.marketValue !== null

  return (
    <section className="playerMarket">
      <div className="marketHeader">
        <span>MERCADO</span>
        <h2>Valor de mercado</h2>
      </div>

      <div className="marketValueCard">
        <div>
          <span className="marketValueLabel">
            VALOR ESTIMADO
          </span>

          <strong className="playerMarketValue">
            {player.marketValue !== null
              ? formatCurrency(
                  player.marketValue
                )
              : "—"}
          </strong>

          {!hasMarketValue && (
            <span>
              Não informado
            </span>
          )}
        </div>

        {hasMarketValue && player.valueTrend !== null ? (
          <div
            className={`marketTrend ${player.valueTrend}`}
          >
            <span>TENDÊNCIA</span>

            <strong>
              {player.valueTrend === "up"
                ? "↑ Valorizando"
                : player.valueTrend === "down"
                  ? "↓ Desvalorizando"
                  : "→ Estável"}
            </strong>
          </div>
        ) : (
          <div className="marketTrend">
            <span>TENDÊNCIA</span>

            <strong>
              —
            </strong>
          </div>
        )}
      </div>
    </section>
  )
}
