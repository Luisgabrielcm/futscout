import "dotenv/config"

import {
  EARatingsProvider,
} from "../providers/eaRatingsProvider"

async function main() {
  console.log(
    "================================"
  )

  console.log(
    "🔬 FUTSCOUT - EA DATA INSPECTOR"
  )

  console.log(
    "================================"
  )

  const provider =
    new EARatingsProvider()

  const response =
    await provider.inspectPlayer()

  const player =
    response.items?.[0]

  if (!player) {
    throw new Error(
      "Nenhum jogador encontrado"
    )
  }

  /* ========================================
     JOGADOR
  ======================================== */

  console.log(
    "\n👤 JOGADOR"
  )

  console.log({
    id:
      player.id,

    firstName:
      player.firstName,

    lastName:
      player.lastName,

    commonName:
      player.commonName,

    overallRating:
      player.overallRating,
  })

  /* ========================================
     PÉ PREFERIDO
  ======================================== */

  console.log(
    "\n🦶 PÉ PREFERIDO"
  )

  console.dir(
    player.preferredFoot,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     POSIÇÃO
  ======================================== */

  console.log(
    "\n⚽ POSIÇÃO"
  )

  console.dir(
    player.position,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     CLUBE
  ======================================== */

  console.log(
    "\n🏟️ CLUBE"
  )

  console.dir(
    player.team,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     LIGA
  ======================================== */

  console.log(
    "\n🏆 LIGA"
  )

  console.log(
    player.leagueName
  )

  /* ========================================
     NACIONALIDADE
  ======================================== */

  console.log(
    "\n🌍 NACIONALIDADE"
  )

  console.dir(
    player.nationality,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     IMAGEM
  ======================================== */

  console.log(
    "\n🖼️ FOTO"
  )

  console.log(
    player.avatarUrl
  )

  /* ========================================
     FACE STATS
  ======================================== */

  console.log(
    "\n⭐ FACE STATS"
  )

  console.log({
    pace:
      player.stats?.pac?.value,

    shooting:
      player.stats?.sho?.value,

    passing:
      player.stats?.pas?.value,

    dribbling:
      player.stats?.dri?.value,

    defending:
      player.stats?.def?.value,

    physical:
      player.stats?.phy?.value,
  })

  /* ========================================
     STATS COMPLETOS
  ======================================== */

  console.log(
    "\n📊 STATS COMPLETOS"
  )

  console.dir(
    player.stats,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     PLAYSTYLES
  ======================================== */

  console.log(
    "\n🎮 PLAYSTYLES"
  )

  const playStyles =
    player.playerAbilities
      ?.filter(
        (ability) =>
          ability.type?.id ===
          "playStyle"
      )
      .map((ability) => ({
        id:
          ability.id,

        name:
          ability.label ??
          ability.name,

        imageUrl:
          ability.imageUrl,

        type:
          ability.type?.id,
      })) ?? []

  console.dir(
    playStyles,
    {
      depth: null,
      colors: true,
    }
  )

  /* ========================================
     PLAYSTYLES+
  ======================================== */

  console.log(
    "\n✨ PLAYSTYLES+"
  )

  const playStylesPlus =
    player.playerAbilities
      ?.filter(
        (ability) =>
          ability.type?.id ===
          "playStylePlus"
      )
      .map((ability) => ({
        id:
          ability.id,

        name:
          ability.label ??
          ability.name,

        imageUrl:
          ability.imageUrl,

        type:
          ability.type?.id,
      })) ?? []

  console.dir(
    playStylesPlus,
    {
      depth: null,
      colors: true,
    }
  )
}

main().catch((error) => {
  console.error(
    "\n❌ Erro:"
  )

  console.error(error)

  process.exit(1)
})