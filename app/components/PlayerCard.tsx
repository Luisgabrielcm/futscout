import { t, type Locale } from "../../lib/i18n"
import EstimatedValueNote from './EstimatedValueNote'
import { displayPosition } from "../../lib/i18n/presentation"
import CountryFlag from "./CountryFlag"
import { displaySalary } from "../../lib/playerCareerPresentation"
import { visualText } from "../../lib/i18n/visualRevision"
import type { VerifiedSalary } from "../../types/playerCareer"
import { playerProfileHref } from "../../lib/connectedNavigation"
import { wagePresentation, type PublishedWage } from "../../lib/wagePublication"

import Link from "next/link"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"
import ClubBadge from "./ClubBadge"
import type { AssetReference } from "../../lib/assetPipeline"

type PlayerCardProps = {
  locale?: Locale
  id?: string
  wage?: PublishedWage
  name: string
  slug: string
  catalogContext?: string

  age: number | null

  position: string
  secondaryPosition?: string | null
  secondaryPositions?: string[]
  nationality?: string | null
  clubImageUrl?: string | null
  clubAsset?: AssetReference | null
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
  economicMarketValue?: { provider: string } | null

}

/* ========================================
   PLAYER CARD
======================================== */

export default function PlayerCard({ locale = "pt",
  id,
  wage,
  name,
  slug,
  catalogContext,

  age,

  position,
  secondaryPosition,
  secondaryPositions = [],
  nationality = null,
  clubImageUrl,
  clubAsset,
  salary,

  club,

  image,

  baseOverall,

  potential,

  marketValue,
  economicMarketValue,
}: PlayerCardProps) {
  const positions = [...new Set([position, ...secondaryPositions, ...(secondaryPosition ? [secondaryPosition] : [])])]
  const salaryLabel = displaySalary(salary, locale)
  const publishedWage = id ? wagePresentation(wage, id, locale) : null
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
      href={playerProfileHref(locale, slug, catalogContext)}
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
            {club && <ClubBadge locale={locale} asset={clubAsset} src={clubAsset ? null : clubImageUrl} name={club} size="small" className="cardClubBadge" />}
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
              {t(locale, "Valor de mercado")}</span>

            <strong
              className="marketValue"
            >
              {marketValue !==
              null
                ? formatCurrency(marketValue, locale)
                : "—"}
            </strong>
            <EstimatedValueNote provider={economicMarketValue?.provider} value={marketValue} locale={locale} />
          </div>

        </div>
        <p className="cardSalary"><span>{publishedWage?.title ?? visualText(locale, "salary")}</span> <strong>{publishedWage?.value ?? salaryLabel ?? "—"}</strong></p>
        {publishedWage && <p className="mutedText">{publishedWage.label}<br />{publishedWage.detail}</p>}
        {!publishedWage && salaryLabel && <p className="mutedText">{visualText(locale, "observedSalary")} · {visualText(locale, "salarySource")}: {salary?.source}</p>}
      </Link>
    </article>
  )
}
