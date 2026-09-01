import type { Player } from "../../types/player"

type PlayerInfoProps = {
  player: Player
}

export default function PlayerInfo({
  player,
}: PlayerInfoProps) {
  return (
    <section className="playerInfo">
      <div className="playerInfoHeader">
        <span>PERFIL</span>
        <h2>Informações do jogador</h2>
      </div>

      <div className="playerInfoGrid">
        <div className="playerInfoItem">
          <span>NACIONALIDADE</span>

          <strong>
            {player.nationality}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>LIGA</span>

          <strong>
            {player.league}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>PÉ PREFERIDO</span>

          <strong>
            {player.preferredFoot}
          </strong>
        </div>

        <div className="playerInfoItem">
          <span>ALTURA</span>

          <strong>
            {player.height} cm
          </strong>
        </div>
      </div>
    </section>
  )
}