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

const DEFAULT_SEASONS = [
  2024,
  2023,
  2022,
]

type ApiFootballResponse<T> = {
  errors:
    | Record<string, string>
    | string[]
  results: number
  response: T
}

export type SyncApiFootballPlayerParams = {
  slug: string
  apiFootballId: number
  seasons?: number[]
}

/* ========================================
   FETCH GENÉRICO
======================================== */

async function apiFetch<T>(
  path: string
): Promise<T> {
  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `API-Football HTTP ${response.status}`
    )
  }

  const data =
    (await response.json()) as ApiFootballResponse<T>

  const hasErrors =
    Array.isArray(data.errors)
      ? data.errors.length > 0
      : Object.keys(
          data.errors ?? {}
        ).length > 0

  if (hasErrors) {
    throw new Error(
      `API-Football retornou erro: ${JSON.stringify(
        data.errors
      )}`
    )
  }

  return data.response
}

/* ========================================
   ESTATÍSTICAS POR TEMPORADA
======================================== */

async function syncSeasonStats({
  playerId,
  apiFootballId,
  season,
}: {
  playerId: string
  apiFootballId: number
  season: number
}) {
  const response =
    await apiFetch<any[]>(
      `/players?id=${apiFootballId}&season=${season}`
    )

  if (
    !response ||
    response.length === 0
  ) {
    console.log(
      `Sem estatísticas para ${season}`
    )

    return 0
  }

  const playerResponse =
    response[0]

  const statistics =
    playerResponse.statistics ?? []

  console.log(
    `Temporada ${season}: ${statistics.length} competições`
  )

  let synchronized = 0

  for (
    const stats of statistics
  ) {
    const apiTeamId =
      stats.team?.id ?? null

    const apiLeagueId =
      stats.league?.id ?? null

    if (
      apiTeamId === null ||
      apiLeagueId === null
    ) {
      console.log(
        "Estatística ignorada por falta de team/league ID:",
        stats.team?.name,
        stats.league?.name
      )

      continue
    }

    const data = {
      teamName:
        stats.team?.name ??
        "Não informado",

      teamLogoUrl:
        stats.team?.logo ??
        null,

      competitionName:
        stats.league?.name ??
        "Não informada",

      competitionCountry:
        stats.league?.country ??
        null,

      competitionLogoUrl:
        stats.league?.logo ??
        null,

      competitionFlagUrl:
        stats.league?.flag ??
        null,

      position:
        stats.games?.position ??
        null,

      appearances:
        stats.games?.appearences ??
        null,

      lineups:
        stats.games?.lineups ??
        null,

      minutes:
        stats.games?.minutes ??
        null,

      rating:
        stats.games?.rating
          ? Number(
              stats.games.rating
            )
          : null,

      goals:
        stats.goals?.total ??
        null,

      assists:
        stats.goals?.assists ??
        null,

      shots:
        stats.shots?.total ??
        null,

      shotsOnTarget:
        stats.shots?.on ??
        null,

      passes:
        stats.passes?.total ??
        null,

      keyPasses:
        stats.passes?.key ??
        null,

      passAccuracy:
        stats.passes?.accuracy ??
        null,

      tackles:
        stats.tackles?.total ??
        null,

      interceptions:
        stats.tackles
          ?.interceptions ??
        null,

      duels:
        stats.duels?.total ??
        null,

      duelsWon:
        stats.duels?.won ??
        null,

      dribbles:
        stats.dribbles?.attempts ??
        null,

      dribblesSuccess:
        stats.dribbles?.success ??
        null,

      foulsDrawn:
        stats.fouls?.drawn ??
        null,

      foulsCommitted:
        stats.fouls?.committed ??
        null,

      yellowCards:
        stats.cards?.yellow ??
        null,

      redCards:
        stats.cards?.red ??
        null,
    }

    await prisma.playerRealLifeStat.upsert({
      where: {
        playerId_season_apiTeamId_apiLeagueId: {
          playerId,
          season,
          apiTeamId,
          apiLeagueId,
        },
      },

      update: data,

      create: {
        playerId,
        apiTeamId,
        apiLeagueId,
        season,
        ...data,
      },
    })

    synchronized++
  }

  return synchronized
}

/* ========================================
   TRANSFERÊNCIAS
======================================== */

