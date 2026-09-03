import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    ApiFootballTeamPlayer,
    getApiFootballTeamPlayers,
} from "./getApiFootballTeamPlayers"

import {
    resolveApiFootballClub,
} from "./resolveApiFootballClub"

import {
  ApiFootballPlayerMatchClassification,
  calculateMatchConfidence,
  calculateNameScore,
  canAutomaticallySave,
  classifyMatchConfidence,
  evaluateApiFootballPlayerCandidateRanking,
  evaluateApiFootballPlayerRoster,
  getApiFullName,
  normalizeMatcherText,
} from "./apiFootballPlayerMatcherCore"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const DEFAULT_SEASON = 2024

/* ========================================
   TIPOS
======================================== */

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

function formatDate(
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

function evaluateCandidate({
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

/* ========================================
   RESOLVER JOGADOR
======================================== */

export async function resolveApiFootballPlayer({
  playerId,
  season = DEFAULT_SEASON,
  save = false,
}: {
  playerId: string
  season?: number
  save?: boolean
}): Promise<
  ApiFootballPlayerMatch | null
> {
  /* ======================================
     1. JOGADOR FUTSCOUT
  ====================================== */

  const player =
    await prisma.player.findUnique({
      where: {
        id: playerId,
      },

      select: {
        id: true,
        name: true,

        apiFootballId:
          true,

        dateOfBirth:
          true,

        nationality:
          true,

        club: {
          select: {
            id: true,
            name: true,

            apiFootballId:
              true,
          },
        },
      },
    })

  if (!player) {
    throw new Error(
      `Jogador não encontrado no FutScout: ${playerId}`
    )
  }

  /* ======================================
     2. ID JÁ SALVO
  ====================================== */

  if (
    player.apiFootballId !==
    null
  ) {
    return {
      futScoutPlayerId:
        player.id,

      futScoutPlayerName:
        player.name,

      apiFootballId:
        player.apiFootballId,

      apiName:
        player.name,

      apiFullName:
        player.name,

      apiBirthDate:
        formatDate(
          player.dateOfBirth
        ),

      apiNationality:
        player.nationality,

      apiTeams:
        player.club
          ? [
              player.club.name,
            ]
          : [],

      nameScore:
        100,

      birthMatches:
        true,

      nationalityMatches:
        true,

      clubMatches:
        true,

      confidence:
        100,

      classification:
        "MATCH FORTE",

      source:
        "database",

      canAutoSave:
        true,

      saved:
        false,
    }
  }

  /* ======================================
     3. SEM CLUBE
  ====================================== */

  if (!player.club) {
    return null
  }

  /* ======================================
     4. RESOLVER CLUBE
  ====================================== */

  const resolvedClub =
    await resolveApiFootballClub({
      clubId:
        player.club.id,

      /*
       * IDs de clubes já foram validados
       * anteriormente.
       */
      save:
        true,
    })

  if (
    !resolvedClub
  ) {
    return null
  }

  /* ======================================
     5. CARREGAR ELENCO
  ====================================== */

  const teamPlayers =
    await getApiFootballTeamPlayers({
      teamId:
        resolvedClub.apiFootballId,

      season,
    })

  if (
    teamPlayers.length ===
    0
  ) {
    return null
  }

  /* ======================================
     6. CANDIDATOS
  ====================================== */

  const evaluated =
    evaluateApiFootballPlayerRoster(
      teamPlayers,
      (candidate) =>
        evaluateCandidate({
            player: {
              id:
                player.id,

              name:
                player.name,

              dateOfBirth:
                player.dateOfBirth,

              nationality:
                player.nationality,

              club: {
                name:
                  player.club!.name,
              },
            },

            candidate,

            apiTeamId:
              resolvedClub.apiFootballId,
        })
    )

  const candidateRanking =
    evaluateApiFootballPlayerCandidateRanking(
      evaluated
    )

  const best =
    candidateRanking.top1

  if (!best) {
    return null
  }

  const safeBest = {
    ...best,

    canAutoSave:
      candidateRanking.canAutoSave,
  }

  /* ======================================
     8. NÃO SALVAR?
  ====================================== */

  if (!save) {
    return safeBest
  }

  /* ======================================
     9. NÃO PASSOU NA REGRA DE SEGURANÇA
  ====================================== */

  if (
    !safeBest.canAutoSave
  ) {
    return safeBest
  }

  /* ======================================
     10. VERIFICAR CONFLITO
  ====================================== */

  const existingPlayer =
    await prisma.player.findUnique({
      where: {
        apiFootballId:
          safeBest.apiFootballId,
      },

      select: {
        id: true,
        name: true,
      },
    })

  if (
    existingPlayer &&
    existingPlayer.id !==
      player.id
  ) {
    throw new Error(
      `Conflito de apiFootballId=${best.apiFootballId}. ` +
        `Esse ID já está associado a ${existingPlayer.name}.`
    )
  }

  /* ======================================
     11. GRAVAR
  ====================================== */

  await prisma.player.update({
    where: {
      id:
        player.id,
    },

    data: {
      apiFootballId:
        safeBest.apiFootballId,
    },
  })

  /* ======================================
     12. RETORNO
  ====================================== */

  return {
    ...safeBest,

    saved:
      true,
  }
}
