import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    ApiFootballTeamPlayer,
    getApiFootballTeamPlayers,
} from "./getApiFootballTeamPlayers"

import {
    resolveApiFootballClub,
} from "./resolveApiFootballClub"

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
    | "MATCH FORTE"
    | "REVISAR"
    | "MATCH FRACO"

  source:
    | "database"
    | "matcher"

  canAutoSave: boolean

  saved: boolean
}

/* ========================================
   NORMALIZAÇÃO DE TEXTO
======================================== */

function normalizeText(
  value:
    | string
    | null
    | undefined
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
}

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
   NOME COMPLETO DA API
======================================== */

function getApiFullName(
  candidate:
    ApiFootballTeamPlayer
) {
  return [
    candidate.player
      ?.firstname,
    candidate.player
      ?.lastname,
  ]
    .filter(Boolean)
    .join(" ")
}

/* ========================================
   SCORE DE NOME
======================================== */

function calculateNameScore(
  futScoutName: string,
  candidate:
    ApiFootballTeamPlayer
) {
  const target =
    normalizeText(
      futScoutName
    )

  const apiName =
    normalizeText(
      candidate.player
        ?.name
    )

  const apiFullName =
    normalizeText(
      getApiFullName(
        candidate
      )
    )

  if (!target) {
    return 0
  }

  if (
    target === apiName ||
    target === apiFullName
  ) {
    return 100
  }

  if (
    apiFullName.includes(
      target
    ) ||
    target.includes(
      apiFullName
    )
  ) {
    return 90
  }

  const targetParts =
    target
      .split(" ")
      .filter(Boolean)

  if (
    targetParts.length ===
    0
  ) {
    return 0
  }

  const candidateParts =
    new Set(
      `${apiName} ${apiFullName}`
        .split(" ")
        .filter(Boolean)
    )

  const matchingParts =
    targetParts.filter(
      (part) =>
        candidateParts.has(
          part
        )
    )

  const ratio =
    matchingParts.length /
    targetParts.length

  if (
    ratio === 1
  ) {
    return 100
  }

  if (
    ratio >= 0.75
  ) {
    return 90
  }

  if (
    ratio >= 0.5
  ) {
    return 80
  }

  if (
    ratio > 0
  ) {
    return 50
  }

  return 0
}

/* ========================================
   CANDIDATOS LOCAIS
======================================== */

function getLocalCandidates({
  playerName,
  teamPlayers,
}: {
  playerName: string
  teamPlayers:
    ApiFootballTeamPlayer[]
}) {
  const target =
    normalizeText(
      playerName
    )

  const targetParts =
    target
      .split(" ")
      .filter(Boolean)

  const lastName =
    targetParts[
      targetParts.length - 1
    ] ?? ""

  const candidates =
    teamPlayers.filter(
      (candidate) => {
        const apiName =
          normalizeText(
            candidate.player
              ?.name
          )

        const apiFullName =
          normalizeText(
            getApiFullName(
              candidate
            )
          )

        const combined =
          `${apiName} ${apiFullName}`

        if (
          target &&
          combined.includes(
            target
          )
        ) {
          return true
        }

        if (
          lastName &&
          combined
            .split(" ")
            .includes(
              lastName
            )
        ) {
          return true
        }

        if (
          targetParts.length >
          1
        ) {
          const combinedParts =
            new Set(
              combined
                .split(" ")
                .filter(Boolean)
            )

          const matches =
            targetParts.filter(
              (part) =>
                combinedParts.has(
                  part
                )
            ).length

          if (
            matches /
              targetParts.length >=
            0.5
          ) {
            return true
          }
        }

        return false
      }
    )

  /*
   * Se não encontramos um candidato óbvio
   * pelo nome, ainda avaliamos o elenco
   * completo.
   *
   * Isso ajuda em abreviações diferentes
   * entre EA e API-Football.
   */
  if (
    candidates.length ===
    0
  ) {
    return teamPlayers
  }

  return candidates
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

function canAutomaticallySave(
  match: {
    classification:
      ApiFootballPlayerMatch["classification"]

    birthMatches: boolean

    clubMatches: boolean

    nameScore: number
  }
) {
  return (
    match.classification ===
      "MATCH FORTE" &&
    match.birthMatches &&
    match.clubMatches &&
    match.nameScore >= 80
  )
}

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

  const namePoints =
    Math.round(
      nameScore * 0.4
    )

  const birthPoints =
    birthMatches
      ? 35
      : 0

  const nationalityPoints =
    nationalityMatches
      ? 10
      : 0

  const clubPoints =
    clubMatches
      ? 15
      : 0

  const confidence =
    namePoints +
    birthPoints +
    nationalityPoints +
    clubPoints

  let classification:
    ApiFootballPlayerMatch["classification"] =
      "MATCH FRACO"

  if (
    confidence >= 90
  ) {
    classification =
      "MATCH FORTE"
  } else if (
    confidence >= 75
  ) {
    classification =
      "REVISAR"
  }

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

  const candidates =
    getLocalCandidates({
      playerName:
        player.name,

      teamPlayers,
    })

  if (
    candidates.length ===
    0
  ) {
    return null
  }

  /* ======================================
     7. AVALIAR TODOS
  ====================================== */

  const evaluated =
    candidates
      .map(
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
      .filter(
        (
          result
        ): result is ApiFootballPlayerMatch =>
          result !== null
      )
      .sort(
        (
          a,
          b
        ) =>
          b.confidence -
          a.confidence
      )

  const best =
    evaluated[0]

  if (!best) {
    return null
  }

  /* ======================================
     8. NÃO SALVAR?
  ====================================== */

  if (!save) {
    return best
  }

  /* ======================================
     9. NÃO PASSOU NA REGRA DE SEGURANÇA
  ====================================== */

  if (
    !best.canAutoSave
  ) {
    return best
  }

  /* ======================================
     10. VERIFICAR CONFLITO
  ====================================== */

  const existingPlayer =
    await prisma.player.findUnique({
      where: {
        apiFootballId:
          best.apiFootballId,
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
        best.apiFootballId,
    },
  })

  /* ======================================
     12. RETORNO
  ====================================== */

  return {
    ...best,

    saved:
      true,
  }
}