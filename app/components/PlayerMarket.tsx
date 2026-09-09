import { t, type Locale } from "../../lib/i18n"

import type { Player } from "../../types/player"
import { formatCurrency } from "../../utils/formatCurrency"

type PlayerMarketProps = {
  locale?: Locale
  player: Player
}

export default function PlayerMarket({ locale = "pt",
  player,
}: PlayerMarketProps) {
  const hasMarketValue =
    player.marketValue !== null

  return (
    <section className="playerMarket">
      <div className="marketHeader">
        <span>{t(locale, "MERCADO")}</span>
        <h2>{t(locale, "Valor de mercado")}</h2>
      </div>

      <div className="marketValueCard">
        <div>
          <span className="marketValueLabel">
            {t(locale, "VALOR ESTIMADO")}</span>

          <strong className="playerMarketValue">
            {player.marketValue !== null
              ? formatCurrency(player.marketValue, locale)
              : "—"}
          </strong>

          {!hasMarketValue && (
            <span>
              {t(locale, "Não informado")}</span>
          )}
        </div>

        {hasMarketValue && player.valueTrend !== null ? (
          <div
            className={`marketTrend ${player.valueTrend}`}
          >
            <span>{t(locale, "TENDÊNCIA")}</span>

            <strong>
              {player.valueTrend === "up"
                ? t(locale, "↑ Valorizando")
                : player.valueTrend === "down"
                  ? t(locale, "↓ Desvalorizando")
                  : t(locale, "→ Estável")}
            </strong>
          </div>
        ) : (
          <div className="marketTrend">
            <span>{t(locale, "TENDÊNCIA")}</span>

            <strong>
              —
            </strong>
          </div>
        )}
      </div>
    </section>
  )
}