async function syncTransfers({
  playerId,
  apiFootballId,
}: {
  playerId: string
  apiFootballId: number
}) {
  const response =
    await apiFetch<any[]>(
      `/transfers?player=${apiFootballId}`
    )

  if (
    !response ||
    response.length === 0
  ) {
    console.log(
      "Nenhuma transferência encontrada."
    )

    return 0
  }

  let total = 0

  for (
    const group of response
  ) {
    for (
      const transfer of
        group.transfers ?? []
    ) {
      if (!transfer.date) {
        continue
      }

      const transferDate =
        new Date(
          `${transfer.date}T00:00:00.000Z`
        )

      const fromTeamName =
        transfer.teams?.out?.name ??
        "Não informado"

      const toTeamName =
        transfer.teams?.in?.name ??
        "Não informado"

      await prisma.playerTransfer.upsert({
        where: {
          playerId_transferDate_fromTeamName_toTeamName: {
            playerId,
            transferDate,
            fromTeamName,
            toTeamName,
          },
        },

        update: {
          fromTeamApiId:
            transfer.teams?.out?.id ??
            null,

          fromTeamLogo:
            transfer.teams?.out?.logo ??
            null,

          toTeamApiId:
            transfer.teams?.in?.id ??
            null,

          toTeamLogo:
            transfer.teams?.in?.logo ??
            null,

          rawTransferType:
            transfer.type ??
            null,
        },

        create: {
          playerId,
          transferDate,

          fromTeamApiId:
            transfer.teams?.out?.id ??
            null,

          fromTeamName,

          fromTeamLogo:
            transfer.teams?.out?.logo ??
            null,

          toTeamApiId:
            transfer.teams?.in?.id ??
            null,

          toTeamName,

          toTeamLogo:
            transfer.teams?.in?.logo ??
            null,

          rawTransferType:
            transfer.type ??
            null,
        },
      })

      total++
    }
  }

  console.log(
    `Transferências sincronizadas: ${total}`
  )

  return total
}

/* ========================================
   TÍTULOS / CONQUISTAS
======================================== */

async function syncTrophies({
  playerId,
  apiFootballId,
}: {
  playerId: string
  apiFootballId: number
}) {
  const response =
    await apiFetch<any[]>(
      `/trophies?player=${apiFootballId}`
    )

  let total = 0

  for (
    const trophy of
      response ?? []
  ) {
    const country =
      trophy.country ??
      null

    const competition =
      trophy.league ??
      "Não informada"

    const season =
      String(
        trophy.season ??
          "Não informada"
      )

    const place =
      trophy.place ??
      "Não informado"

    const existing =
      await prisma.playerTrophy.findFirst({
        where: {
          playerId,
          country,
          competition,
          season,
          place,
        },
      })

    if (existing) {
      await prisma.playerTrophy.update({
        where: {
          id: existing.id,
        },

        data: {
          country,
          competition,
          season,
          place,
        },
      })
    } else {
      await prisma.playerTrophy.create({
        data: {
          playerId,
          country,
          competition,
          season,
          place,
        },
      })
    }

    total++
  }

  console.log(
    `Conquistas sincronizadas: ${total}`
  )

  return total
}

/* ========================================
   SINCRONIZADOR GENÉRICO
======================================== */

export async function syncApiFootballPlayer({
  slug,
  apiFootballId,
  seasons = DEFAULT_SEASONS,
}: SyncApiFootballPlayerParams) {
  console.log(
    "\n========================================"
  )

  console.log(
    `API-FOOTBALL → ${slug}`
  )

  console.log(
    "========================================"
  )

  const player =
    await prisma.player.findUnique({
      where: {
        slug,
      },

      select: {
        id: true,
        name: true,
        slug: true,
        apiFootballId: true,
      },
    })

  if (!player) {
    throw new Error(
      `Jogador não encontrado no FutScout: ${slug}`
    )
  }

  console.log(
    `Jogador encontrado: ${player.name}`
  )

  console.log(
    `FutScout ID: ${player.id}`
  )

  if (
    player.apiFootballId !== null &&
    player.apiFootballId !== apiFootballId
  ) {
    throw new Error(
      `Conflito de API-Football ID. ` +
        `O jogador ${player.name} já possui ` +
        `apiFootballId=${player.apiFootballId}, ` +
        `mas foi solicitado ${apiFootballId}.`
    )
  }

  await prisma.player.update({
    where: {
      id: player.id,
    },

    data: {
      apiFootballId,
    },
  })

  console.log(
    `API-Football ID associado: ${apiFootballId}`
  )

  let totalStats = 0

  for (
    const season of seasons
  ) {
    totalStats +=
      await syncSeasonStats({
        playerId:
          player.id,

        apiFootballId,

        season,
      })
  }

  const totalTransfers =
    await syncTransfers({
      playerId:
        player.id,

      apiFootballId,
    })

  const totalTrophies =
    await syncTrophies({
      playerId:
        player.id,

      apiFootballId,
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "RESUMO"
  )

  console.log(
    "========================================"
  )

  console.log(
    `Estatísticas sincronizadas: ${totalStats}`
  )

  console.log(
    `Transferências sincronizadas: ${totalTransfers}`
  )

  console.log(
    `Conquistas sincronizadas: ${totalTrophies}`
  )

  console.log(
    "\n========================================"
  )

  console.log(
    "SINCRONIZAÇÃO FINALIZADA"
  )

  console.log(
    "========================================"
  )
}