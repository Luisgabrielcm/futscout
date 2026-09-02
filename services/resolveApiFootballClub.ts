import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
  ApiFootballRateLimitError,
  hasApiFootballRateLimitSignal,
} from "./apiFootballErrors"
import {
  getClubSearchTerm,
  rankApiFootballClubCandidates,
  selectBestApiFootballClubCandidate,
} from "./apiFootballClubMatcherCore"

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

async function persistApiFootballClubId({
  clubId,
  clubName,
  currentApiFootballId,
  apiFootballId,
}: {
  clubId: string
  clubName: string
  currentApiFootballId:
    | number
    | null
  apiFootballId: number
}) {
  if (
    currentApiFootballId !==
    null
  ) {
    if (
      currentApiFootballId ===
      apiFootballId
    ) {
      return
    }

    throw new Error(
      `Clube ${clubName} já possui apiFootballId=${currentApiFootballId}.`
    )
  }

  const existing =
    await prisma.club.findUnique({
      where: {
        apiFootballId,
      },

      select: {
        id: true,
        name: true,
      },
    })

  if (
    existing &&
    existing.id !== clubId
  ) {
    throw new Error(
      `Conflito de apiFootballId=${apiFootballId}. ` +
        `Já está associado ao clube ${existing.name}.`
    )
  }

  await prisma.club.update({
    where: {
      id: clubId,
    },

    data: {
      apiFootballId,
    },
  })
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
    throw new ApiFootballRateLimitError()
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
    if (
      hasApiFootballRateLimitSignal(
        data.errors
      )
    ) {
      throw new ApiFootballRateLimitError()
    }

    throw new Error(
      `API-Football retornou erro ao buscar ${clubName}: ${JSON.stringify(
        data.errors
      )}`
    )
  }

  const candidates =
    rankApiFootballClubCandidates(
      clubName,
      data.response ?? []
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

  let clubFromCacheValidation:
    | {
        id: string
        name: string
        apiFootballId:
          | number
          | null
      }
    | undefined

  if (
    cached &&
    !save &&
    cached.source ===
      "api-football"
  ) {
    return cached
  }

  if (cached) {
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

    if (
      cached.source ===
      "api-football"
    ) {
      await persistApiFootballClubId({
        clubId: club.id,
        clubName: club.name,
        currentApiFootballId:
          club.apiFootballId,
        apiFootballId:
          cached.apiFootballId,
      })

      return cached
    }

    if (
      club.apiFootballId ===
      cached.apiFootballId
    ) {
      return cached
    }

    runtimeCache.delete(
      clubId
    )

    clubFromCacheValidation =
      club
  }

  /* ======================================
     2. BUSCAR CLUBE NO FUTSCOUT
  ====================================== */

  const club =
    clubFromCacheValidation ??
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
    selectBestApiFootballClubCandidate(
      candidates
    )

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

    await persistApiFootballClubId({
      clubId: club.id,
      clubName: club.name,
      currentApiFootballId:
        club.apiFootballId,
      apiFootballId:
        apiTeam.id,
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
