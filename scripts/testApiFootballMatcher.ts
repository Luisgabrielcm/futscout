import "dotenv/config"

import { prisma } from "../lib/prisma"

const API_URL =
  "https://v3.football.api-sports.io"

const apiKey =
  process.env.API_FOOTBALL_KEY

if (!apiKey) {
  throw new Error(
    "API_FOOTBALL_KEY não encontrada no .env"
  )
}

const headers: HeadersInit = {
  "x-apisports-key": apiKey,
}

const SEASON = 2024

const TEST_PLAYER_SLUGS = [
  "kylian-mbappe",
  "jamal-musiala",
  "pedri",
]

type ApiFootballPlayer = {
  player?: {
    id?: number
    name?: string
    firstname?: string
    lastname?: string
    nationality?: string

    birth?: {
      date?: string
      place?: string
      country?: string
    }

    height?: string
    weight?: string
  }

  statistics?: Array<{
    team?: {
      id?: number
      name?: string
    }

    league?: {
      id?: number
      name?: string
      season?: number
    }
  }>
}

type ApiTeam = {
  team?: {
    id?: number
    name?: string
    country?: string
    logo?: string
  }
}

type ApiFootballResponse<T> = {
  errors:
    | Record<string, string>
    | string[]

  results: number

  response: T
}

/* ========================================
   NORMALIZAR TEXTO
======================================== */

function normalizeText(
  value:
    | string
    | null
    | undefined
) {
  return String(
    value ?? ""
  )
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
   NORMALIZAR NOME DO CLUBE
======================================== */

function normalizeClubName(
  value:
    | string
    | null
    | undefined
) {
  let normalized =
    normalizeText(
      value
    )

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

  let parts =
    normalized
      .split(" ")
      .filter(
        (part) =>
          !ignoredWords.has(
            part
          )
      )

  parts =
    parts.map(
      (part) => {
        if (
          part === "munchen"
        ) {
          return "munich"
        }

        return part
      }
    )

  normalized =
    parts.join(" ")

  return normalized
}

/* ========================================
   TERMO DE BUSCA DO CLUBE
======================================== */

function getClubSearchTerm(
  clubName: string
) {
  const normalized =
    normalizeClubName(
      clubName
    )

  const parts =
    normalized.split(" ")

  if (
    parts.includes(
      "bayern"
    )
  ) {
    return "Bayern"
  }

  return parts.join(" ")
}

/* ========================================
   DETECTAR TIME FEMININO
======================================== */

function looksLikeWomenTeam(
  teamName:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeText(
      teamName
    )

  return (
    normalized.endsWith(
      " w"
    ) ||
    normalized.includes(
      " women"
    ) ||
    normalized.includes(
      " femenino"
    ) ||
    normalized.includes(
      " feminino"
    ) ||
    normalized.includes(
      " frauen"
    )
  )
}

/* ========================================
   PONTUAÇÃO DO CLUBE
======================================== */

function calculateClubScore(
  futScoutClub: string,
  apiClub:
    | string
    | null
    | undefined
) {
  if (
    !apiClub ||
    looksLikeWomenTeam(
      apiClub
    )
  ) {
    return 0
  }

  const futScout =
    normalizeClubName(
      futScoutClub
    )

  const api =
    normalizeClubName(
      apiClub
    )

  if (
    futScout === api
  ) {
    return 100
  }

  if (
    futScout.includes(
      api
    ) ||
    api.includes(
      futScout
    )
  ) {
    return 90
  }

  const futScoutParts =
    futScout.split(" ")

  const apiParts =
    api.split(" ")

  const commonParts =
    futScoutParts.filter(
      (part) =>
        apiParts.includes(
          part
        )
    )

  if (
    commonParts.length ===
      futScoutParts.length &&
    commonParts.length > 0
  ) {
    return 85
  }

  if (
    commonParts.length >= 2
  ) {
    return 75
  }

  if (
    commonParts.length === 1
  ) {
    return 55
  }

  return 0
}

/* ========================================
   NOME COMPLETO DA API
======================================== */

function buildApiFullName(
  candidate: ApiFootballPlayer
) {
  const firstName =
    candidate.player
      ?.firstname ??
    ""

  const lastName =
    candidate.player
      ?.lastname ??
    ""

  const fullName =
    `${firstName} ${lastName}`.trim()

  return (
    fullName ||
    candidate.player?.name ||
    ""
  )
}

/* ========================================
   COMPARAR NOMES
======================================== */

function compareNames(
  futScoutName: string,
  candidate: ApiFootballPlayer
) {
  const futScout =
    normalizeText(
      futScoutName
    )

  const apiShort =
    normalizeText(
      candidate.player?.name
    )

  const apiFull =
    normalizeText(
      buildApiFullName(
        candidate
      )
    )

  if (
    futScout === apiFull ||
    futScout === apiShort
  ) {
    return 1
  }

  if (
    apiFull.includes(
      futScout
    ) ||
    futScout.includes(
      apiFull
    )
  ) {
    return 0.9
  }

  const futScoutParts =
    futScout.split(" ")

  const apiParts =
    apiFull.split(" ")

  const commonParts =
    futScoutParts.filter(
      (part) =>
        apiParts.includes(
          part
        )
    )

  if (
    commonParts.length >= 2
  ) {
    return 0.8
  }

  if (
    commonParts.length === 1
  ) {
    return 0.5
  }

  return 0
}

/* ========================================
   COMPARAR NASCIMENTO
======================================== */

function compareBirthDate(
  futScoutDate:
    | Date
    | null,
  candidate: ApiFootballPlayer
) {
  const apiBirth =
    candidate.player
      ?.birth?.date

  if (
    !futScoutDate ||
    !apiBirth
  ) {
    return null
  }

  const futScoutBirth =
    futScoutDate
      .toISOString()
      .slice(
        0,
        10
      )

  return (
    futScoutBirth ===
    apiBirth
  )
}

/* ========================================
   COMPARAR NACIONALIDADE
======================================== */

function compareNationality(
  futScoutNationality:
    | string
    | null,
  candidate: ApiFootballPlayer
) {
  const apiNationality =
    candidate.player
      ?.nationality

  if (
    !futScoutNationality ||
    !apiNationality
  ) {
    return null
  }

  return (
    normalizeText(
      futScoutNationality
    ) ===
    normalizeText(
      apiNationality
    )
  )
}

/* ========================================
   COMPARAR CLUBE DO JOGADOR
======================================== */

function compareClub(
  futScoutClub:
    | string
    | null,
  candidate: ApiFootballPlayer
) {
  if (!futScoutClub) {
    return null
  }

  const teams =
    (
      candidate.statistics ??
      []
    )
      .map(
        (stat) =>
          stat.team?.name
      )
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      )

  if (
    teams.length === 0
  ) {
    return null
  }

  const scores =
    teams.map(
      (teamName) =>
        calculateClubScore(
          futScoutClub,
          teamName
        )
    )

  const bestScore =
    Math.max(
      ...scores
    )

  return (
    bestScore >= 75
  )
}

