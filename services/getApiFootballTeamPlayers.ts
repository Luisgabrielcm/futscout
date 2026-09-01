import "dotenv/config"

import { prisma } from "../lib/prisma"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const API_FOOTBALL_BASE_URL =
  "https://v3.football.api-sports.io"

const MAX_API_PAGES = 3

const CACHE_DAYS = 7

/* ========================================
   TIPOS
======================================== */

type ApiFootballPlayerProfile = {
  id: number
  name: string
  firstname: string | null
  lastname: string | null
  age: number | null
  birth: {
    date: string | null
    place: string | null
    country: string | null
  }
  nationality: string | null
  height: string | null
  weight: string | null
  injured: boolean
  photo: string | null
}

type ApiFootballTeam = {
  id: number
  name: string
  logo: string | null
}

type ApiFootballLeague = {
  id: number
  name: string
  country: string
  logo: string | null
  flag: string | null
  season: number
}

type ApiFootballStatistic = {
  team: ApiFootballTeam
  league: ApiFootballLeague

  games?: {
    appearances?: number | null
    lineups?: number | null
    minutes?: number | null
    position?: string | null
    rating?: string | null
  }

  substitutes?: {
    in?: number | null
    out?: number | null
    bench?: number | null
  }

  shots?: {
    total?: number | null
    on?: number | null
  }

  goals?: {
    total?: number | null
    conceded?: number | null
    assists?: number | null
    saves?: number | null
  }

  passes?: {
    total?: number | null
    key?: number | null
    accuracy?: number | null
  }

  tackles?: {
    total?: number | null
    blocks?: number | null
    interceptions?: number | null
  }

  duels?: {
    total?: number | null
    won?: number | null
  }

  dribbles?: {
    attempts?: number | null
    success?: number | null
    past?: number | null
  }

  fouls?: {
    drawn?: number | null
    committed?: number | null
  }

  cards?: {
    yellow?: number | null
    yellowred?: number | null
    red?: number | null
  }

  penalty?: {
    won?: number | null
    commited?: number | null
    scored?: number | null
    missed?: number | null
    saved?: number | null
  }
}

export type ApiFootballTeamPlayer = {
  player: ApiFootballPlayerProfile
  statistics: ApiFootballStatistic[]
}

type ApiFootballPlayersResponse = {
  errors?:
    | string[]
    | Record<string, string>

  results?: number

  paging?: {
    current?: number
    total?: number
  }

  response?: ApiFootballTeamPlayer[]
}

/* ========================================
   CACHE EM MEMÓRIA
======================================== */

const memoryCache =
  new Map<
    string,
    ApiFootballTeamPlayer[]
  >()

function getCacheKey(
  teamId: number,
  season: number
) {
  return `${teamId}:${season}`
}

/* ========================================
   CACHE - EXPIRAÇÃO
======================================== */

function calculateExpiresAt() {
  const expiresAt =
    new Date()

  expiresAt.setDate(
    expiresAt.getDate() +
      CACHE_DAYS
  )

  return expiresAt
}

/* ========================================
   VALIDAR DADOS DO CACHE
======================================== */

function isApiFootballTeamPlayerArray(
  value: unknown
): value is ApiFootballTeamPlayer[] {
  if (!Array.isArray(value)) {
    return false
  }

  return value.every(
    (item) => {
      if (
        typeof item !==
          "object" ||
        item === null
      ) {
        return false
      }

      const candidate =
        item as {
          player?: {
            id?: unknown
            name?: unknown
          }
          statistics?: unknown
        }

      return (
        typeof candidate
          .player?.id ===
          "number" &&
        typeof candidate
          .player?.name ===
          "string" &&
        Array.isArray(
          candidate.statistics
        )
      )
    }
  )
}

/* ========================================
   BUSCAR CACHE NO POSTGRESQL
======================================== */

