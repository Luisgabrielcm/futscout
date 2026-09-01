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

import {
  databaseRetry,
} from "../lib/databaseRetry"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const BATCH_SIZE =
  Number(
    process.env.EA_REPAIR_BATCH_SIZE ??
    100
  )

const REQUEST_DELAY_MS =
  Number(
    process.env.EA_REPAIR_DELAY_MS ??
    500
  )

const MAX_RETRIES =
  Number(
    process.env.EA_SYNC_MAX_RETRIES ??
    3
  )

const RETRY_DELAY_MS =
  Number(
    process.env.EA_SYNC_RETRY_DELAY_MS ??
    3000
  )

/* ========================================
   TIPOS
======================================== */

type MissingEAPlayer = {
  externalId: string
  rawPlayer: unknown
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
      return await provider.getPlayersBatch({
        limit,
        offset,
      })
    } catch (error) {
      lastError =
        error

      console.error(
        `❌ Falha EA no offset ${offset} | tentativa ${attempt}/${MAX_RETRIES}`
      )

      if (
        attempt < MAX_RETRIES
      ) {
        console.log(
          `⏳ Aguardando ${RETRY_DELAY_MS}ms...`
        )

        await sleep(
          RETRY_DELAY_MS
        )
      }
    }
  }

  throw (
    lastError ??
    new Error(
      `Falha desconhecida no offset ${offset}`
    )
  )
}

/* ========================================
   BUSCAR IDS EXISTENTES NO BANCO
======================================== */

async function getDatabaseExternalIds() {
  const players =
    await databaseRetry(
      () =>
        prisma.player.findMany({
          where: {
            externalId: {
              not: null,
            },
          },

          select: {
            externalId: true,
          },
        }),

      "Carregar externalIds existentes"
    )

  const ids =
    new Set<string>()

  for (
    const player
    of players
  ) {
    if (
      player.externalId
    ) {
      ids.add(
        player.externalId
      )
    }
  }

  return ids
}

/* ========================================
   DESCOBRIR JOGADORES AUSENTES
======================================== */

async function findMissingPlayers(
  provider: EARatingsProvider,
  databaseIds: Set<string>
) {
  const missingPlayers:
    MissingEAPlayer[] = []

  let offset = 0
  let totalItems = 0
  let totalReceived = 0

  while (true) {
    console.log(
      `📦 Verificando EA offset ${offset}`
    )

    const batch =
      await fetchBatchWithRetry(
        provider,
        BATCH_SIZE,
        offset
      )

    totalItems =
      batch.totalItems

    totalReceived +=
      batch.players.length

    for (
      const player
      of batch.players
    ) {
      const externalId =
        String(
          player.id
        )

      if (
        !databaseIds.has(
          externalId
        )
      ) {
        missingPlayers.push({
          externalId,
          rawPlayer:
            player,
        })
      }
    }

    console.log(
      `   EA: ${totalReceived}/${totalItems}`
    )

    if (
      batch.players.length === 0
    ) {
      break
    }

    offset +=
      batch.players.length

    if (
      batch.players.length <
      BATCH_SIZE
    ) {
      break
    }

    await sleep(
      REQUEST_DELAY_MS
    )
  }

  return {
    missingPlayers,
    totalItems,
  }
}

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🛠 FUTSCOUT - REPAIR MISSING EA PLAYERS"
  )

  console.log(
    "========================================"
  )

  console.log(
    "\n⚠️ Este script NÃO altera o SyncState principal."
  )

  console.log(
    "Ele repara somente jogadores EA que ainda não existem no banco.\n"
  )

  const provider =
    new EARatingsProvider()

  /* ========================================
     1. IDS EXISTENTES
  ======================================== */

  console.log(
    "💾 Carregando externalIds existentes..."
  )

  const databaseIds =
    await getDatabaseExternalIds()

  console.log(
    `✅ ${databaseIds.size} jogador(es) EA já existem no PostgreSQL`
  )

  /* ========================================
     2. AUSENTES
  ======================================== */

  console.log(
    "\n🔎 Procurando jogadores ausentes..."
  )

  const {
    missingPlayers,
    totalItems,
  } =
    await findMissingPlayers(
      provider,
      databaseIds
    )

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 DIAGNÓSTICO"
  )

  console.log(
    "========================================"
  )

  console.log({
    eaTotal:
      totalItems,

    databaseEA:
      databaseIds.size,

    missing:
      missingPlayers.length,
  })

  /* ========================================
     NENHUM AUSENTE
  ======================================== */

  if (
    missingPlayers.length === 0
  ) {
    console.log(
      "\n✅ Nenhum jogador ausente. Nada para reparar."
    )

    return
  }

  /* ========================================
     3. REPARAR
  ======================================== */

  console.log(
    `\n🛠 Reparando ${missingPlayers.length} jogador(es)...`
  )

  const result = {
    processed: 0,
    repaired: 0,
    failed: 0,
  }

  for (
    const item
    of missingPlayers
  ) {
    result.processed++

    try {
      const externalPlayer =
        mapEARatingsPlayer(
          item.rawPlayer as never
        )

      const normalizedPlayer =
        normalizePlayer(
          externalPlayer
        )

      await syncPlayer(
        normalizedPlayer
      )

      result.repaired++

      console.log(
        `✅ ${normalizedPlayer.name} reparado | ${item.externalId}`
      )
    } catch (error) {
      result.failed++

      console.error(
        `❌ Falha ao reparar EA ${item.externalId}`
      )

      console.error(
        error
      )
    }
  }

  /* ========================================
     4. RECONTAR
  ======================================== */

  console.log(
    "\n💾 Recontando jogadores EA..."
  )

  const finalDatabaseIds =
    await getDatabaseExternalIds()

  const remaining =
    Math.max(
      totalItems -
        finalDatabaseIds.size,
      0
    )

  /* ========================================
     RESULTADO FINAL
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 RESULTADO DO REPARO"
  )

  console.log(
    "========================================"
  )

  console.log({
    processed:
      result.processed,

    repaired:
      result.repaired,

    failed:
      result.failed,

    databaseEA:
      finalDatabaseIds.size,

    eaTotal:
      totalItems,

    remaining,
  })

  if (
    remaining === 0
  ) {
    console.log(
      "\n🎯 Base EA reconciliada completamente."
    )
  } else {
    console.log(
      `\n⚠️ Ainda existem ${remaining} jogador(es) ausentes.`
    )

    console.log(
      "O script pode ser executado novamente com segurança."
    )
  }
}

/* ========================================
   EXECUÇÃO
======================================== */

main()
  .catch(
    (error) => {
      console.error(
        "\n❌ Falha fatal no repair:"
      )

      console.error(
        error
      )

      process.exit(1)
    }
  )