/* ========================================
   CALCULAR CONFIANÇA
======================================== */

function calculateConfidence({
  nameScore,
  birthMatches,
  nationalityMatches,
  clubMatches,
}: {
  nameScore: number

  birthMatches:
    | boolean
    | null

  nationalityMatches:
    | boolean
    | null

  clubMatches:
    | boolean
    | null
}) {
  let score = 0

  score +=
    nameScore * 40

  if (
    birthMatches === true
  ) {
    score += 35
  }

  if (
    nationalityMatches ===
    true
  ) {
    score += 10
  }

  if (
    clubMatches === true
  ) {
    score += 15
  }

  return Math.round(
    score
  )
}

/* ========================================
   CLASSIFICAR MATCH
======================================== */

function getMatchStatus(
  confidence: number
) {
  if (
    confidence >= 90
  ) {
    return "MATCH FORTE"
  }

  if (
    confidence >= 75
  ) {
    return "REVISAR"
  }

  return "MATCH FRACO"
}

/* ========================================
   BUSCAR CLUBE NA API
======================================== */

async function findApiTeam({
  clubName,
}: {
  clubName: string
}) {
  const searchTerm =
    getClubSearchTerm(
      clubName
    )

  const params =
    new URLSearchParams()

  params.set(
    "search",
    searchTerm
  )

  const response =
    await fetch(
      `${API_URL}/teams?${params.toString()}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar clube ${clubName}: ${response.status}`
    )
  }

  const data =
    (await response.json()) as ApiFootballResponse<
      ApiTeam[]
    >

  const candidates =
    (
      data.response ??
      []
    )
      .map(
        (item) => ({
          item,

          score:
            calculateClubScore(
              clubName,
              item.team?.name
            ),
        })
      )
      .filter(
        (candidate) =>
          candidate.score >
            0 &&
          !looksLikeWomenTeam(
            candidate.item
              .team?.name
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )

  console.log(
    "\nCANDIDATOS DE CLUBE"
  )

  for (
    const candidate of
      candidates
  ) {
    console.log({
      id:
        candidate.item
          .team?.id,

      name:
        candidate.item
          .team?.name,

      country:
        candidate.item
          .team?.country,

      score:
        `${candidate.score}%`,
    })
  }

  if (
    candidates.length === 0
  ) {
    console.log(
      `Clube não encontrado na API-Football: ${clubName}`
    )

    return null
  }

  const best =
    candidates[0]

  if (
    !best?.item.team?.id
  ) {
    return null
  }

  console.log(
    "\nCLUBE CORRESPONDENTE"
  )

  console.log({
    futScoutClub:
      clubName,

    apiTeamId:
      best.item.team.id,

    apiTeamName:
      best.item.team.name,

    country:
      best.item.team.country,

    confidence:
      `${best.score}%`,
  })

  return {
    id:
      best.item.team.id,

    name:
      best.item.team.name ??
      "",
  }
}