async function getDatabaseCache({
  teamId,
  season,
}: {
  teamId: number
  season: number
}) {
  const cached =
    await prisma.apiFootballTeamRosterCache.findUnique({
      where: {
        apiTeamId_season: {
          apiTeamId:
            teamId,

          season,
        },
      },
    })

  if (!cached) {
    return null
  }

  /*
   * Cache expirado.
   */
  if (
    cached.expiresAt <=
    new Date()
  ) {
    console.log(
      `Cache PostgreSQL expirado: team=${teamId}, season=${season}`
    )

    return null
  }

  if (
    !isApiFootballTeamPlayerArray(
      cached.players
    )
  ) {
    console.warn(
      `Cache PostgreSQL inválido: team=${teamId}, season=${season}`
    )

    return null
  }

  console.log(
    `Cache PostgreSQL utilizado: team=${teamId}, season=${season}, players=${cached.playerCount}`
  )

  return cached.players
}

/* ========================================
   SALVAR CACHE NO POSTGRESQL
======================================== */

async function saveDatabaseCache({
  teamId,
  season,
  players,
}: {
  teamId: number
  season: number
  players: ApiFootballTeamPlayer[]
}) {
  const expiresAt =
    calculateExpiresAt()

  await prisma.apiFootballTeamRosterCache.upsert({
    where: {
      apiTeamId_season: {
        apiTeamId:
          teamId,

        season,
      },
    },

    create: {
      apiTeamId:
        teamId,

      season,

      players,

      playerCount:
        players.length,

      fetchedAt:
        new Date(),

      expiresAt,
    },

    update: {
      players,

      playerCount:
        players.length,

      fetchedAt:
        new Date(),

      expiresAt,
    },
  })

  console.log(
    `Cache PostgreSQL salvo: team=${teamId}, season=${season}, players=${players.length}`
  )
}

/* ========================================
   NORMALIZAR / MESCLAR ELENCO
======================================== */

function mergePlayers(
  players: ApiFootballTeamPlayer[]
) {
  const playerMap =
    new Map<
      number,
      ApiFootballTeamPlayer
    >()

  for (
    const item of players
  ) {
    const playerId =
      item.player.id

    const existing =
      playerMap.get(
        playerId
      )

    /*
     * Primeiro registro deste jogador.
     */
    if (!existing) {
      playerMap.set(
        playerId,
        {
          player:
            item.player,

          statistics: [
            ...(
              item.statistics ??
              []
            ),
          ],
        }
      )

      continue
    }

    /*
     * Mesmo jogador apareceu novamente
     * em outra página/estatística.
     */
    const combinedStatistics = [
      ...existing.statistics,
      ...(
        item.statistics ??
        []
      ),
    ]

    playerMap.set(
      playerId,
      {
        player:
          existing.player,

        statistics:
          combinedStatistics,
      }
    )
  }

  return Array.from(
    playerMap.values()
  )
}

/* ========================================
   CHAMAR API-FOOTBALL
======================================== */

async function fetchApiPage({
  teamId,
  season,
  page,
}: {
  teamId: number
  season: number
  page: number
}) {
  const apiKey =
    process.env.API_FOOTBALL_KEY

  if (!apiKey) {
    throw new Error(
      "API_FOOTBALL_KEY não está definida no .env."
    )
  }

  const url =
    new URL(
      `${API_FOOTBALL_BASE_URL}/players`
    )

  url.searchParams.set(
    "team",
    String(teamId)
  )

  url.searchParams.set(
    "season",
    String(season)
  )

  url.searchParams.set(
    "page",
    String(page)
  )

  console.log(
    `API-Football: carregando team=${teamId}, season=${season}, page=${page}`
  )

  const response =
    await fetch(
      url.toString(),
      {
        headers: {
          "x-apisports-key":
            apiKey,
        },
      }
    )

  /* ======================================
     RATE LIMIT
  ====================================== */

  if (
    response.status ===
    429
  ) {
    throw new Error(
      "RATE_LIMIT_429"
    )
  }

  if (!response.ok) {
    const body =
      await response.text()

    throw new Error(
      `API-Football HTTP ${response.status}: ${body}`
    )
  }

  const data =
    (await response.json()) as
      ApiFootballPlayersResponse

  /*
   * Algumas limitações da API chegam
   * no campo errors mesmo com resposta
   * HTTP válida.
   */
  if (
    data.errors &&
    (
      Array.isArray(
        data.errors
      )
        ? data.errors.length >
          0
        : Object.keys(
            data.errors
          ).length >
          0
    )
  ) {
    const errorText =
      JSON.stringify(
        data.errors
      )

    /*
     * Detectamos mensagens relacionadas
     * à cota/limite.
     */
    if (
      errorText
        .toLowerCase()
        .includes(
          "rate"
        ) ||
      errorText
        .toLowerCase()
        .includes(
          "limit"
        )
    ) {
      throw new Error(
        "RATE_LIMIT_429"
      )
    }

    throw new Error(
      `API-Football retornou erro: ${errorText}`
    )
  }

  return data
}

