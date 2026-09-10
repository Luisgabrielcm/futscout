import { t, localizedHref, type Locale } from "../../lib/i18n"
import { displayForm } from "../../lib/i18n/presentation"

import Link from "next/link"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"

type PlayerCardProps = {
  locale?: Locale
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

export default function PlayerCard({ locale = "pt",
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
      ? t(locale, "Em alta")
      : valueTrend === "down"
        ? t(locale, "Em baixa")
        : t(locale, "Estável")

  /* ======================================
     DADOS OPCIONAIS
  ====================================== */

  const playerAge =
    age !== null
      ? t(locale, "ageYears", { age })
      : t(locale, "Idade não informada")

  const playerClub =
    club ??
    t(locale, "Sem clube")

  const playerPotential =
    potential !== null
      ? potential
      : "—"

  const playerForm =
    displayForm(form, locale) ??
    "—"

  /* ======================================
     RENDER
  ====================================== */

  return (
    <article className="playerCard">
      <PlayerActions locale={locale} slug={slug} name={name} />
      <Link
      href={localizedHref(locale, `/jogadores/${slug}`)}
      className="playerCardLink"
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
            <PlayerImage locale={locale}
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
              {t(locale, "Potencial")}</span>

            <strong>
              {
                playerPotential
              }
            </strong>
          </div>

          <div>
            <span>
              {t(locale, "Forma")}</span>

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
              {t(locale, "VALOR ESTIMADO")}</span>

            <strong
              className="marketValue"
            >
              {marketValue !==
              null
                ? formatCurrency(marketValue, locale)
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
              {t(locale, "TENDÊNCIA")}</span>

            <strong>
              {trendLabel}{" "}
              {trendSymbol}
            </strong>
          </div>}
        </div>
      </Link>
    </article>
  )
}
