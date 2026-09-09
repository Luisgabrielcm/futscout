import { t, type Locale } from "../../lib/i18n"

import type {
  Player,
} from "../../types/player"
import { getPlayStyleVisual } from "../../lib/playStyleAssets"
import PlayerImage from "./PlayerImage"

type PlayerPlayStylesProps = {
  locale?: Locale
  player: Player
}

export default function PlayerPlayStyles({ locale = "pt",
  player,
}: PlayerPlayStylesProps) {
  return (
    <section
      className="playerPlayStyles"
    >
      <div
        className="playerPlayStylesHeader"
      >
        <span>
          EA SPORTS FC
        </span>

        <h2>
          PlayStyles
        </h2>

        <p>
          {t(locale, "Características especiais do jogador dentro do jogo.")}</p>
      </div>

      {player.playStyles.length > 0 ? (
        <div
          className="playerPlayStylesGrid"
        >
          {player.playStyles.map(
            (playStyle) => {
              const { playStyleKey, displayName, isPlus, iconSrc } = getPlayStyleVisual(playStyle)

              return (
                <div
                  key={
                    playStyle.id
                  }
                  className={`playStyleCard ${
                    isPlus
                      ? "playStylePlus"
                      : ""
                  }`}
                  data-playstyle={playStyleKey}
                >
                  <div
                    className="playStyleIcon"
                    title={iconSrc ? displayName : t(locale, "Arte do PlayStyle indisponível")}
                  >
                    {iconSrc ? <PlayerImage locale={locale} src={iconSrc} alt={displayName} kind="asset" fallbackText="PS" />
                      : <span className="playStyleArtUnavailable" role="img" aria-label={t(locale, "Arte do PlayStyle indisponível")} />}
                  </div>

                  <div
                    className="playStyleContent"
                  >
                    <div
                      className="playStyleTitle"
                    >
                      <strong>
                        {
                          displayName
                        }
                      </strong>

                      {isPlus && (
                        <span>
                          PlayStyle+
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            }
          )}
        </div>
      ) : (
        <div
          className="playStylesEmpty"
        >
          <span>
            PLAYSTYLES
          </span>

          <p>
            {t(locale, "Este jogador não possui PlayStyles cadastrados.")}</p>
        </div>
      )}
    </section>
  )
}
