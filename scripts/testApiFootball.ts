import "dotenv/config"

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

const PLAYER_ID = 278
const PLAYER_NAME = "Kylian Mbappé"

const SEASONS = [
  2024,
  2023,
  2022,
]

/* ========================================
   ESTATÍSTICAS POR TEMPORADA
======================================== */

async function getPlayerSeason(
  season: number
) {
  const url =
    `${API_URL}/players` +
    `?id=${PLAYER_ID}` +
    `&season=${season}`

  const response =
    await fetch(url, {
      headers,
    })

  if (!response.ok) {
    throw new Error(
      `Erro HTTP na temporada ${season}: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n========================================"
  )

  console.log(
    `${PLAYER_NAME} - TEMPORADA ${season}`
  )

  console.log(
    "RESULTADOS:",
    data.results
  )

  console.log(
    "ERROS:",
    data.errors
  )

  if (
    !data.response ||
    data.response.length === 0
  ) {
    console.log(
      "Nenhum dado encontrado."
    )

    return
  }

  const result =
    data.response[0]

  console.log(
    "\nJOGADOR"
  )

  console.log({
    id: result.player?.id,
    name: result.player?.name,
    firstname:
      result.player?.firstname,
    lastname:
      result.player?.lastname,
    age:
      result.player?.age,
    birth:
      result.player?.birth,
    nationality:
      result.player?.nationality,
    height:
      result.player?.height,
    weight:
      result.player?.weight,
    photo:
      result.player?.photo,
  })

  console.log(
    "\nCOMPETIÇÕES"
  )

  for (
    const stats of
      result.statistics ?? []
  ) {
    console.log(
      "\n--------------------------------"
    )

    console.log(
      `CLUBE/SELEÇÃO: ${stats.team?.name}`
    )

    console.log(
      `COMPETIÇÃO: ${stats.league?.name}`
    )

    console.log(
      `SEASON: ${stats.league?.season}`
    )

    console.log({
      appearances:
        stats.games?.appearences,

      lineups:
        stats.games?.lineups,

      minutes:
        stats.games?.minutes,

      position:
        stats.games?.position,

      rating:
        stats.games?.rating,

      goals:
        stats.goals?.total,

      assists:
        stats.goals?.assists,

      shots:
        stats.shots?.total,

      shotsOnTarget:
        stats.shots?.on,

      passes:
        stats.passes?.total,

      keyPasses:
        stats.passes?.key,

      passAccuracy:
        stats.passes?.accuracy,

      tackles:
        stats.tackles?.total,

      interceptions:
        stats.tackles
          ?.interceptions,

      duels:
        stats.duels?.total,

      duelsWon:
        stats.duels?.won,

      dribbles:
        stats.dribbles?.attempts,

      dribblesSuccess:
        stats.dribbles?.success,

      foulsDrawn:
        stats.fouls?.drawn,

      foulsCommitted:
        stats.fouls?.committed,

      yellowCards:
        stats.cards?.yellow,

      redCards:
        stats.cards?.red,
    })
  }
}

/* ========================================
   TRANSFERÊNCIAS
======================================== */

async function getPlayerTransfers() {
  const url =
    `${API_URL}/transfers` +
    `?player=${PLAYER_ID}`

  const response =
    await fetch(url, {
      headers,
    })

  if (!response.ok) {
    throw new Error(
      `Erro HTTP nas transferências: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n========================================"
  )

  console.log(
    `TRANSFERÊNCIAS - ${PLAYER_NAME}`
  )

  console.log(
    "RESULTADOS:",
    data.results
  )

  console.log(
    "ERROS:",
    data.errors
  )

  console.dir(
    data.response,
    {
      depth: null,
    }
  )
}

/* ========================================
   TÍTULOS
======================================== */

async function getPlayerTrophies() {
  const url =
    `${API_URL}/trophies` +
    `?player=${PLAYER_ID}`

  const response =
    await fetch(url, {
      headers,
    })

  if (!response.ok) {
    throw new Error(
      `Erro HTTP nos títulos: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n========================================"
  )

  console.log(
    `TÍTULOS - ${PLAYER_NAME}`
  )

  console.log(
    "RESULTADOS:",
    data.results
  )

  console.log(
    "ERROS:",
    data.errors
  )

  console.dir(
    data.response,
    {
      depth: null,
    }
  )
}

/* ========================================
   EXECUTAR
======================================== */

async function main() {
  for (
    const season of SEASONS
  ) {
    await getPlayerSeason(
      season
    )
  }

  await getPlayerTransfers()

  await getPlayerTrophies()
}

main().catch(
  console.error
)