// Mechanical extraction of the existing matcher evaluation. No I/O.
import type { ApiFootballTeamPlayer } from "./getApiFootballTeamPlayers"
import {
  type ApiFootballPlayerMatchClassification,
  calculateMatchConfidence, calculateNameScore, canAutomaticallySave,
  classifyMatchConfidence, getApiFullName, normalizeMatcherText,
} from "./apiFootballPlayerMatcherCore"

export type ApiFootballPlayerMatch = {
  futScoutPlayerId: string
  futScoutPlayerName: string

  apiFootballId: number

  apiName: string
  apiFullName: string

  apiBirthDate: string | null
  apiNationality: string | null
  apiTeams: string[]

  nameScore: number
  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean

  confidence: number

  classification:
    ApiFootballPlayerMatchClassification

  source:
    | "database"
    | "matcher"

  canAutoSave: boolean

  saved: boolean
}

/* ========================================
   NORMALIZAÇÃO DE TEXTO
======================================== */

const normalizeText =
  normalizeMatcherText

/* ========================================
   NACIONALIDADE
======================================== */

const NATIONALITY_ALIASES: Record<
  string,
  string
> = {
  holland: "netherlands",
}

function normalizeNationality(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeText(value)

  return (
    NATIONALITY_ALIASES[
      normalized
    ] ?? normalized
  )
}

/* ========================================
   CLUBE
======================================== */

function normalizeClubName(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeText(value)

  const ignoredWords =
    new Set([
      "fc",
      "cf",
      "sc",
      "ac",
      "afc",
      "club",
      "football",
      "futbol",
      "futebol",
    ])

  return normalized
    .split(" ")
    .filter(
      (part) =>
        part &&
        !ignoredWords.has(
          part
        )
    )
    .map(
      (part) => {
        if (
          part === "munchen"
        ) {
          return "munich"
        }

        return part
      }
    )
    .join(" ")
}

/* ========================================
   DATA
======================================== */

export function formatDate(
  value:
    | Date
    | null
    | undefined
) {
  if (!value) {
    return null
  }

  return value
    .toISOString()
    .slice(0, 10)
}

/* ========================================
   REGRA DE AUTO-SAVE
======================================== */

/*
 * Esta regra é mais rígida que apenas
 * confidence >= 90.
 *
 * Para salvar automaticamente exigimos:
 *
 * - MATCH FORTE
 * - mesma data de nascimento
 * - mesmo clube
 * - nome com score >= 80
 *
 * Nacionalidade ajuda no confidence,
 * mas não é obrigatória porque existem
 * diferenças como:
 *
 * Holland / Netherlands
 */

/* ========================================
   AVALIAR CANDIDATO
======================================== */

export function evaluateCandidate({
  player,
  candidate,
  apiTeamId,
}: {
  player: {
    id: string
    name: string

    dateOfBirth:
      | Date
      | null

    nationality:
      | string
      | null

    club: {
      name: string
    }
  }

  candidate:
    ApiFootballTeamPlayer

  apiTeamId: number
}): ApiFootballPlayerMatch | null {
  const apiFootballId =
    candidate.player?.id

  if (
    apiFootballId ===
    undefined
  ) {
    return null
  }

  const apiName =
    candidate.player
      ?.name ?? ""

  const apiFullName =
    getApiFullName(
      candidate
    )

  const apiBirthDate =
    candidate.player
      ?.birth?.date ??
    null

  const futScoutBirthDate =
    formatDate(
      player.dateOfBirth
    )

  const birthMatches =
    Boolean(
      futScoutBirthDate &&
      apiBirthDate &&
      futScoutBirthDate ===
        apiBirthDate
    )

  const futScoutNationality =
    normalizeNationality(
      player.nationality
    )

  const apiNationality =
    normalizeNationality(
      candidate.player
        ?.nationality
    )

  const nationalityMatches =
    Boolean(
      futScoutNationality &&
      apiNationality &&
      futScoutNationality ===
        apiNationality
    )

  const statistics =
    candidate.statistics ??
    []

  const apiTeams =
    Array.from(
      new Set(
        statistics
          .map(
            (stat) =>
              stat.team?.name
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      )
    )

  const clubMatchesById =
    statistics.some(
      (stat) =>
        stat.team?.id ===
        apiTeamId
    )

  const futScoutClub =
    normalizeClubName(
      player.club.name
    )

  const clubMatchesByName =
    apiTeams.some(
      (team) =>
        normalizeClubName(
          team
        ) ===
        futScoutClub
    )

  const clubMatches =
    clubMatchesById ||
    clubMatchesByName

  const nameScore =
    calculateNameScore(
      player.name,
      candidate
    )

  /*
   * PESOS:
   *
   * nome          = 40
   * nascimento    = 35
   * nacionalidade = 10
   * clube         = 15
   *
   * total         = 100
   */

  const confidence =
    calculateMatchConfidence({
      nameScore,
      birthMatches,
      nationalityMatches,
      clubMatches,
    })

  const classification =
    classifyMatchConfidence(
      confidence
    )

  const autoSaveAllowed =
    canAutomaticallySave({
      classification,
      birthMatches,
      clubMatches,
      nameScore,
    })

  return {
    futScoutPlayerId:
      player.id,

    futScoutPlayerName:
      player.name,

    apiFootballId,

    apiName,

    apiFullName,

    apiBirthDate,

    apiNationality:
      candidate.player
        ?.nationality ??
      null,

    apiTeams,

    nameScore,

    birthMatches,

    nationalityMatches,

    clubMatches,

    confidence,

    classification,

    source:
      "matcher",

    canAutoSave:
      autoSaveAllowed,

    saved:
      false,
  }
}