/* ========================================
   BUSCAR CANDIDATOS DO JOGADOR
======================================== */

async function searchCandidates({
  playerName,
  clubName,
}: {
  playerName: string
  clubName: string | null
}) {
  if (!clubName) {
    console.log(
      "Jogador sem clube no FutScout."
    )

    return []
  }

  const team =
    await findApiTeam({
      clubName,
    })

  if (!team) {
    return []
  }

  const nameParts =
    playerName
      .trim()
      .split(
        /\s+/
      )

  const lastName =
    nameParts[
      nameParts.length - 1
    ]

  /*
   * IMPORTANTE:
   *
   * Normalizamos antes de enviar
   * para a API.
   *
   * Mbappé -> mbappe
   */

  const searchName =
    normalizeText(
      lastName ||
      playerName
    )

  console.log(
    "\nBUSCA DO JOGADOR"
  )

  console.log({
    originalName:
      playerName,

    searchName,

    apiTeamId:
      team.id,

    apiTeamName:
      team.name,

    season:
      SEASON,
  })

  const params =
    new URLSearchParams()

  params.set(
    "search",
    searchName
  )

  params.set(
    "team",
    String(
      team.id
    )
  )

  params.set(
    "season",
    String(
      SEASON
    )
  )

  const response =
    await fetch(
      `${API_URL}/players?${params.toString()}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar jogador ${playerName}: ${response.status}`
    )
  }

  const data =
    (await response.json()) as ApiFootballResponse<
      ApiFootballPlayer[]
    >

  if (
    data.response &&
    data.response.length >
      0
  ) {
    return data.response
  }

  /*
   * FALLBACK
   *
   * Se não acharmos pelo sobrenome,
   * tentamos o nome completo também
   * normalizado.
   */

  const normalizedFullName =
    normalizeText(
      playerName
    )

  if (
    normalizedFullName ===
    searchName
  ) {
    return []
  }

  console.log(
    "Primeira busca sem resultados. Tentando nome completo..."
  )

  const fallbackParams =
    new URLSearchParams()

  fallbackParams.set(
    "search",
    normalizedFullName
  )

  fallbackParams.set(
    "team",
    String(
      team.id
    )
  )

  fallbackParams.set(
    "season",
    String(
      SEASON
    )
  )

  const fallbackResponse =
    await fetch(
      `${API_URL}/players?${fallbackParams.toString()}`,
      {
        headers,
      }
    )

  if (
    !fallbackResponse.ok
  ) {
    throw new Error(
      `Erro HTTP no fallback de ${playerName}: ${fallbackResponse.status}`
    )
  }

  const fallbackData =
    (await fallbackResponse.json()) as ApiFootballResponse<
      ApiFootballPlayer[]
    >

  return (
    fallbackData.response ??
    []
  )
}

/* ========================================
   TESTAR JOGADOR
======================================== */