/* ========================================
   BUSCAR TODAS AS PÁGINAS DA API
======================================== */

async function fetchTeamPlayersFromApi({
  teamId,
  season,
}: {
  teamId: number
  season: number
}) {
  const allPlayers:
    ApiFootballTeamPlayer[] =
    []

  /*
   * Página 1 primeiro para descobrirmos
   * quantas páginas a API informa.
   */
  const firstPage =
    await fetchApiPage({
      teamId,
      season,
      page: 1,
    })

  allPlayers.push(
    ...(
      firstPage.response ??
      []
    )
  )

  const reportedTotalPages =
    firstPage.paging
      ?.total ??
    1

  /*
   * O plano atual permite no máximo
   * página 3.
   */
  const pagesToFetch =
    Math.min(
      reportedTotalPages,
      MAX_API_PAGES
    )

  if (
    reportedTotalPages >
    MAX_API_PAGES
  ) {
    console.log(
      `Plano atual permite até ${MAX_API_PAGES}. Serão carregadas somente as páginas 1-${MAX_API_PAGES}.`
    )
  }

  /*
   * Página 1 já foi carregada.
   */
  for (
    let page = 2;
    page <=
    pagesToFetch;
    page++
  ) {
    const data =
      await fetchApiPage({
        teamId,
        season,
        page,
      })

    allPlayers.push(
      ...(
        data.response ??
        []
      )
    )
  }

  return mergePlayers(
    allPlayers
  )
}

/* ========================================
   FUNÇÃO PRINCIPAL
======================================== */

export async function getApiFootballTeamPlayers({
  teamId,
  season,
}: {
  teamId: number
  season: number
}): Promise<
  ApiFootballTeamPlayer[]
> {
  const key =
    getCacheKey(
      teamId,
      season
    )

  /* ======================================
     1. CACHE EM MEMÓRIA
  ====================================== */

  const memoryResult =
    memoryCache.get(
      key
    )

  if (memoryResult) {
    console.log(
      `Cache memória utilizado: team=${teamId}, season=${season}, players=${memoryResult.length}`
    )

    return memoryResult
  }

  /* ======================================
     2. CACHE POSTGRESQL
  ====================================== */

  const databaseResult =
    await getDatabaseCache({
      teamId,
      season,
    })

  if (databaseResult) {
    memoryCache.set(
      key,
      databaseResult
    )

    return databaseResult
  }

  /* ======================================
     3. API-FOOTBALL
  ====================================== */

  const apiResult =
    await fetchTeamPlayersFromApi({
      teamId,
      season,
    })

  /*
   * Primeiro colocamos na memória para
   * reutilização imediata nesta execução.
   */
  memoryCache.set(
    key,
    apiResult
  )

  /*
   * Depois persistimos no PostgreSQL.
   *
   * Se a API retornar com sucesso,
   * futuras execuções não precisarão
   * consultar este clube novamente
   * durante a validade do cache.
   */
  await saveDatabaseCache({
    teamId,
    season,
    players:
      apiResult,
  })

  return apiResult
}

/* ========================================
   VERIFICAR CACHE EM MEMÓRIA
======================================== */

export function hasApiFootballTeamPlayersCache({
  teamId,
  season,
}: {
  teamId: number
  season: number
}) {
  const key =
    getCacheKey(
      teamId,
      season
    )

  return memoryCache.has(
    key
  )
}

/* ========================================
   LIMPAR CACHE DE UM CLUBE
======================================== */

export function clearApiFootballTeamPlayersCacheForTeam({
  teamId,
  season,
}: {
  teamId: number
  season: number
}) {
  const key =
    getCacheKey(
      teamId,
      season
    )

  memoryCache.delete(
    key
  )
}

/* ========================================
   LIMPAR TODO CACHE EM MEMÓRIA
======================================== */

export function clearApiFootballTeamPlayersCache() {
  memoryCache.clear()
}