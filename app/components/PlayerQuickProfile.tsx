import { t, type Locale } from "../../lib/i18n"
import { displayFoot } from "../../lib/i18n/presentation"

import type {
  Player,
} from "../../types/player"

type PlayerQuickProfileProps = {
  locale?: Locale
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

export default function PlayerQuickProfile({ locale = "pt",
  player,
}: PlayerQuickProfileProps) {
  const nationality =
    player.nationality ??
    t(locale, "Não informada")

  const league =
    player.league ??
    t(locale, "Sem liga")

  const height =
    player.height !== null
      ? `${player.height} cm`
      : t(locale, "Não informada")

  const preferredFoot =
    (player.preferredFoot ? displayFoot(player.preferredFoot, locale) : null) ??
    t(locale, "Não informado")

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
          {t(locale, "PERFIL")}</span>

        <h2>
          {t(locale, "Resumo rápido")}</h2>
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
            {t(locale, "NACIONALIDADE")}</span>

          <strong>
            {nationality}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            {t(locale, "LIGA")}</span>

          <strong>
            {league}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            {t(locale, "ALTURA")}</span>

          <strong>
            {height}
          </strong>
        </div>

        <div
          className="quickProfileItem"
        >
          <span>
            {t(locale, "PÉ PREFERIDO")}</span>

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
            {t(locale, "PERNA RUIM")}</span>

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
