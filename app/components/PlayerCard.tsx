import { t, type Locale } from "../../lib/i18n"
import EstimatedValueNote from './EstimatedValueNote'
import { displayPosition } from "../../lib/i18n/presentation"
import CountryFlag from "./CountryFlag"
import { displaySalary } from "../../lib/playerCareerPresentation"
import { visualText } from "../../lib/i18n/visualRevision"
import type { VerifiedSalary } from "../../types/playerCareer"
import { playerProfileHref } from "../../lib/connectedNavigation"
import { wagePresentation, type PublishedWage } from "../../lib/wagePublication"
import { zeroGameFreeAgentEconomics } from "../../lib/publicEconomicOverlay"

import Link from "next/link"

import {
  formatCurrency,
} from "../../utils/formatCurrency"

import PlayerImage from "./PlayerImage"
import PlayerActions from "./PlayerActions"
import ClubBadge from "./ClubBadge"
import type { AssetReference } from "../../lib/assetPipeline"

type PlayerCardProps = {
  transferContexts?: import("../../lib/jointTransferContexts").JointTransferViews
  clubContexts?: import("../../lib/clubContexts").ClubContexts
  transferContext?: "GAME" | "REAL"
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
  transferContexts, clubContexts, transferContext = "GAME",
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
  const zeroGameEconomics = zeroGameFreeAgentEconomics({ transferContexts, clubContexts }, transferContext)
  const salaryLabel = zeroGameEconomics ? null : displaySalary(salary, locale)
  const publishedWage = !zeroGameEconomics && id ? wagePresentation(wage, id, locale) : null
  /* ======================================
     DADOS OPCIONAIS
  ====================================== */

  const playerAge =
    age !== null
      ? t(locale, "ageYears", { age })
      : t(locale, "Idade não informada")

  const playerClub =
    (transferContext === "REAL" ? transferContexts?.real?.clubLabel : transferContexts?.game?.clubLabel) ??
    (zeroGameEconomics ? locale === "pt" ? "Agente livre" : "Free agent" : club) ??
    t(locale, "Sem clube")
  const loan = transferContext === "REAL" ? transferContexts?.real : transferContexts?.game

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
            {!zeroGameEconomics && club && <ClubBadge locale={locale} asset={clubAsset} src={clubAsset ? null : clubImageUrl} name={club} size="small" className="cardClubBadge" />}
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
          {loan?.displayContext === "FUTSCOUT_PROJECTED" && <p className="mutedText">{locale === "en" ? "Roster updated by FutScout · not an official EA update" : "Elenco atualizado pelo FutScout · não é atualização oficial da EA"}</p>}
          {transferContext === "GAME" && transferContexts?.projectedRealLoanRoute && <p className="mutedText">{locale === "en" ? "Documented real loan:" : "Empréstimo real documentado:"} {transferContexts.projectedRealLoanRoute.parentClub.name} → {transferContexts.projectedRealLoanRoute.playingClub.name}</p>}
          {loan?.loanBadge && <p className="playerLoanBadge" style={{ overflowWrap: "anywhere", maxWidth: "100%" }}>{locale === "en" ? "On loan from" : "Emprestado pelo"} {loan.parentClub!.name}
            {loan.loanStatus === "ACTIVE_IN_SNAPSHOT" && <small style={{ display: "block" }}>{locale === "en" ? "Consulted snapshot · roster date unconfirmed" : "Snapshot consultado · data do elenco não comprovada"}</small>}</p>}
          {!!loan?.nationalTeams.length && <p className="mutedText">{locale === "en" ? "National team in squad:" : "Seleção no squad:"} {loan.nationalTeams.map(t => t.name).join(", ")}</p>}
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
        <p className="cardSalary" data-game-economics={zeroGameEconomics ? "free-agent-zeroed" : undefined}><span>{publishedWage?.title ?? visualText(locale, "salary")}</span> <strong>{zeroGameEconomics ? formatCurrency(0, locale) : publishedWage?.value ?? salaryLabel ?? "—"}</strong></p>
        {publishedWage && <p className="mutedText">{publishedWage.label}<br />{publishedWage.detail}</p>}
        {!publishedWage && salaryLabel && <p className="mutedText">{visualText(locale, "observedSalary")} · {visualText(locale, "salarySource")}: {salary?.source}</p>}
      </Link>
    </article>
  )
}
