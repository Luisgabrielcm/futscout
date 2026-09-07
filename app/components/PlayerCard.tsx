import Link from "next/link"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import PlayerImage from "./PlayerImage"

type PlayerCardProps = {
  name: string
  slug: string

  age: number | null

  position: string

  club: string | null

  image?: string

  baseOverall: number

  dynamicOverall:
    | number
    | null

  potential:
    | number
    | null

  form:
    | string
    | null

  marketValue:
    | number
    | null

  valueTrend:
    | "up"
    | "down"
    | "stable"
    | null
}

/* ========================================
   PLAYER CARD
======================================== */

export default function PlayerCard({
  name,
  slug,

  age,

  position,

  club,

  image,

  baseOverall,

  dynamicOverall,

  potential,

  form,

  marketValue,

  valueTrend,
}: PlayerCardProps) {
  /* ======================================
     OVR DINÂMICO
  ====================================== */

  const displayedDynamicOverall =
    dynamicOverall ??
    baseOverall

  const overallDifference =
    dynamicOverall !== null
      ? dynamicOverall -
        baseOverall
      : null

  /* ======================================
     TENDÊNCIA
  ====================================== */

  const trendSymbol =
    valueTrend === "up"
      ? "↑"
      : valueTrend === "down"
        ? "↓"
        : "→"

  const trendLabel =
    valueTrend === "up"
      ? "Em alta"
      : valueTrend === "down"
        ? "Em baixa"
        : "Estável"

  /* ======================================
     DADOS OPCIONAIS
  ====================================== */

  const playerAge =
    age !== null
      ? `${age} anos`
      : "Idade não informada"

  const playerClub =
    club ??
    "Sem clube"

  const playerPotential =
    potential !== null
      ? potential
      : "—"

  const playerForm =
    form ??
    "—"

  /* ======================================
     RENDER
  ====================================== */

  return (
    <Link
      href={`/jogadores/${slug}`}
      className="playerCardLink"
    >
      <article
        className="playerCard"
      >
        {/* ==================================
            TOPO
        ================================== */}

        <div
          className="playerCardTop"
        >
          <span
            className="playerPosition"
          >
            {position}
          </span>

        </div>

        {/* ==================================
            FOTO
        ================================== */}

        <div
          className="playerPhotoArea"
        >
          <div
            className="playerPhotoGlow"
          >
            <PlayerImage
              src={image}
              alt={name}
              className="playerPhoto"
              fallbackClassName="playerFallback"
            />
          </div>
        </div>

        {/* ==================================
            IDENTIDADE
        ================================== */}

        <div
          className="playerIdentity"
        >
          <h3>
            {name}
          </h3>

          <p>
            {playerClub} •{" "}
            {playerAge}
          </p>
        </div>

        {/* ==================================
            OVERALL
        ================================== */}

        <div
          className="overallArea"
        >
          <div>
            <span
              className="smallLabel"
            >
              OVR EA
            </span>

            <strong>
              {baseOverall}
            </strong>
          </div>

          {dynamicOverall !== null && <>
          <span
            className="overallArrow"
          >
            →
          </span>

          <div>
            <span
              className="smallLabel"
            >
              OVR FUTSCOUT
            </span>

            <strong
              className="dynamicOverall"
            >
              {
                displayedDynamicOverall
              }
            </strong>

            {overallDifference !==
              null &&
              overallDifference !==
                0 && (
              <span
                className={
                  overallDifference >
                  0
                    ? "overallChange positive"
                    : "overallChange negative"
                }
              >
                {overallDifference >
                0
                  ? "+"
                  : ""}

                {
                  overallDifference
                }
              </span>
            )}
          </div>
          </>}
        </div>

        {/* ==================================
            DETALHES
        ================================== */}

        <div
          className="playerDetails"
        >
          <div>
            <span>
              Potencial
            </span>

            <strong>
              {
                playerPotential
              }
            </strong>
          </div>

          <div>
            <span>
              Forma
            </span>

            <strong>
              {playerForm}
            </strong>
          </div>
        </div>

        {/* ==================================
            MERCADO
        ================================== */}

        <div
          className="marketArea"
        >
          <div>
            <span
              className="marketLabel"
            >
              VALOR ESTIMADO
            </span>

            <strong
              className="marketValue"
            >
              {marketValue !==
              null
                ? formatCurrency(
                    marketValue
                  )
                : "—"}
            </strong>
          </div>

          {valueTrend !== null && marketValue !== null && <div
            className={
              valueTrend ===
              "up"
                ? "trendBox up"
                : valueTrend ===
                    "down"
                  ? "trendBox down"
                  : "trendBox stable"
            }
          >
            <span
              className="trendTitle"
            >
              TENDÊNCIA
            </span>

            <strong>
              {trendLabel}{" "}
              {trendSymbol}
            </strong>
          </div>}
        </div>
      </article>
    </Link>
  )
}
