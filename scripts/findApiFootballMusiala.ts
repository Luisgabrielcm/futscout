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

const SEASON = 2024

type LeagueSearchItem = {
  league?: { id: number; name: string; type?: string }
  country?: { name: string }
}
type TeamSearchItem = {
  team?: { id: number; name: string; country: string }
}

/* ========================================
   BUSCAR BUNDESLIGA
======================================== */

async function findBundesligaId() {
  const response =
    await fetch(
      `${API_URL}/leagues?search=${encodeURIComponent(
        "Bundesliga"
      )}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar Bundesliga: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n================================"
  )

  console.log(
    "RESULTADOS DA BUSCA DA LIGA"
  )

  console.log(
    "================================"
  )

  for (
    const item of
      data.response ?? []
  ) {
    console.log({
      id:
        item.league?.id,

      name:
        item.league?.name,

      type:
        item.league?.type,

      country:
        item.country?.name,
    })
  }

  const bundesliga =
    (data.response ?? []).find(
      (item: LeagueSearchItem) =>
        item.league?.name ===
          "Bundesliga" &&
        item.country?.name ===
          "Germany"
    )

  if (!bundesliga) {
    throw new Error(
      "Bundesliga da Alemanha não encontrada."
    )
  }

  console.log(
    "\nLIGA ESCOLHIDA"
  )

  console.log({
    id:
      bundesliga.league.id,

    name:
      bundesliga.league.name,

    country:
      bundesliga.country.name,
  })

  return bundesliga.league.id as number
}

/* ========================================
   BUSCAR BAYERN NA BUNDESLIGA
======================================== */

async function findBayernTeamId(
  leagueId: number
) {
  const response =
    await fetch(
      `${API_URL}/teams?league=${leagueId}&season=${SEASON}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar clubes: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n================================"
  )

  console.log(
    "CLUBES DA BUNDESLIGA"
  )

  console.log(
    "================================"
  )

  for (
    const item of
      data.response ?? []
  ) {
    console.log({
      id:
        item.team?.id,

      name:
        item.team?.name,

      country:
        item.team?.country,
    })
  }

  const bayern =
    (data.response ?? []).find(
      (item: TeamSearchItem) => {
        const name =
          String(
            item.team?.name ??
              ""
          ).toLowerCase()

        return (
          name.includes(
            "bayern"
          ) &&
          item.team?.country ===
            "Germany"
        )
      }
    )

  if (!bayern) {
    throw new Error(
      "Bayern masculino não encontrado entre os clubes da Bundesliga."
    )
  }

  console.log(
    "\n================================"
  )

  console.log(
    "BAYERN ENCONTRADO"
  )

  console.log(
    "================================"
  )

  console.log({
    id:
      bayern.team.id,

    name:
      bayern.team.name,

    country:
      bayern.team.country,

    logo:
      bayern.team.logo,
  })

  return bayern.team.id as number
}

/* ========================================
   BUSCAR MUSIALA
======================================== */

async function findMusiala(
  teamId: number
) {
  const response =
    await fetch(
      `${API_URL}/players` +
        `?search=${encodeURIComponent(
          "Musiala"
        )}` +
        `&team=${teamId}` +
        `&season=${SEASON}`,
      {
        headers,
      }
    )

  if (!response.ok) {
    throw new Error(
      `Erro HTTP ao buscar Musiala: ${response.status}`
    )
  }

  const data =
    await response.json()

  console.log(
    "\n================================"
  )

  console.log(
    "BUSCA: MUSIALA"
  )

  console.log(
    "================================"
  )

  console.log(
    "RESULTADOS:",
    data.results
  )

  console.log(
    "ERROS:",
    data.errors
  )

  for (
    const result of
      data.response ?? []
  ) {
    console.log(
      "\nJOGADOR ENCONTRADO"
    )

    console.log({
      id:
        result.player?.id,

      name:
        result.player?.name,

      firstname:
        result.player
          ?.firstname,

      lastname:
        result.player
          ?.lastname,

      nationality:
        result.player
          ?.nationality,

      birth:
        result.player?.birth,

      height:
        result.player?.height,

      weight:
        result.player?.weight,

      photo:
        result.player?.photo,
    })
  }
}

/* ========================================
   EXECUTAR
======================================== */

async function main() {
  const leagueId =
    await findBundesligaId()

  const teamId =
    await findBayernTeamId(
      leagueId
    )

  await findMusiala(
    teamId
  )
}

main().catch(
  console.error
)
