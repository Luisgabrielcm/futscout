import { t, type Locale } from "../../lib/i18n"
import { displayForm } from "../../lib/i18n/presentation"

import type { Player } from "../../types/player"
import { getOverallDifference } from "../../utils/getOverallDifference"

type PlayerOverviewProps = {
  locale?: Locale
  player: Player
}

export default function PlayerOverview({ locale = "pt",
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
        <span>{t(locale, "VISÃO GERAL")}</span>
        <h2>{t(locale, "Resumo do jogador")}</h2>
      </div>

      <div className="overviewGrid">
        <div className="overviewCard">
          <span>{t(locale, "OVR BASE")}</span>

          <strong>
            {player.baseOverall}
          </strong>
        </div>

        <div className="overviewCard">
          <span>{t(locale, "OVR ATUAL")}</span>

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
          <span>{t(locale, "POTENCIAL")}</span>

          <strong>
            {player.potential ??
              "—"}
          </strong>
        </div>

        <div className="overviewCard">
          <span>{t(locale, "FORMA")}</span>

          <strong className="overviewForm">
            {displayForm(player.form, locale) ??
              t(locale, "Não informada")}
          </strong>
        </div>
      </div>
    </section>
  )
}
