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

/* ========================================
   TIPOS
======================================== */

type ApiFootballResponse<T> = {
  errors:
    | Record<string, string>
    | string[]

  results: number

  response: T
}

type ApiFootballTeamResponse = {
  team?: {
    id?: number
    name?: string
    country?: string
    logo?: string
  }
}

export type ResolvedApiFootballClub = {
  futScoutClubId: string

  futScoutClubName: string

  apiFootballId: number

  apiFootballName: string

  apiCountry: string | null

  apiLogoUrl: string | null

  confidence: number

  source:
    | "database"
    | "api-football"
}

/* ========================================
   CACHE DESTA EXECUÇÃO
======================================== */

/*
 * Se vários jogadores do mesmo clube
 * forem processados durante a mesma
 * execução, não precisamos repetir
 * a busca na API.
 */

const runtimeCache =
  new Map<
    string,
    ResolvedApiFootballClub
  >()

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
   NORMALIZAR NOME DE CLUBE
======================================== */

function normalizeClubName(
  value:
    | string
    | null
    | undefined
) {
  let normalized =
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

  let parts =
    normalized
      .split(" ")
      .filter(
        (part) =>
          part &&
          !ignoredWords.has(
            part
          )
      )

  /*
   * Equivalências que já identificamos
   * entre EA e API-Football.
   */

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

  return parts.join(" ")
}

/* ========================================
   TERMO DE BUSCA
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

  /*
   * Para Bayern, usar apenas Bayern
   * produz resultados melhores.
   */

  if (
    parts.includes(
      "bayern"
    )
  ) {
    return "Bayern"
  }

  return normalized
}

/* ========================================
   DETECTAR EQUIPES FEMININAS
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
      " feminino"
    ) ||
    normalized.includes(
      " femenino"
    ) ||
    normalized.includes(
      " frauen"
    )
  )
}

/* ========================================
   DETECTAR EQUIPES DE BASE
======================================== */

function looksLikeYouthTeam(
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
    /\bu\d{2}\b/.test(
      normalized
    ) ||
    normalized.includes(
      " youth"
    ) ||
    normalized.includes(
      " academy"
    ) ||
    normalized.endsWith(
      " ii"
    ) ||
    normalized.endsWith(
      " iii"
    ) ||
    normalized.includes(
      " reserve"
    )
  )
}

/* ========================================
   SCORE DO CLUBE
======================================== */

