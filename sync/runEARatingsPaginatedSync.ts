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

import type {
  NormalizedPlayer,
} from "../types/normalizedPlayer"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const BATCH_SIZE = 10
const TOTAL_BATCHES = 3
const START_OFFSET = 0

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔄 FUTSCOUT - EA RATINGS PAGINATED SYNC"
  )

  console.log(
    "========================================"
  )

  console.log(
    `📦 Tamanho do lote: ${BATCH_SIZE}`
  )

  console.log(
    `📚 Quantidade de lotes: ${TOTAL_BATCHES}`
  )

  console.log(
    `📍 Offset inicial: ${START_OFFSET}`
  )

  const provider =
    new EARatingsProvider()

  const globalResult = {
    batchesProcessed: 0,

    receivedFromEA: 0,

    mappingSuccess: 0,
    mappingFailed: 0,

    databaseProcessed: 0,
    databaseSuccess: 0,
    databaseFailed: 0,
  }

  /* ========================================
     LOOP DE LOTES
  ======================================== */

  for (
    let batchIndex = 0;
    batchIndex < TOTAL_BATCHES;
    batchIndex++
  ) {
    const offset =
      START_OFFSET +
      batchIndex * BATCH_SIZE

    console.log(
      "\n========================================"
    )

    console.log(
      `📦 LOTE ${batchIndex + 1}/${TOTAL_BATCHES}`
    )

    console.log(
      `📍 Offset: ${offset}`
    )

    console.log(
      "========================================"
    )

    /* ====================================
       BUSCAR NA EA
    ==================================== */

    const eaPlayers =
      await provider.getPlayers({
        limit: BATCH_SIZE,
        offset,
      })

    globalResult.batchesProcessed++

    globalResult.receivedFromEA +=
      eaPlayers.length

    console.log(
      `\n📥 ${eaPlayers.length} jogador(es) recebido(s)`
    )

    /*
      Se a EA devolver zero registros,
      provavelmente chegamos ao final.
    */

    if (
      eaPlayers.length === 0
    ) {
      console.log(
        "🏁 Nenhum jogador retornado. Encerrando paginação."
      )

      break
    }

    /* ====================================
       MAPEAR + NORMALIZAR
    ==================================== */

    const normalizedPlayers:
      NormalizedPlayer[] = []

    let batchMappingFailed = 0

    for (
      const eaPlayer
      of eaPlayers
    ) {
      try {
        const externalPlayer =
          mapEARatingsPlayer(
            eaPlayer
          )

        const normalizedPlayer =
          normalizePlayer(
            externalPlayer
          )

        normalizedPlayers.push(
          normalizedPlayer
        )

        globalResult.mappingSuccess++

        console.log(
          `✅ ${normalizedPlayer.name} | ${normalizedPlayer.position} | OVR ${normalizedPlayer.officialOverall}`
        )
      } catch (error) {
        batchMappingFailed++

        globalResult.mappingFailed++

        console.error(
          `❌ Erro ao mapear jogador EA ${eaPlayer.id}`
        )

        console.error(
          error
        )
      }
    }

    console.log(
      "\n📋 Normalização do lote:"
    )

    console.log({
      received:
        eaPlayers.length,

      normalized:
        normalizedPlayers.length,

      failed:
        batchMappingFailed,
    })

    /* ====================================
       SYNC POSTGRESQL
    ==================================== */

    if (
      normalizedPlayers.length > 0
    ) {
      console.log(
        "\n💾 Sincronizando lote com PostgreSQL..."
      )

      const syncResult =
        await syncPlayers(
          normalizedPlayers
        )

      globalResult.databaseProcessed +=
        syncResult.processed

      globalResult.databaseSuccess +=
        syncResult.success

      globalResult.databaseFailed +=
        syncResult.failed

      console.log(
        "\n📊 Resultado do banco neste lote:"
      )

      console.log(syncResult)
    }

    /* ====================================
       ÚLTIMA PÁGINA PARCIAL
    ==================================== */

    if (
      eaPlayers.length <
      BATCH_SIZE
    ) {
      console.log(
        "\n🏁 Lote parcial recebido. Provável fim da base."
      )

      break
    }
  }

  /* ========================================
     RESULTADO FINAL
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "✅ RESULTADO FINAL DA PAGINAÇÃO"
  )

  console.log(
    "========================================"
  )

  console.log(
    globalResult
  )
}

/* ========================================
   EXECUÇÃO
======================================== */

main().catch((error) => {
  console.error(
    "\n❌ Erro fatal na sincronização paginada:"
  )

  console.error(error)

  process.exit(1)
})