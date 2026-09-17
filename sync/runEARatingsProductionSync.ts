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
  getOrCreateSyncState,
  markSyncCompleted,
  markSyncFailed,
  markSyncRunning,
  updateBatchSize,
  updateSyncOffset,
} from "./syncState"

import {
  registerSyncError,
  resolveSyncErrorsByExternalId,
} from "./syncError"

import type {
  NormalizedPlayer,
} from "../types/normalizedPlayer"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const PROVIDER =
  "ea-ratings"

const BATCH_SIZE =
  Number(
    process.env.EA_SYNC_BATCH_SIZE ??
    10
  )

const MAX_BATCHES_PER_RUN =
  Number(
    process.env.EA_SYNC_MAX_BATCHES ??
    5
  )

const REQUEST_DELAY_MS =
  Number(
    process.env.EA_SYNC_DELAY_MS ??
    1500
  )

const MAX_RETRIES =
  Number(
    process.env.EA_SYNC_MAX_RETRIES ??
    3
  )

const RETRY_DELAY_MS =
  Number(
    process.env
      .EA_SYNC_RETRY_DELAY_MS ??
    3000
  )

/* ========================================
   VALIDAR CONFIGURAÇÃO
======================================== */

function validateConfig() {
  if (
    !Number.isInteger(BATCH_SIZE) ||
    BATCH_SIZE <= 0
  ) {
    throw new Error(
      `EA_SYNC_BATCH_SIZE inválido: ${BATCH_SIZE}`
    )
  }

  if (
    !Number.isInteger(
      MAX_BATCHES_PER_RUN
    ) ||
    MAX_BATCHES_PER_RUN <= 0
  ) {
    throw new Error(
      `EA_SYNC_MAX_BATCHES inválido: ${MAX_BATCHES_PER_RUN}`
    )
  }

  if (
    !Number.isFinite(
      REQUEST_DELAY_MS
    ) ||
    REQUEST_DELAY_MS < 0
  ) {
    throw new Error(
      `EA_SYNC_DELAY_MS inválido: ${REQUEST_DELAY_MS}`
    )
  }

  if (
    !Number.isInteger(
      MAX_RETRIES
    ) ||
    MAX_RETRIES <= 0
  ) {
    throw new Error(
      `EA_SYNC_MAX_RETRIES inválido: ${MAX_RETRIES}`
    )
  }

  if (
    !Number.isFinite(
      RETRY_DELAY_MS
    ) ||
    RETRY_DELAY_MS < 0
  ) {
    throw new Error(
      `EA_SYNC_RETRY_DELAY_MS inválido: ${RETRY_DELAY_MS}`
    )
  }
}

/* ========================================
   DELAY
======================================== */

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      )
    }
  )
}

/* ========================================
   FORMATAR PROGRESSO
======================================== */

function calculateProgress(
  current: number,
  total: number
) {
  if (total <= 0) {
    return "0.00"
  }

  return (
    (current / total) *
    100
  ).toFixed(2)
}

/* ========================================
   BUSCAR LOTE COM RETRY
======================================== */

async function fetchBatchWithRetry(
  provider: EARatingsProvider,
  limit: number,
  offset: number
) {
  let lastError: unknown

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `🌐 Tentativa ${attempt}/${MAX_RETRIES}`
      )

      return await provider.getPlayersBatch({
        limit,
        offset,
      })
    } catch (error) {
      lastError =
        error

      console.error(
        `❌ Falha ao consultar EA no offset ${offset}`
      )

      console.error(
        error
      )

      if (
        attempt < MAX_RETRIES
      ) {
        console.log(
          `⏳ Aguardando ${RETRY_DELAY_MS}ms para tentar novamente...`
        )

        await sleep(
          RETRY_DELAY_MS
        )
      }
    }
  }

  const finalError =
    lastError ??
    new Error(
      "Falha desconhecida no provider EA"
    )

  await registerSyncError({
    provider:
      PROVIDER,

    offset,

    stage:
      "provider",

    error:
      finalError,

    payload: {
      limit,
      offset,
    },
  })

  throw finalError
}

/* ========================================
   MAIN
======================================== */

