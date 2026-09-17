import { t, localizedHref, type Locale } from "../../lib/i18n"
import { displayPosition } from "../../lib/i18n/presentation"
import CountryFlag from "./CountryFlag"
import { displaySalary } from "../../lib/playerCareerPresentation"
import { visualText } from "../../lib/i18n/visualRevision"
import type { VerifiedSalary } from "../../types/playerCareer"

import Link from "next/link"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"
import ClubBadge from "./ClubBadge"

type PlayerCardProps = {
  locale?: Locale
  name: string
  slug: string

  age: number | null

  position: string
  secondaryPosition?: string | null
  secondaryPositions?: string[]
  nationality?: string | null
  clubImageUrl?: string | null
  salary?: VerifiedSalary | null

  club: string | null

  image?: string

  baseOverall: number

  potential:
    | number
    | null

  marketValue:
    | number
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
  secondaryPosition,
  secondaryPositions = [],
  nationality = null,
  clubImageUrl,
  salary,

  club,

  image,

  baseOverall,

  potential,

  marketValue,
}: PlayerCardProps) {
  const positions = [...new Set([position, ...secondaryPositions, ...(secondaryPosition ? [secondaryPosition] : [])])]
  const salaryLabel = displaySalary(salary, locale)
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
          <div className="cardPositions" aria-label={t(locale, "Posições do jogador")}>
            {positions.map((value, index) => <span key={value}
              className={`playerPosition ${index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}`}
              title={t(locale, index === 0 ? "Posição principal" : "Posição secundária")}>
              {displayPosition(value, locale)}
            </span>)}
          </div>

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

          <p className="cardClub">
            {club && <ClubBadge locale={locale} src={clubImageUrl} name={club} size="small" className="cardClubBadge" />}
            <span>{playerClub}</span> •{" "}
            {playerAge}
          </p>
          <div className="cardNationality"><span className="smallLabel">{visualText(locale, "nationality")}</span>
            <CountryFlag locale={locale} country={nationality} /></div>
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

        </div>
        <p className="cardSalary"><span>{visualText(locale, "salary")}</span> <strong>{salaryLabel ?? "—"}</strong></p>
      </Link>
    </article>
  )
}
