import { t, type Locale } from "../../lib/i18n"
import EstimatedValueNote from './EstimatedValueNote'
import { displayFoot, displayPosition } from "../../lib/i18n/presentation"

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
import PlayerClubContexts from "./PlayerClubContexts"
import { getPlayerProfilePositions } from "../../lib/playerProfilePositions"
import Link from "next/link"
import { entityHref, nationalityHref, relatedPlayersHref } from "../../lib/connectedNavigation"
import { clubText } from "../../lib/i18n/clubExperience"
import ClubBadge from "./ClubBadge"
import LeagueLogo from "./LeagueLogo"
import { visualText } from "../../lib/i18n/visualRevision"
import { wagePresentation, type PublishedWage } from "../../lib/wagePublication"
import { publicClause, publicContractUntil, type PublicEconomicOverlay } from "../../lib/publicEconomicOverlay"

type PlayerHeaderProps = {
  locale?: Locale
  player: Player
  valueContext?: "market" | "career-mode"
  wage?: PublishedWage
  fixedSalary?: { title: string; value: string; detail: string; sourceUrl: string }
  economicOverlay?: PublicEconomicOverlay
}

export default function PlayerHeader({ locale = "pt",
  player,
  wage,
  fixedSalary,
  economicOverlay,
}: PlayerHeaderProps) {
  const publishedWage = wagePresentation(wage, player.id, locale)
  const positions = getPlayerProfilePositions(player)
  const clubHref = entityHref(locale, "clubes", player.club?.slug)
  const leagueHref = entityHref(locale, "ligas", player.leagueSlug)
  const countryHref = nationalityHref(locale, player.nationality)
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
      ? t(locale, "ageYears", { age: player.age })
      : t(locale, "Idade não informada")

  const height =
    player.height !== null
      ? `${player.height} cm`
      : t(locale, "Altura não informada")

  const preferredFoot =
    player.preferredFoot
      ? t(locale, "footLabel", { foot: displayFoot(player.preferredFoot, locale) })
      : t(locale, "Pé não informado")

  const clubName =
    player.club?.name ??
    t(locale, "Sem clube")

  const clubIdentity = <><ClubBadge locale={locale} asset={player.club?.asset} name={clubName} className="playerHeaderClubBadge" /><span>{clubName}</span></>

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
          <PlayerImage locale={locale}
            src={player.image}
            alt={player.name}
          />
        </div>

        <div
          className="playerHeaderInfo"
        >
          <div className="playerHeaderPositions" aria-label={t(locale, "Posições do jogador")}>
            {positions.map((position, index) => <Link key={position} href={relatedPlayersHref(locale, { position })}
              className={`playerHeaderPosition ${index === 0 ? "playerPositionPrimary" : "playerPositionSecondary"}`}
              title={index === 0 ? t(locale, "Posição principal") : t(locale, "Posição secundária")}>
              {displayPosition(position, locale)}
            </Link>)}
          </div>

          <h1>
            {player.name}
          </h1>

          {player.clubContexts ? <PlayerClubContexts contexts={player.clubContexts} locale={locale} /> : <div
            className="playerHeaderClub"
          >
            <span className="catalogContextLabel">EA FC</span>
            {clubHref ? <Link href={clubHref} className="playerClubLink">{clubIdentity}</Link> : <div className="playerClubLink">{clubIdentity}</div>}
            {player.league && (leagueHref ? <Link className="playerHeaderLeague" href={leagueHref}><LeagueLogo locale={locale} name={player.league} asset={player.leagueAsset} size="small" />{player.league}</Link> : <span className="playerHeaderLeague"><LeagueLogo locale={locale} name={player.league} asset={player.leagueAsset} size="small" />{player.league}</span>)}
          </div>

          }

          <div
            className="playerHeaderMeta"
          >
            <span className="catalogContextLabel">{visualText(locale, "nationality")}</span>
            {countryHref ? <Link href={countryHref}><CountryFlag locale={locale} country={player.nationality} /></Link> : <CountryFlag locale={locale} country={player.nationality} />}

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

          <Link href={relatedPlayersHref(locale, { minOverall: player.baseOverall })} title={clubText(locale, "minimumOverall")} aria-label={`${clubText(locale, "minimumOverall")}: ${player.baseOverall}`}><strong
            className="playerHeaderStatMain"
          >
            {
              player.baseOverall
            }
          </strong></Link>
          <small>{clubText(locale, "exploreOverall")} {player.baseOverall}</small>

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
            {t(locale, "POTENCIAL")}</span>

          <strong>
            {player.potential !==
            null
              ? <Link href={relatedPlayersHref(locale, { minPotential: player.potential })} title={clubText(locale, "minimumPotential")}>{player.potential}</Link>
              : "—"}
          </strong>

          <small>
            {player.potential !==
            null
              ? t(locale, "Potencial máximo")
              : t(locale, "Não informado")}
          </small>
        </div>

        {/* ==================================
            MERCADO
        ================================== */}

        <dl className="careerFields" aria-label={visualText(locale, "economicData")} style={{ gridColumn: "1 / -1" }}>
          <div>
            <dt>{visualText(locale, "marketValue")}</dt>
            <dd className="playerHeaderMarketValue">{player.marketValue !== null
              ? formatCurrency(player.marketValue, locale)
              : "—"}<EstimatedValueNote provider={player.economicMarketValue?.provider} value={player.marketValue} locale={locale} /></dd>
          </div>
            <div><dt>{publishedWage?.title ?? visualText(locale, "weeklySalary")}</dt><dd>{publishedWage?.value ?? "—"}
              {publishedWage && <><small className="mutedText" style={{ display: "block" }}>{publishedWage.label}</small><small className="mutedText" style={{ display: "block" }}>{publishedWage.detail}</small></>}
            </dd></div>
          {fixedSalary && <div><dt>{fixedSalary.title}</dt><dd>{fixedSalary.value}
            <small className="mutedText" style={{ display: "block" }}>{fixedSalary.detail}</small>
            <a href={fixedSalary.sourceUrl} target="_blank" rel="noopener noreferrer">{locale === "pt" ? "Fonte" : "Source"}</a>
          </dd></div>}
          <div><dt>{visualText(locale, "contractUntil")}</dt><dd>{publicContractUntil(economicOverlay, locale)}</dd></div>
          <div><dt>{visualText(locale, "releaseClause")}</dt><dd>{publicClause(economicOverlay, locale)}</dd></div>
        </dl>
      </div>
    </section>
  )
}
