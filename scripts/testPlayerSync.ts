import "dotenv/config"

import {
    EARatingsProvider,
} from "../providers/eaRatingsProvider"

import {
    mapEARatingsPlayer,
} from "../mappers/mapEARatingsPlayer"

import {
    normalizePlayer,
} from "../normalizers/normalizePlayer"

import {
    syncPlayer,
} from "../services/syncPlayers"

import {
    prisma,
} from "../lib/prisma"

/* ========================================
   TESTE DE SINCRONIZAÇÃO DE 1 JOGADOR
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🧪 FUTSCOUT - TESTE DE SYNC"
  )

  console.log(
    "========================================"
  )

  const provider =
    new EARatingsProvider()

  /* ========================================
     1. BUSCAR 1 JOGADOR NA EA
  ======================================== */

  console.log(
    "\n📡 Buscando 1 jogador na EA..."
  )

  const batch =
    await provider.getPlayersBatch({
      limit: 1,
      offset: 0,
    })

  const eaPlayer =
    batch.players[0]

  if (!eaPlayer) {
    throw new Error(
      "Nenhum jogador retornado pela EA."
    )
  }

  console.log(
    "\n✅ Jogador recebido da EA:"
  )

  console.log({
    id:
      eaPlayer.id,

    firstName:
      eaPlayer.firstName,

    lastName:
      eaPlayer.lastName,

    commonName:
      eaPlayer.commonName,

    overallRating:
      eaPlayer.overallRating,

    skillMoves:
      eaPlayer.skillMoves,

    weakFootAbility:
      eaPlayer.weakFootAbility,

    alternatePositions:
      eaPlayer.alternatePositions,

    shieldUrl:
      eaPlayer.shieldUrl,

    playerAbilities:
      eaPlayer.playerAbilities,
  })

  /* ========================================
     2. MAPPER
  ======================================== */

  console.log(
    "\n🔄 Executando mapper..."
  )

  const externalPlayer =
    mapEARatingsPlayer(
      eaPlayer
    )

  console.log(
    "\n✅ ExternalPlayer:"
  )

  console.dir(
    {
      externalId:
        externalPlayer.externalId,

      name:
        externalPlayer.commonName,

      position:
        externalPlayer.position,

      secondaryPositions:
        externalPlayer.secondaryPositions,

      skillMoves:
        externalPlayer.skillMoves,

      weakFoot:
        externalPlayer.weakFoot,

      clubName:
        externalPlayer.clubName,

      clubImageUrl:
        externalPlayer.clubImageUrl,

      playStyles:
        externalPlayer.playStyles,
    },
    {
      depth: null,
    }
  )

  /* ========================================
     3. NORMALIZER
  ======================================== */

  console.log(
    "\n🧹 Executando normalizer..."
  )

  const normalizedPlayer =
    normalizePlayer(
      externalPlayer
    )

  console.log(
    "\n✅ NormalizedPlayer:"
  )

  console.dir(
    {
      externalId:
        normalizedPlayer.externalId,

      name:
        normalizedPlayer.name,

      position:
        normalizedPlayer.position,

      secondaryPosition:
        normalizedPlayer
          .secondaryPosition,

      secondaryPositions:
        normalizedPlayer
          .secondaryPositions,

      skillMoves:
        normalizedPlayer.skillMoves,

      weakFootAbility:
        normalizedPlayer
          .weakFootAbility,

      club:
        normalizedPlayer.club,

      playStyles:
        normalizedPlayer.playStyles,
    },
    {
      depth: null,
    }
  )

  /* ========================================
     4. SINCRONIZAR APENAS ESSE JOGADOR
  ======================================== */

  console.log(
    "\n💾 Sincronizando jogador..."
  )

  const syncedPlayer =
    await syncPlayer(
      normalizedPlayer
    )

  console.log(
    "\n✅ Jogador sincronizado:"
  )

  console.log(
    syncedPlayer
  )

  /* ========================================
     5. CONSULTAR NOVAMENTE NO POSTGRESQL
  ======================================== */

  console.log(
    "\n🔎 Conferindo dados no banco..."
  )

  const databasePlayer =
    await prisma.player.findUnique({
      where: {
        id:
          syncedPlayer.id,
      },

      include: {
        club:
          true,

        playStyles: {
          include: {
            playStyle:
              true,
          },
        },
      },
    })

  if (!databasePlayer) {
    throw new Error(
      "Jogador não encontrado após sincronização."
    )
  }

  /* ========================================
     6. RESULTADO
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "📋 RESULTADO DO TESTE"
  )

  console.log(
    "========================================"
  )

  console.dir(
    {
      id:
        databasePlayer.id,

      externalId:
        databasePlayer.externalId,

      name:
        databasePlayer.name,

      slug:
        databasePlayer.slug,

      position:
        databasePlayer.position,

      secondaryPosition:
        databasePlayer
          .secondaryPosition,

      secondaryPositions:
        databasePlayer
          .secondaryPositions,

      skillMoves:
        databasePlayer.skillMoves,

      weakFootAbility:
        databasePlayer
          .weakFootAbility,

      club: databasePlayer.club
        ? {
            name:
              databasePlayer.club.name,

            externalId:
              databasePlayer.club
                .externalId,

            imageUrl:
              databasePlayer.club
                .imageUrl,
          }
        : null,

      playStyles:
        databasePlayer.playStyles.map(
          (
            playerPlayStyle
          ) => ({
            code:
              playerPlayStyle
                .playStyle.code,

            name:
              playerPlayStyle
                .playStyle.name,

            level:
              playerPlayStyle.level,
          })
        ),
    },
    {
      depth: null,
    }
  )

  console.log(
    "\n✅ TESTE FINALIZADO COM SUCESSO."
  )
}

/* ========================================
   EXECUTAR
======================================== */

main()
  .catch(
    (error) => {
      console.error(
        "\n❌ TESTE FALHOU:"
      )

      console.error(
        error
      )

      process.exitCode =
        1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )