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
import CountryFlag from "./CountryFlag"
import { getPlayerProfilePositions } from "../../lib/playerProfilePositions"

type PlayerHeaderProps = {
  player: Player
}

export default function PlayerHeader({
  player,
}: PlayerHeaderProps) {
  const positions = getPlayerProfilePositions(player)
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
          <div className="playerHeaderPositions" aria-label="Posições do jogador">
            {positions.map((position, index) => <span key={position}
              className={`playerHeaderPosition ${index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}`}
              title={index === 0 ? "Posição principal" : "Posição secundária"}>
              {position}
            </span>)}
          </div>

          <h1>
            {player.name}
          </h1>

          <div
            className="playerHeaderClub"
          >
            <PlayerImage
              key={clubImageUrl}
              src={clubImageUrl ?? undefined}
              alt={clubName}
              kind="club"
              className="playerHeaderClubBadge"
              fallbackClassName="playerHeaderClubBadge clubBadgeFallback"
            />

            <p>
              {clubName}
            </p>
            {player.league && <span className="playerHeaderLeague">{player.league}</span>}
          </div>

          <div
            className="playerHeaderMeta"
          >
            <CountryFlag country={player.nationality} />

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
            OVR EA
          </span>

          <strong
            className="playerHeaderStatMain"
          >
            {
              player.baseOverall
            }
          </strong>

          {player.dynamicOverall !== null && <small>OVR FutScout: {displayedDynamicOverall}</small>}
          {overallDifference !== null && overallDifference !== 0 && (
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

          {player.marketValue !== null && player.valueTrend !== null ? (
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
              {player.marketValue === null ? "Não informado" : "Tendência não disponível"}
            </small>
          )}
        </div>
      </div>
    </section>
  )
}
