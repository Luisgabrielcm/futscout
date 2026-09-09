import { t, type Locale } from "../../lib/i18n"
import { displayFoot } from "../../lib/i18n/presentation"

import type { Player } from "../../types/player"

type PlayerInfoProps = {
  locale?: Locale
  player: Player
}

export default function PlayerInfo({ locale = "pt",
  player,
}: PlayerInfoProps) {
  return (
    <section className="playerInfo">
      <div className="playerInfoHeader">
        <span>{t(locale, "PERFIL")}</span>
        <h2>{t(locale, "Informações do jogador")}</h2>
      </div>

      <div className="playerInfoGrid">
        <div className="playerInfoItem">
          <span>{t(locale, "NACIONALIDADE")}</span>

          <strong>
            {player.nationality}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>{t(locale, "LIGA")}</span>

          <strong>
            {player.league}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>{t(locale, "PÉ PREFERIDO")}</span>

          <strong>
            {player.preferredFoot ? displayFoot(player.preferredFoot, locale) : "—"}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>{t(locale, "ALTURA")}</span>

          <strong>
            {player.height} cm
          </strong>
        </div>
      </div>
    </section>
  )
}
