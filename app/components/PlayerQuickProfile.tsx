import type {
  Player,
} from "../../types/player"

type PlayerQuickProfileProps = {
  player: Player
}

/* ========================================
   ESTRELAS
======================================== */

function renderStars(
  value: number | null
) {
  if (value === null) {
    return "—"
  }

  const safeValue =
    Math.max(
      0,
      Math.min(
        value,
        5
      )
    )

  return `${"★".repeat(
    safeValue
  )}${"☆".repeat(
    5 - safeValue
  )}`
}

/* ========================================
   QUICK PROFILE
======================================== */

export default function PlayerQuickProfile({
  player,
}: PlayerQuickProfileProps) {
  const nationality =
    player.nationality ??
    "Não informada"

  const league =
    player.league ??
    "Sem liga"

  const height =
    player.height !== null
      ? `${player.height} cm`
      : "Não informada"

  const preferredFoot =
    player.preferredFoot ??
    "Não informado"

  const skillMoves =
    renderStars(
      player.skillMoves
    )

  const weakFootAbility =
    renderStars(
      player.weakFootAbility
    )

  return (
    <section
      className="playerQuickProfile"
    >
      <div
        className="quickProfileHeader"
      >
        <span>
          PERFIL
        </span>

        <h2>
          Resumo rápido
        </h2>
      </div>

      <div
        className="quickProfileGrid"
      >
        {/* ==================================
            PRIMEIRA LINHA
        ================================== */}

        <div
          className="quickProfileItem"
        >
          <span>
            NACIONALIDADE
          </span>

          <strong>
            {nationality}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            LIGA
          </span>

          <strong>
            {league}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            ALTURA
          </span>

          <strong>
            {height}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            PÉ PREFERIDO
          </span>

          <strong>
            {preferredFoot}
          </strong>
        </div>

        {/* ==================================
            SEGUNDA LINHA
        ================================== */}

        <div
          className="quickProfileItem"
        >
          <span>
            SKILL MOVES
          </span>

          <strong
            className="quickProfileStars"
          >
            {skillMoves}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            PERNA RUIM
          </span>

          <strong
            className="quickProfileStars"
          >
            {weakFootAbility}
          </strong>
        </div>
      </div>
    </section>
  )
}