function calculateClubScore(
  futScoutClubName: string,
  apiClubName:
    | string
    | null
    | undefined
) {
  if (!apiClubName) {
    return 0
  }

  if (
    looksLikeWomenTeam(
      apiClubName
    )
  ) {
    return 0
  }

  if (
    looksLikeYouthTeam(
      apiClubName
    )
  ) {
    return 0
  }

  const futScout =
    normalizeClubName(
      futScoutClubName
    )

  const api =
    normalizeClubName(
      apiClubName
    )

  if (
    !futScout ||
    !api
  ) {
    return 0
  }

  /*
   * Nome exato após normalização.
   */

  if (
    futScout === api
  ) {
    return 100
  }

  /*
   * Um nome contém completamente
   * o outro.
   */

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

  /*
   * Todas as palavras relevantes
   * do FutScout aparecem na API.
   */

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
   VERIFICAR ERROS DA API
======================================== */

function hasApiErrors(
  errors:
    | Record<string, string>
    | string[]
    | undefined
) {
  if (!errors) {
    return false
  }

  if (
    Array.isArray(errors)
  ) {
    return (
      errors.length > 0
    )
  }

  return (
    Object.keys(
      errors
    ).length > 0
  )
}

/* ========================================
   BUSCAR NA API-FOOTBALL
======================================== */

async function searchApiFootballClub(
  clubName: string
) {
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

  /*
   * 429 é especialmente importante
   * porque significa rate limit.
   */

  if (
    response.status === 429
  ) {
    throw new Error(
      "API-Football atingiu o limite de requisições (HTTP 429). Tente novamente mais tarde."
    )
  }

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar clube ${clubName}: ${response.status}`
    )
  }

  const data =
    (await response.json()) as ApiFootballResponse<
      ApiFootballTeamResponse[]
    >

  if (
    hasApiErrors(
      data.errors
    )
  ) {
    throw new Error(
      `API-Football retornou erro ao buscar ${clubName}: ${JSON.stringify(
        data.errors
      )}`
    )
  }

  const candidates =
    (
      data.response ??
      []
    )
      .map(
        (item) => {
          return {
            item,

            score:
              calculateClubScore(
                clubName,
                item.team?.name
              ),
          }
        }
      )
      .filter(
        (candidate) =>
          candidate.score >
            0 &&
          candidate.item
            .team?.id !==
            undefined
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )

  return candidates
}

/* ========================================
   RESOLVER CLUBE
======================================== */

export async function resolveApiFootballClub({
  clubId,
  save = false,
}: {
  clubId: string

  /*
   * false:
   * apenas testa.
   *
   * true:
   * permite salvar o ID confirmado
   * no PostgreSQL.
   */

  save?: boolean
}): Promise<
  ResolvedApiFootballClub | null
> {
  /* ======================================
     1. CACHE DA EXECUÇÃO
  ====================================== */

  const cached =
    runtimeCache.get(
      clubId
    )

  if (cached) {
    return cached
  }

  /* ======================================
     2. BUSCAR CLUBE NO FUTSCOUT
  ====================================== */

  const club =
    await prisma.club.findUnique({
      where: {
        id: clubId,
      },

      select: {
        id: true,
        name: true,
        apiFootballId: true,
      },
    })

  if (!club) {
    throw new Error(
      `Clube não encontrado no FutScout: ${clubId}`
    )
  }

  /* ======================================
     3. JÁ TEM ID SALVO?
  ====================================== */

  if (
    club.apiFootballId !==
    null
  ) {
    const result: ResolvedApiFootballClub =
      {
        futScoutClubId:
          club.id,

        futScoutClubName:
          club.name,

        apiFootballId:
          club.apiFootballId,

        apiFootballName:
          club.name,

        apiCountry:
          null,

        apiLogoUrl:
          null,

        confidence:
          100,

        source:
          "database",
      }

    runtimeCache.set(
      club.id,
      result
    )

    return result
  }

  /* ======================================
     4. BUSCAR NA API
  ====================================== */

  const candidates =
    await searchApiFootballClub(
      club.name
    )

  if (
    candidates.length ===
    0
  ) {
    return null
  }

  const best =
    candidates[0]

  if (!best) {
    return null
  }

  const apiTeam =
    best.item.team

  if (
    apiTeam?.id ===
      undefined ||
    !apiTeam.name
  ) {
    return null
  }

  /*
   * Não aceitamos automaticamente
   * correspondências fracas.
   */

  if (
    best.score < 90
  ) {
    console.log(
      `Clube exige revisão: ${club.name} → ${apiTeam.name} (${best.score}%)`
    )

    return null
  }

  const result: ResolvedApiFootballClub =
    {
      futScoutClubId:
        club.id,

      futScoutClubName:
        club.name,

      apiFootballId:
        apiTeam.id,

      apiFootballName:
        apiTeam.name,

      apiCountry:
        apiTeam.country ??
        null,

      apiLogoUrl:
        apiTeam.logo ??
        null,

      confidence:
        best.score,

      source:
        "api-football",
    }

  /* ======================================
     5. SALVAR, SE AUTORIZADO
  ====================================== */

  if (save) {
    /*
     * Antes de gravar, confirmamos que
     * esse apiFootballId ainda não está
     * vinculado a outro clube.
     */

    const existing =
      await prisma.club.findUnique({
        where: {
          apiFootballId:
            apiTeam.id,
        },

        select: {
          id: true,
          name: true,
        },
      })

    if (
      existing &&
      existing.id !==
        club.id
    ) {
      throw new Error(
        `Conflito de apiFootballId=${apiTeam.id}. ` +
          `Já está associado ao clube ${existing.name}.`
      )
    }

    await prisma.club.update({
      where: {
        id: club.id,
      },

      data: {
        apiFootballId:
          apiTeam.id,
      },
    })
  }

  runtimeCache.set(
    club.id,
    result
  )

  return result
}

/* ========================================
   LIMPAR CACHE
======================================== */

export function clearApiFootballClubCache() {
  runtimeCache.clear()
}