async function testPlayer(
  slug: string
) {
  const player =
    await prisma.player.findUnique({
      where: {
        slug,
      },

      select: {
        id: true,
        slug: true,
        name: true,

        dateOfBirth: true,

        nationality: true,

        apiFootballId: true,

        club: {
          select: {
            name: true,
          },
        },
      },
    })

  if (!player) {
    console.log(
      "\n========================================"
    )

    console.log(
      `Jogador não encontrado: ${slug}`
    )

    return
  }

  console.log(
    "\n========================================"
  )

  console.log(
    `FUTSCOUT: ${player.name}`
  )

  console.log(
    "========================================"
  )

  console.log({
    slug:
      player.slug,

    birth:
      player.dateOfBirth
        ?.toISOString()
        .slice(
          0,
          10
        ),

    nationality:
      player.nationality,

    club:
      player.club?.name ??
      null,

    expectedApiFootballId:
      player.apiFootballId,
  })

  const candidates =
    await searchCandidates({
      playerName:
        player.name,

      clubName:
        player.club?.name ??
        null,
    })

  console.log(
    `Candidatos encontrados: ${candidates.length}`
  )

  if (
    candidates.length === 0
  ) {
    console.log(
      "Nenhum candidato encontrado."
    )

    return
  }

  const evaluated =
    candidates
      .map(
        (candidate) => {
          const nameScore =
            compareNames(
              player.name,
              candidate
            )

          const birthMatches =
            compareBirthDate(
              player.dateOfBirth,
              candidate
            )

          const nationalityMatches =
            compareNationality(
              player.nationality,
              candidate
            )

          const clubMatches =
            compareClub(
              player.club?.name ??
                null,
              candidate
            )

          const confidence =
            calculateConfidence({
              nameScore,
              birthMatches,
              nationalityMatches,
              clubMatches,
            })

          return {
            candidate,
            nameScore,
            birthMatches,
            nationalityMatches,
            clubMatches,
            confidence,
          }
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          b.confidence -
          a.confidence
      )

  for (
    const result of
      evaluated
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      "CANDIDATO"
    )

    console.log({
      apiFootballId:
        result.candidate
          .player?.id,

      apiName:
        result.candidate
          .player?.name,

      apiFullName:
        buildApiFullName(
          result.candidate
        ),

      birth:
        result.candidate
          .player
          ?.birth?.date,

      nationality:
        result.candidate
          .player
          ?.nationality,

      teams:
        (
          result.candidate
            .statistics ??
          []
        )
          .map(
            (stats) =>
              stats.team?.name
          )
          .filter(
            Boolean
          ),
    })

    console.log(
      "\nCOMPARAÇÃO"
    )

    console.log({
      name:
        `${Math.round(
          result.nameScore *
            100
        )}%`,

      birth:
        result.birthMatches,

      nationality:
        result.nationalityMatches,

      club:
        result.clubMatches,
    })

    console.log(
      `CONFIANÇA: ${result.confidence}%`
    )

    console.log(
      `STATUS: ${getMatchStatus(
        result.confidence
      )}`
    )
  }

  const best =
    evaluated[0]

  if (!best) {
    return
  }

  console.log(
    "\n========================================"
  )

  console.log(
    "MELHOR CANDIDATO"
  )

  console.log(
    "========================================"
  )

  console.log({
    foundApiFootballId:
      best.candidate
        .player?.id,

    expectedApiFootballId:
      player.apiFootballId,

    name:
      buildApiFullName(
        best.candidate
      ),

    confidence:
      `${best.confidence}%`,

    status:
      getMatchStatus(
        best.confidence
      ),

    idCorrect:
      player.apiFootballId !==
      null
        ? best.candidate
            .player?.id ===
          player.apiFootballId
        : "SEM GABARITO",
  })
}

/* ========================================
   EXECUTAR
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE EA ↔ API-FOOTBALL MATCHER V4"
  )

  console.log(
    "========================================"
  )

  console.log(
    "MODO: SOMENTE LEITURA"
  )

  console.log(
    "Nenhum apiFootballId será alterado."
  )

  for (
    const slug of
      TEST_PLAYER_SLUGS
  ) {
    await testPlayer(
      slug
    )
  }

  console.log(
    "\n========================================"
  )

  console.log(
    "TESTE FINALIZADO"
  )

  console.log(
    "========================================"
  )
}

main()
  .catch(
    (error) => {
      console.error(
        "\nErro no matcher:",
        error
      )

      process.exitCode = 1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )