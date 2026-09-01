import type {
  Player,
} from "../../types/player"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import {
  getOverallDifference,
} from "../../utils/getOverallDifference"

import PlayerImage from "./PlayerImage"

type PlayerHeaderProps = {
  player: Player
}

export default function PlayerHeader({
  player,
}: PlayerHeaderProps) {
  /* ========================================
     OVR ATUAL
  ======================================== */

  const displayedDynamicOverall =
    player.dynamicOverall ??
    player.baseOverall

  const overallDifference =
    player.dynamicOverall !== null
      ? getOverallDifference(
          player.baseOverall,
          player.dynamicOverall
        )
      : null

  /* ========================================
     DADOS OPCIONAIS
  ======================================== */

  const nationality =
    player.nationality ??
    "Não informada"

  const age =
    player.age !== null
      ? `${player.age} anos`
      : "Idade não informada"

  const height =
    player.height !== null
      ? `${player.height} cm`
      : "Altura não informada"

  const preferredFoot =
    player.preferredFoot
      ? `Pé ${player.preferredFoot.toLowerCase()}`
      : "Pé não informado"

  const clubName =
    player.club?.name ??
    "Sem clube"

  const clubImageUrl =
    player.club?.imageUrl ??
    null

  /* ========================================
     RENDER
  ======================================== */

  return (
    <section
      className="playerHeader"
    >
      {/* ====================================
          IDENTIDADE
      ==================================== */}

      <div
        className="playerHeaderIdentity"
      >
        <div
          className="playerHeaderPhoto"
        >
          <PlayerImage
            src={player.image}
            alt={player.name}
          />
        </div>

        <div
          className="playerHeaderInfo"
        >
          <span
            className="playerHeaderPosition"
          >
            {
              player.position
            }
          </span>

          <h1>
            {player.name}
          </h1>

          <div
            className="playerHeaderClub"
          >
            {clubImageUrl && (
              <img
                src={clubImageUrl}
                alt={`Escudo do ${clubName}`}
                className="playerHeaderClubBadge"
              />
            )}

            <p>
              {clubName}
            </p>
          </div>

          <div
            className="playerHeaderMeta"
          >
            <span>
              {nationality}
            </span>

            <span>
              •
            </span>

            <span>
              {age}
            </span>

            <span>
              •
            </span>

            <span>
              {height}
            </span>

            <span>
              •
            </span>

            <span>
              {
                preferredFoot
              }
            </span>
          </div>
        </div>
      </div>

      {/* ====================================
          RESUMO NUMÉRICO
      ==================================== */}

      <div
        className="playerHeaderStats"
      >
        {/* ==================================
            OVR
        ================================== */}

        <div
          className="playerHeaderStat"
        >
          <span>
            OVR ATUAL
          </span>

          <strong
            className="playerHeaderStatMain"
          >
            {
              displayedDynamicOverall
            }
          </strong>

          {overallDifference !== null && (
            <small
              className={
                overallDifference >
                0
                  ? "positive"
                  : overallDifference <
                      0
                    ? "negative"
                    : "stable"
              }
            >
              {overallDifference >
              0
                ? "+"
                : ""}

              {
                overallDifference
              }
            </small>
          )}
        </div>

        {/* ==================================
            POTENCIAL
        ================================== */}

        <div
          className="playerHeaderStat"
        >
          <span>
            POTENCIAL
          </span>

          <strong>
            {player.potential !==
            null
              ? player.potential
              : "—"}
          </strong>

          <small>
            {player.potential !==
            null
              ? "Potencial máximo"
              : "Não informado"}
          </small>
        </div>

        {/* ==================================
            MERCADO
        ================================== */}

        <div
          className="playerHeaderStat"
        >
          <span>
            VALOR DE MERCADO
          </span>

          <strong
            className="playerHeaderMarketValue"
          >
            {player.marketValue !==
            null
              ? formatCurrency(
                  player.marketValue
                )
              : "—"}
          </strong>

          {player.marketValue !==
          null ? (
            <small
              className={`headerMarketTrend ${player.valueTrend}`}
            >
              {player.valueTrend ===
              "up"
                ? "↑ Valorizando"
                : player.valueTrend ===
                    "down"
                  ? "↓ Desvalorizando"
                  : "→ Estável"}
            </small>
          ) : (
            <small>
              Não informado
            </small>
          )}
        </div>
      </div>
    </section>
  )
}