async function main() {
  validateConfig()

  console.log(
    "========================================"
  )

  console.log(
    "🚀 FUTSCOUT - EA RATINGS PRODUCTION SYNC"
  )

  console.log(
    "========================================"
  )

  console.log(
    "\n⚙️ Configuração:"
  )

  console.log({
    batchSize:
      BATCH_SIZE,

    maxBatches:
      MAX_BATCHES_PER_RUN,

    maxPlayersThisRun:
      BATCH_SIZE *
      MAX_BATCHES_PER_RUN,

    requestDelayMs:
      REQUEST_DELAY_MS,

    maxRetries:
      MAX_RETRIES,

    retryDelayMs:
      RETRY_DELAY_MS,
  })

  /* ========================================
     SYNC STATE
  ======================================== */

  const syncState =
    await getOrCreateSyncState()

  let currentOffset =
    syncState.offset

  const batchSize =
    BATCH_SIZE

  if (
    syncState.batchSize !==
    batchSize
  ) {
    await updateBatchSize(
      batchSize
    )

    console.log(
      `🔧 Batch size atualizado no SyncState: ${batchSize}`
    )
  }

  console.log(
    "\n📍 Estado atual:"
  )

  console.log({
    key:
      syncState.key,

    offset:
      currentOffset,

    batchSize,

    status:
      syncState.status,

    lastSuccessAt:
      syncState.lastSuccessAt,

    lastError:
      syncState.lastError,
  })

  await markSyncRunning()

  const provider =
    new EARatingsProvider()

  /* ========================================
     RESULTADO DA EXECUÇÃO
  ======================================== */

  const runResult = {
    batchesProcessed: 0,

    receivedFromEA: 0,

    mappingSuccess: 0,

    mappingFailed: 0,

    databaseProcessed: 0,

    databaseSuccess: 0,

    databaseFailed: 0,
  }

  let totalItems = 0

  /* ========================================
     LOOP DE LOTES
  ======================================== */

  for (
    let batchIndex = 0;
    batchIndex <
    MAX_BATCHES_PER_RUN;
    batchIndex++
  ) {
    console.log(
      "\n========================================"
    )

    console.log(
      `📦 LOTE ${
        batchIndex + 1
      }/${MAX_BATCHES_PER_RUN}`
    )

    console.log(
      `📍 Offset: ${currentOffset}`
    )

    console.log(
      `📏 Limit: ${batchSize}`
    )

    console.log(
      "========================================"
    )

    /* ====================================
       BUSCAR NA EA
    ==================================== */

    const batch =
      await fetchBatchWithRetry(
        provider,
        batchSize,
        currentOffset
      )

    const eaPlayers =
      batch.players

    totalItems =
      batch.totalItems

    runResult.batchesProcessed++

    runResult.receivedFromEA +=
      eaPlayers.length

    console.log(
      `📥 ${eaPlayers.length} jogador(es) recebido(s)`
    )

    /* ====================================
       PROGRESSO ATUAL
    ==================================== */

    console.log(
      `📊 Progresso atual: ${currentOffset} / ${totalItems} (${calculateProgress(
        currentOffset,
        totalItems
      )}%)`
    )

    /* ====================================
       FIM DA BASE
    ==================================== */

    if (
      eaPlayers.length === 0
    ) {
      console.log(
        "🏁 Nenhum jogador recebido. Fim da base."
      )

      await markSyncCompleted()

      break
    }

    /* ====================================
       MAPEAR / NORMALIZAR
    ==================================== */

    const normalizedPlayers:
      NormalizedPlayer[] = []

    let batchMappingFailed = 0

    for (
      const eaPlayer
      of eaPlayers
    ) {
      const externalId =
        String(
          eaPlayer.id
        )

      let externalPlayer

      /* ==================================
         MAPPER
      ================================== */

      try {
        externalPlayer =
          mapEARatingsPlayer(
            eaPlayer
          )
      } catch (error) {
        batchMappingFailed++

        runResult.mappingFailed++

        console.error(
          `❌ Mapper falhou para EA Player ${externalId}`
        )

        console.error(
          error
        )

        await registerSyncError({
          provider:
            PROVIDER,

          externalId,

          offset:
            currentOffset,

          stage:
            "mapper",

          error,

          payload:
            eaPlayer,
        })

        continue
      }

      /* ==================================
         NORMALIZER
      ================================== */

      try {
        const normalizedPlayer =
          normalizePlayer(
            externalPlayer
          )

        normalizedPlayers.push(
          normalizedPlayer
        )

        runResult.mappingSuccess++

        console.log(
          `✅ ${normalizedPlayer.name} | ${normalizedPlayer.position} | OVR ${normalizedPlayer.officialOverall}`
        )
      } catch (error) {
        batchMappingFailed++

        runResult.mappingFailed++

        console.error(
          `❌ Normalizer falhou para EA Player ${externalId}`
        )

        console.error(
          error
        )

        await registerSyncError({
          provider:
            PROVIDER,

          externalId,

          offset:
            currentOffset,

          stage:
            "normalizer",

          error,

          payload:
            eaPlayer,
        })
      }
    }

    /* ====================================
       BLOQUEAR CHECKPOINT EM ERRO
    ==================================== */

    if (
      batchMappingFailed > 0
    ) {
      const error =
        new Error(
          `Offset ${currentOffset}: ${batchMappingFailed} falha(s) de mapper/normalizer. Checkpoint não avançou.`
        )

      await markSyncFailed(
        error
      )

      throw error
    }

    /* ====================================
       POSTGRESQL
    ==================================== */

    console.log(
      "\n💾 Sincronizando PostgreSQL..."
    )

    const syncResult =
      await syncPlayers(
        normalizedPlayers,
        {
          provenance:
            batch.provenance,

          onError:
            async ({
              player,
              error,
            }) => {
              await registerSyncError({
                provider:
                  PROVIDER,

                externalId:
                  player.externalId,

                offset:
                  currentOffset,

                stage:
                  "database",

                error,

                payload:
                  player,
              })
            },
        }
      )

    runResult.databaseProcessed +=
      syncResult.processed

    runResult.databaseSuccess +=
      syncResult.success

    runResult.databaseFailed +=
      syncResult.failed

    /* ====================================
       BLOQUEAR CHECKPOINT EM ERRO NO BANCO
    ==================================== */

    if (
      syncResult.failed > 0 ||
      syncResult.success !==
        normalizedPlayers.length
    ) {
      const error =
        new Error(
          `Offset ${currentOffset}: ${syncResult.failed} falha(s) no PostgreSQL. Checkpoint não avançou.`
        )

      await markSyncFailed(
        error
      )

      throw error
    }

    /* ====================================
       RESOLVER ERROS ANTIGOS
    ==================================== */

    for (
      const player
      of normalizedPlayers
    ) {
      await resolveSyncErrorsByExternalId(
        PROVIDER,
        player.externalId
      )
    }

    /* ====================================
       CHECKPOINT
    ==================================== */

    const nextOffset =
      currentOffset +
      eaPlayers.length

    await updateSyncOffset(
      nextOffset
    )

    currentOffset =
      nextOffset

    const progress =
      calculateProgress(
        currentOffset,
        totalItems
      )

    const remaining =
      Math.max(
        totalItems -
          currentOffset,
        0
      )

    console.log(
      `💾 Checkpoint atualizado: ${currentOffset}`
    )

    console.log(
      `📊 Progresso global: ${currentOffset} / ${totalItems} (${progress}%)`
    )

    console.log(
      `⏳ Restantes: ${remaining}`
    )

    /* ====================================
       ÚLTIMO LOTE
    ==================================== */

    if (
      eaPlayers.length <
      batchSize
    ) {
      console.log(
        "🏁 Último lote da EA detectado."
      )

      await markSyncCompleted()

      break
    }

    /* ====================================
       DELAY
    ==================================== */

    if (
      batchIndex <
      MAX_BATCHES_PER_RUN - 1
    ) {
      console.log(
        `⏳ Aguardando ${REQUEST_DELAY_MS}ms antes do próximo lote...`
      )

      await sleep(
        REQUEST_DELAY_MS
      )
    }
  }

  /* ========================================
     RESULTADO FINAL
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 RESULTADO DESTA EXECUÇÃO"
  )

  console.log(
    "========================================"
  )

  console.log(
    runResult
  )

  console.log(
    "\n🌍 PROGRESSO GLOBAL"
  )

  console.log({
    synchronized:
      currentOffset,

    total:
      totalItems,

    percentage:
      `${calculateProgress(
        currentOffset,
        totalItems
      )}%`,

    remaining:
      Math.max(
        totalItems -
          currentOffset,
        0
      ),
  })
}

/* ========================================
   EXECUÇÃO
======================================== */

main()
  .catch(
    async (error) => {
      console.error(
        "\n❌ Falha fatal na sincronização:"
      )

      console.error(
        error
      )

      try {
        await markSyncFailed(
          error
        )
      } catch (
        stateError
      ) {
        console.error(
          "❌ Também não foi possível atualizar SyncState:"
        )

        console.error(
          stateError
        )
      }

      process.exit(1)
    }
  )
