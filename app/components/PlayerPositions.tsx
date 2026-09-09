import { t, type Locale } from "../../lib/i18n"

import type { Player } from "../../types/player"

import {
    calculatePositionOverall,
    type CalculatedPosition,
} from "../../utils/calculatePositionOverall"

type PlayerPositionsProps = {
  locale?: Locale
  player: Player
}

export default function PlayerPositions({ locale = "pt",
  player,
}: PlayerPositionsProps) {
  /* ========================================
     POSIÇÕES DISPONÍVEIS
  ======================================== */

  const positionNames: CalculatedPosition[] = [
    "ATA",
    "PE",
    "MEI",
    "PD",
    "MC",
    "VOL",
    "LE",
    "ZAG",
    "LD",
  ]

  /* ========================================
     CALCULA NOTA DE CADA POSIÇÃO
  ======================================== */

  const positions = positionNames.map(
    (position) => ({
      key: position,
      label: position,

      score: calculatePositionOverall(
        player,
        position
      ),
    })
  )

  /* ========================================
     POSIÇÃO PRINCIPAL
  ======================================== */

  const primaryPositionData =
    positions.find(
      (item) =>
        item.key === player.position
    )

  /* ========================================
     POSIÇÕES RELACIONADAS
  ======================================== */

  const relatedPositions: Partial<
    Record<
      CalculatedPosition,
      CalculatedPosition[]
    >
  > = {
    MC: ["MEI", "VOL"],

    MEI: [
      "MC",
      "PE",
      "PD",
    ],

    VOL: [
      "MC",
      "ZAG",
    ],

    PE: [
      "PD",
      "ATA",
    ],

    PD: [
      "PE",
      "ATA",
    ],

    ATA: [
      "PE",
      "PD",
    ],

    LE: [
      "LD",
      "VOL",
    ],

    LD: [
      "LE",
      "VOL",
    ],

    ZAG: [
      "VOL",
    ],
  }

  /* ========================================
     AJUSTE DE PROXIMIDADE POSICIONAL
  ======================================== */

  const adjustedPositions =
    positions.map((position) => {
      if (!primaryPositionData) {
        return position
      }

      /* NÃO ALTERA A POSIÇÃO PRINCIPAL */

      if (
        position.key === player.position
      ) {
        return position
      }

      const related =
        relatedPositions[
          player.position as CalculatedPosition
        ] ?? []

      const isRelated =
        related.includes(
          position.key
        )

      /*
        Regra FutScout:

        Se uma posição relacionada tiver
        uma nota maior que a posição principal,
        sua vantagem máxima será de +1.

        Exemplo:

        MC principal = 88
        MEI calculado = 90

        Resultado:
        MC = 88
        MEI = 89
      */

      if (
        isRelated &&
        position.score >= 80 &&
        position.score >
          primaryPositionData.score + 1
      ) {
        return {
          ...position,

          score:
            primaryPositionData.score + 1,
        }
      }

      return position
    })

  /* ========================================
     ORDENA MELHORES POSIÇÕES
  ======================================== */

  const bestPositions = [
    ...adjustedPositions,
  ]
    .sort((a, b) => {
      /* POSIÇÃO PRINCIPAL SEMPRE PRIMEIRO */

      if (
        a.key === player.position
      ) {
        return -1
      }

      if (
        b.key === player.position
      ) {
        return 1
      }

      /* POSIÇÃO SECUNDÁRIA VEM DEPOIS */

      if (
        a.key ===
        player.secondaryPosition
      ) {
        return -1
      }

      if (
        b.key ===
        player.secondaryPosition
      ) {
        return 1
      }

      /* DEMAIS POSIÇÕES POR NOTA */

      return b.score - a.score
    })
    .slice(0, 6)

  /* ========================================
     BUSCA POSIÇÃO
  ======================================== */

  function getPosition(
    position: CalculatedPosition
  ) {
    return adjustedPositions.find(
      (item) =>
        item.key === position
    )!
  }

  /* ========================================
     COR DA NOTA
  ======================================== */

  function getPositionClass(
    score: number
  ) {
    if (score >= 85) {
      return "positionHigh"
    }

    if (score >= 75) {
      return "positionMedium"
    }

    return "positionLow"
  }

  /* ========================================
     TIPO DA POSIÇÃO
  ======================================== */

  function getPositionType(
    position: CalculatedPosition
  ) {
    if (
      position === player.position
    ) {
      return "primary"
    }

    if (
      position ===
      player.secondaryPosition
    ) {
      return "secondary"
    }

    return "alternative"
  }

  return (
    <section className="playerPositions">
      {/* CABEÇALHO */}

      <div className="playerPositionsHeader">
        <span>{t(locale, "POSIÇÕES")}</span>

        <h2>
          {t(locale, "Mapa de posições")}</h2>
        <p>{t(locale, "Adequação estimada pelo FutScout — não são OVRs oficiais da EA.")}</p>
      </div>

      <div className="playerPositionsLayout">
        {/* ===================================
            CAMPO
        ==================================== */}

        <div className="positionPitch">
          <div className="pitchCenterLine" />

          <div className="pitchCircle" />

          {/* ATA */}

          <div
            className={`
              pitchPosition
              pitchAta
              ${getPositionClass(
                getPosition("ATA").score
              )}
              ${
                getPositionType("ATA") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>ATA</span>

            <strong>
              {
                getPosition("ATA")
                  .score
              }
            </strong>
          </div>

          {/* PE */}

          <div
            className={`
              pitchPosition
              pitchPe
              ${getPositionClass(
                getPosition("PE").score
              )}
              ${
                getPositionType("PE") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>PE</span>

            <strong>
              {
                getPosition("PE")
                  .score
              }
            </strong>
          </div>

          {/* MEI */}

          <div
            className={`
              pitchPosition
              pitchMei
              ${getPositionClass(
                getPosition("MEI").score
              )}
              ${
                getPositionType("MEI") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>MEI</span>

            <strong>
              {
                getPosition("MEI")
                  .score
              }
            </strong>
          </div>

          {/* PD */}

          <div
            className={`
              pitchPosition
              pitchPd
              ${getPositionClass(
                getPosition("PD").score
              )}
              ${
                getPositionType("PD") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>PD</span>

            <strong>
              {
                getPosition("PD")
                  .score
              }
            </strong>
          </div>

          {/* MC */}

          <div
            className={`
              pitchPosition
              pitchMc
              ${getPositionClass(
                getPosition("MC").score
              )}
              ${
                getPositionType("MC") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>MC</span>

            <strong>
              {
                getPosition("MC")
                  .score
              }
            </strong>
          </div>

          {/* VOL */}

          <div
            className={`
              pitchPosition
              pitchVol
              ${getPositionClass(
                getPosition("VOL").score
              )}
              ${
                getPositionType("VOL") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>VOL</span>

            <strong>
              {
                getPosition("VOL")
                  .score
              }
            </strong>
          </div>

          {/* LE */}

          <div
            className={`
              pitchPosition
              pitchLe
              ${getPositionClass(
                getPosition("LE").score
              )}
              ${
                getPositionType("LE") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>LE</span>

            <strong>
              {
                getPosition("LE")
                  .score
              }
            </strong>
          </div>

          {/* ZAG */}

          <div
            className={`
              pitchPosition
              pitchZag
              ${getPositionClass(
                getPosition("ZAG").score
              )}
              ${
                getPositionType("ZAG") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>ZAG</span>

            <strong>
              {
                getPosition("ZAG")
                  .score
              }
            </strong>
          </div>

          {/* LD */}

          <div
            className={`
              pitchPosition
              pitchLd
              ${getPositionClass(
                getPosition("LD").score
              )}
              ${
                getPositionType("LD") ===
                "primary"
                  ? "primaryPitchPosition"
                  : ""
              }
            `}
          >
            <span>LD</span>

            <strong>
              {
                getPosition("LD")
                  .score
              }
            </strong>
          </div>
        </div>

        {/* ===================================
            POSIÇÕES E ADEQUAÇÃO
        ==================================== */}

        <div className="bestPositions">
          <div className="bestPositionsHeader">
            <span>
              {t(locale, "POSIÇÕES E ADEQUAÇÃO")}</span>

            <strong>
              {player.position}
            </strong>
          </div>

          <div className="bestPositionsList">
            {bestPositions.map(
              (
                position,
                index
              ) => {
                const positionType =
                  getPositionType(
                    position.key
                  )

                return (
                  <div
                    key={
                      position.key
                    }
                    className={`
                      bestPositionItem
                      ${
                        positionType ===
                        "primary"
                          ? "primaryPosition"
                          : ""
                      }
                    `}
                  >
                    {/* RANK */}

                    <span className="bestPositionRank">
                      {index + 1}
                    </span>

                    {/* POSIÇÃO */}

                    <div className="bestPositionInfo">
                      <span className="bestPositionName">
                        {
                          position.label
                        }
                      </span>

                      {/* PRINCIPAL */}

                      {positionType ===
                        "primary" && (
                        <small className="positionTypeLabel primary">
                          {t(locale, "Principal")}</small>
                      )}

                      {/* SECUNDÁRIA */}

                      {positionType ===
                        "secondary" && (
                        <small className="positionTypeLabel secondary">
                          {t(locale, "Secundária")}</small>
                      )}
                    </div>

                    {/* NOTA */}

                    <strong
                      className={getPositionClass(
                        position.score
                      )}
                    >
                      {
                        position.score
                      }
                    </strong>
                  </div>
                )
              }
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
