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
    syncPlayers,
} from "../services/syncPlayers"

import {
    prisma,
} from "../lib/prisma"

/* ========================================
   TESTE DE SINCRONIZAÇÃO EM LOTE
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🧪 FUTSCOUT - TESTE DE SYNC EM LOTE"
  )

  console.log(
    "========================================"
  )

  const provider =
    new EARatingsProvider()

  /* ========================================
     1. BUSCAR 10 JOGADORES
  ======================================== */

  console.log(
    "\n📡 Buscando 10 jogadores na EA..."
  )

  const batch =
    await provider.getPlayersBatch({
      limit: 10,
      offset: 0,
    })

  if (
    !batch.players ||
    batch.players.length === 0
  ) {
    throw new Error(
      "Nenhum jogador retornado pela EA."
    )
  }

  console.log(
    `\n✅ ${batch.players.length} jogador(es) recebido(s).`
  )

  /* ========================================
     2. MAPEAR
  ======================================== */

  console.log(
    "\n🔄 Executando mapper..."
  )

  const externalPlayers =
    batch.players.map(
      mapEARatingsPlayer
    )

  /* ========================================
     3. NORMALIZAR
  ======================================== */

  console.log(
    "\n🧹 Executando normalizer..."
  )

  const normalizedPlayers =
    externalPlayers.map(
      normalizePlayer
    )

  /* ========================================
     4. MOSTRAR RESUMO ANTES DO SYNC
  ======================================== */

  console.log(
    "\n📋 Jogadores preparados:"
  )

  for (
    const player
    of normalizedPlayers
  ) {
    console.log({
      externalId:
        player.externalId,

      name:
        player.name,

      position:
        player.position,

      secondaryPositions:
        player.secondaryPositions,

      skillMoves:
        player.skillMoves,

      weakFootAbility:
        player.weakFootAbility,

      club:
        player.club?.name,

      playStyles:
        player.playStyles.map(
          (
            playStyle
          ) => ({
            code:
              playStyle.code,

            name:
              playStyle.name,

            level:
              playStyle.level,
          })
        ),
    })
  }

  /* ========================================
     5. SINCRONIZAR LOTE
  ======================================== */

  console.log(
    "\n💾 Sincronizando os 10 jogadores..."
  )

  const result =
    await syncPlayers(
      normalizedPlayers,
      {
        onError: async ({
          player,
          error,
        }) => {
          console.error(
            `❌ Erro no teste para ${player.name}`
          )

          console.error(
            error
          )
        },
      }
    )

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 RESULTADO DO SYNC"
  )

  console.log(
    "========================================"
  )

  console.log({
    processed:
      result.processed,

    success:
      result.success,

    failed:
      result.failed,
  })

  /* ========================================
     6. BUSCAR NO BANCO
  ======================================== */

  const externalIds =
    normalizedPlayers.map(
      (
        player
      ) =>
        player.externalId
    )

  const databasePlayers =
    await prisma.player.findMany({
      where: {
        externalId: {
          in:
            externalIds,
        },
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

      orderBy: {
        name:
          "asc",
      },
    })

  /* ========================================
     7. AUDITORIA DOS RESULTADOS
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "🔎 AUDITORIA NO POSTGRESQL"
  )

  console.log(
    "========================================"
  )

  for (
    const player
    of databasePlayers
  ) {
    console.dir(
      {
        externalId:
          player.externalId,

        name:
          player.name,

        slug:
          player.slug,

        position:
          player.position,

        secondaryPosition:
          player.secondaryPosition,

        secondaryPositions:
          player.secondaryPositions,

        skillMoves:
          player.skillMoves,

        weakFootAbility:
          player.weakFootAbility,

        club:
          player.club
            ? {
                name:
                  player.club.name,

                externalId:
                  player.club
                    .externalId,

                imageUrl:
                  player.club
                    .imageUrl,
              }
            : null,

        playStyles:
          player.playStyles.map(
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
  }

  /* ========================================
     8. VALIDAÇÕES
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "🧪 VALIDAÇÕES"
  )

  console.log(
    "========================================"
  )

  if (
    databasePlayers.length !==
    normalizedPlayers.length
  ) {
    console.warn(
      `⚠️ Esperados ${normalizedPlayers.length} jogadores, mas foram encontrados ${databasePlayers.length} no banco.`
    )
  } else {
    console.log(
      `✅ Todos os ${databasePlayers.length} jogadores foram encontrados no banco.`
    )
  }

  const playersWithSkillMoves =
    databasePlayers.filter(
      (
        player
      ) =>
        player.skillMoves !== null
    )

  console.log(
    `✅ Skill Moves presente em ${playersWithSkillMoves.length}/${databasePlayers.length}`
  )

  const playersWithWeakFoot =
    databasePlayers.filter(
      (
        player
      ) =>
        player.weakFootAbility !==
        null
    )

  console.log(
    `✅ Weak Foot presente em ${playersWithWeakFoot.length}/${databasePlayers.length}`
  )

  const playersWithSecondaryPositions =
    databasePlayers.filter(
      (
        player
      ) =>
        player.secondaryPositions
          .length > 0
    )

  console.log(
    `✅ Posição secundária encontrada em ${playersWithSecondaryPositions.length}/${databasePlayers.length}`
  )

  const playersWithClubBadge =
    databasePlayers.filter(
      (
        player
      ) =>
        Boolean(
          player.club?.imageUrl
        )
    )

  console.log(
    `✅ Escudo de clube presente em ${playersWithClubBadge.length}/${databasePlayers.length}`
  )

  const playersWithPlayStyles =
    databasePlayers.filter(
      (
        player
      ) =>
        player.playStyles.length > 0
    )

  console.log(
    `✅ PlayStyles presentes em ${playersWithPlayStyles.length}/${databasePlayers.length}`
  )

  const rawPlayStyleNames =
    databasePlayers.flatMap(
      (
        player
      ) =>
        player.playStyles.filter(
          (
            playerPlayStyle
          ) =>
            playerPlayStyle
              .playStyle.name ===
            playerPlayStyle
              .playStyle.code
        )
    )

  if (
    rawPlayStyleNames.length > 0
  ) {
    console.warn(
      `⚠️ Foram encontrados ${rawPlayStyleNames.length} PlayStyles cujo nome ainda é igual ao code.`
    )
  } else {
    console.log(
      "✅ Nenhum PlayStyle novo está usando o code como nome."
    )
  }

  console.log(
    "\n✅ TESTE EM LOTE FINALIZADO."
  )
}

/* ========================================
   EXECUTAR
======================================== */

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "\n❌ TESTE EM LOTE FALHOU:"
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