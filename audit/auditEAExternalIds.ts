import "dotenv/config"

import {
    EARatingsProvider,
} from "../providers/eaRatingsProvider"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const BATCH_SIZE =
  Number(
    process.env.EA_AUDIT_BATCH_SIZE ??
    100
  )

const REQUEST_DELAY_MS =
  Number(
    process.env.EA_AUDIT_DELAY_MS ??
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
   BUSCAR LOTE
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
        `❌ EA falhou no offset ${offset} | tentativa ${attempt}/${MAX_RETRIES}`
      )

      if (
        attempt < MAX_RETRIES
      ) {
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
   TIPOS DA AUDITORIA
======================================== */

type PlayerOccurrence = {
  externalId: string
  name: string
  offsets: number[]
  occurrences: number
}

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔎 FUTSCOUT - AUDITORIA EA EXTERNAL IDS"
  )

  console.log(
    "========================================"
  )

  console.log(
    "\n⚠️ MODO SOMENTE LEITURA"
  )

  console.log(
    "Nenhum dado será gravado no PostgreSQL.\n"
  )

  const provider =
    new EARatingsProvider()

  /*
    Guarda todos os IDs encontrados.

    Map:
    externalId → informações
  */

  const players =
    new Map<
      string,
      PlayerOccurrence
    >()

  let offset = 0

  let totalItems = 0

  let totalReceived = 0

  let batchesProcessed = 0

  /* ========================================
     PAGINAÇÃO
  ======================================== */

  while (true) {
    console.log(
      `📦 Offset ${offset}`
    )

    const batch =
      await fetchBatchWithRetry(
        provider,
        BATCH_SIZE,
        offset
      )

    const eaPlayers =
      batch.players

    totalItems =
      batch.totalItems

    batchesProcessed++

    totalReceived +=
      eaPlayers.length

    console.log(
      `   Recebidos: ${eaPlayers.length}`
    )

    console.log(
      `   Progresso: ${totalReceived}/${totalItems}`
    )

    /* ======================================
       CONTABILIZAR IDS
    ====================================== */

    for (
      const eaPlayer
      of eaPlayers
    ) {
      const externalId =
        String(
          eaPlayer.id
        )

      /*
        O nome é apenas para facilitar
        a leitura do relatório.

        Se o provider não tiver shortName,
        usamos longName e depois externalId.
      */

      const rawPlayer =
        eaPlayer as unknown as {
          shortName?: string
          longName?: string
          name?: string
        }

      const name =
        rawPlayer.shortName ??
        rawPlayer.longName ??
        rawPlayer.name ??
        externalId

      const existing =
        players.get(
          externalId
        )

      if (existing) {
        existing.occurrences++

        existing.offsets.push(
          offset
        )
      } else {
        players.set(
          externalId,
          {
            externalId,
            name,
            offsets: [
              offset,
            ],
            occurrences: 1,
          }
        )
      }
    }

    /* ======================================
       FIM
    ====================================== */

    if (
      eaPlayers.length === 0
    ) {
      break
    }

    offset +=
      eaPlayers.length

    if (
      eaPlayers.length <
      BATCH_SIZE
    ) {
      break
    }

    await sleep(
      REQUEST_DELAY_MS
    )
  }

  /* ========================================
     DUPLICADOS
  ======================================== */

  const duplicates =
    Array.from(
      players.values()
    )
      .filter(
        (player) =>
          player.occurrences > 1
      )
      .sort(
        (a, b) =>
          b.occurrences -
          a.occurrences
      )

  /*
    Importante:

    quantidade de IDs que aparecem mais
    de uma vez NÃO é necessariamente igual
    à quantidade de ocorrências extras.

    Exemplo:

    jogador aparece 3 vezes
    → 1 ID duplicado
    → 2 ocorrências extras
  */

  const duplicateOccurrences =
    duplicates.reduce(
      (
        total,
        player
      ) =>
        total +
        (
          player.occurrences -
          1
        ),
      0
    )

  /* ========================================
     RESULTADO
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 RESULTADO DA AUDITORIA"
  )

  console.log(
    "========================================"
  )

  console.log({
    eaTotalItems:
      totalItems,

    batchesProcessed,

    totalReceived,

    uniqueExternalIds:
      players.size,

    duplicatedExternalIds:
      duplicates.length,

    duplicateOccurrences,
  })

  /* ========================================
     VALIDAÇÕES
  ======================================== */

  console.log(
    "\n🔍 VALIDAÇÕES"
  )

  console.log({
    receivedMatchesEATotal:
      totalReceived ===
      totalItems,

    uniquePlusDuplicatesMatchesReceived:
      players.size +
        duplicateOccurrences ===
      totalReceived,
  })

  /* ========================================
     LISTAR DUPLICADOS
  ======================================== */

  if (
    duplicates.length === 0
  ) {
    console.log(
      "\n✅ Nenhum externalId duplicado encontrado na paginação."
    )
  } else {
    console.log(
      `\n⚠️ ${duplicates.length} externalId(s) apareceram mais de uma vez:`
    )

    for (
      const player
      of duplicates
    ) {
      console.log(
        "----------------------------------------"
      )

      console.log(
        `EA ID: ${player.externalId}`
      )

      console.log(
        `Nome: ${player.name}`
      )

      console.log(
        `Ocorrências: ${player.occurrences}`
      )

      console.log(
        `Offsets: ${player.offsets.join(
          ", "
        )}`
      )
    }
  }

  /* ========================================
     COMPARAÇÃO ESPERADA COM FUTSCOUT
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "🎯 COMPARAÇÃO COM A BASE FUTSCOUT"
  )

  console.log(
    "========================================"
  )

  console.log(
    `EA informou: ${totalItems}`
  )

  console.log(
    `EA entregue pela paginação: ${totalReceived}`
  )

  console.log(
    `Jogadores EA únicos: ${players.size}`
  )

  console.log(
    `Ocorrências repetidas: ${duplicateOccurrences}`
  )

  console.log(
    "\nAuditoria concluída."
  )
}

/* ========================================
   EXECUÇÃO
======================================== */

main()
  .catch(
    (error) => {
      console.error(
        "\n❌ Falha na auditoria:"
      )

      console.error(
        error
      )

      process.exit(1)
    }
  )