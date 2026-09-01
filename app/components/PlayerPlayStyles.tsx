import type {
  Player,
} from "../../types/player"

type PlayerPlayStylesProps = {
  player: Player
}

export default function PlayerPlayStyles({
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
          Características especiais do jogador
          dentro do jogo.
        </p>
      </div>

      {player.playStyles.length > 0 ? (
        <div
          className="playerPlayStylesGrid"
        >
          {player.playStyles.map(
            (playStyle) => {
              const isPlus =
                playStyle.level ===
                "plus"

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
                >
                  <div
                    className="playStyleIcon"
                  >
                    {isPlus
                      ? "★"
                      : "◆"}
                  </div>

                  <div
                    className="playStyleContent"
                  >
                    <div
                      className="playStyleTitle"
                    >
                      <strong>
                        {
                          playStyle.name
                        }
                      </strong>

                      {isPlus && (
                        <span>
                          +
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
            Este jogador não possui
            PlayStyles cadastrados.
          </p>
        </div>
      )}
    </section>
  )
}