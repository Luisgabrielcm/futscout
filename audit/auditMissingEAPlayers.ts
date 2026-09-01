import "dotenv/config"

import {
    EARatingsProvider,
} from "../providers/eaRatingsProvider"

import {
    prisma,
} from "../lib/prisma"

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
   TIPOS
======================================== */

type EAPlayerReference = {
  externalId: string
  name: string
  offset: number
}

type MissingPlayer = {
  externalId: string
  name: string
  offset: number
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
   NOME DO JOGADOR
======================================== */

function getPlayerName(
  player: unknown
) {
  const raw =
    player as {
      commonName?: string | null
      firstName?: string | null
      lastName?: string | null
      shortName?: string | null
      longName?: string | null
      name?: string | null
      id?: number | string
    }

  if (
    raw.commonName &&
    raw.commonName.trim()
  ) {
    return raw.commonName.trim()
  }

  const fullName =
    [
      raw.firstName,
      raw.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

  if (fullName) {
    return fullName
  }

  return (
    raw.shortName ??
    raw.longName ??
    raw.name ??
    String(raw.id ?? "Desconhecido")
  )
}

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔎 FUTSCOUT - AUDITORIA DE JOGADORES AUSENTES"
  )

  console.log(
    "========================================"
  )

  console.log(
    "\n⚠️ MODO SOMENTE LEITURA"
  )

  console.log(
    "Nenhum jogador será criado, atualizado ou apagado.\n"
  )

  const provider =
    new EARatingsProvider()

  /* ========================================
     1. BUSCAR TODOS OS IDS DA EA
  ======================================== */

  const eaPlayers =
    new Map<
      string,
      EAPlayerReference
    >()

  let offset = 0

  let totalItems = 0

  let totalReceived = 0

  while (true) {
    console.log(
      `📦 EA offset ${offset}`
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

      /*
        A auditoria anterior confirmou
        que os externalIds da EA são únicos.
      */

      eaPlayers.set(
        externalId,
        {
          externalId,

          name:
            getPlayerName(
              player
            ),

          offset,
        }
      )
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

  /* ========================================
     2. BUSCAR IDS EXISTENTES NO POSTGRESQL
  ======================================== */

  console.log(
    "\n💾 Consultando jogadores existentes no PostgreSQL..."
  )

  const databasePlayers =
    await prisma.player.findMany({
      where: {
        externalId: {
          not: null,
        },
      },

      select: {
        externalId: true,
      },
    })

  const databaseIds =
    new Set<string>()

  for (
    const player
    of databasePlayers
  ) {
    if (
      player.externalId
    ) {
      databaseIds.add(
        player.externalId
      )
    }
  }

  /* ========================================
     3. ENCONTRAR AUSENTES
  ======================================== */

  const missingPlayers:
    MissingPlayer[] = []

  for (
    const player
    of eaPlayers.values()
  ) {
    if (
      !databaseIds.has(
        player.externalId
      )
    ) {
      missingPlayers.push(
        {
          externalId:
            player.externalId,

          name:
            player.name,

          offset:
            player.offset,
        }
      )
    }
  }

  missingPlayers.sort(
    (a, b) =>
      a.offset -
      b.offset
  )

  /* ========================================
     4. DISTRIBUIÇÃO POR FAIXA
  ======================================== */

  const distribution =
    new Map<
      string,
      number
    >()

  for (
    const player
    of missingPlayers
  ) {
    const start =
      Math.floor(
        player.offset /
        1000
      ) *
      1000

    const end =
      start +
      999

    const key =
      `${start}-${end}`

    distribution.set(
      key,
      (
        distribution.get(
          key
        ) ??
        0
      ) +
        1
    )
  }

  /* ========================================
     RESULTADO
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "📊 RECONCILIAÇÃO EA × FUTSCOUT"
  )

  console.log(
    "========================================"
  )

  console.log({
    eaTotalItems:
      totalItems,

    eaUniquePlayers:
      eaPlayers.size,

    databaseExternalIds:
      databaseIds.size,

    missing:
      missingPlayers.length,
  })

  /* ========================================
     DISTRIBUIÇÃO
  ======================================== */

  console.log(
    "\n📍 DISTRIBUIÇÃO DOS AUSENTES"
  )

  if (
    distribution.size === 0
  ) {
    console.log(
      "✅ Nenhum jogador ausente."
    )
  } else {
    for (
      const [
        range,
        count,
      ]
      of distribution
    ) {
      console.log(
        `${range}: ${count}`
      )
    }
  }

  /* ========================================
     LISTA COMPLETA
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    `❌ JOGADORES AUSENTES: ${missingPlayers.length}`
  )

  console.log(
    "========================================"
  )

  for (
    const player
    of missingPlayers
  ) {
    console.log(
      `${player.externalId} | ${player.name} | offset ${player.offset}`
    )
  }

  /* ========================================
     VALIDAÇÃO FINAL
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "🔍 VALIDAÇÃO"
  )

  console.log(
    "========================================"
  )

  console.log({
    expectedDifference:
      eaPlayers.size -
      databaseIds.size,

    actualMissing:
      missingPlayers.length,

    matches:
      eaPlayers.size -
        databaseIds.size ===
      missingPlayers.length,
  })

  console.log(
    "\n✅ Auditoria concluída."
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