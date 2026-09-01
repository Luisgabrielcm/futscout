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
   CONFIGURAÇÃO DO TESTE
======================================== */

const LIMIT = 10
const OFFSET = 0

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔄 FUTSCOUT - EA RATINGS BATCH SYNC"
  )

  console.log(
    "========================================"
  )

  console.log(
    `\n📦 Lote: ${LIMIT} jogadores`
  )

  console.log(
    `📍 Offset: ${OFFSET}`
  )

  /* ========================================
     PROVIDER
  ======================================== */

  const provider =
    new EARatingsProvider()

  /* ========================================
     BUSCAR DADOS DA EA
  ======================================== */

  const eaPlayers =
    await provider.getPlayers({
      limit: LIMIT,
      offset: OFFSET,
    })

  console.log(
    `\n📥 ${eaPlayers.length} jogador(es) recebido(s) da EA`
  )

  if (eaPlayers.length === 0) {
    console.log(
      "⚠️ Nenhum jogador recebido."
    )

    return
  }

  /* ========================================
     MAPEAR + NORMALIZAR
  ======================================== */

  const normalizedPlayers:
    NormalizedPlayer[] = []

  let mappingFailed = 0

  console.log(
    "\n🧹 Mapeando e normalizando jogadores...\n"
  )

  for (const eaPlayer of eaPlayers) {
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

      console.log(
        `✅ ${normalizedPlayer.name}`
      )

      console.log(
        `   ID: ${normalizedPlayer.externalId}`
      )

      console.log(
        `   Posição: ${normalizedPlayer.position}`
      )

      console.log(
        `   OVR: ${normalizedPlayer.officialOverall}`
      )

      console.log(
        `   Clube: ${
          normalizedPlayer.club?.name ??
          "Sem clube"
        }`
      )

      console.log(
        ""
      )
    } catch (error) {
      mappingFailed++

      console.error(
        `❌ Erro ao mapear jogador EA ${eaPlayer.id}`
      )

      console.error(
        error
      )

      console.log("")
    }
  }

  /* ========================================
     RESUMO DA NORMALIZAÇÃO
  ======================================== */

  console.log(
    "========================================"
  )

  console.log(
    "📋 RESULTADO DA NORMALIZAÇÃO"
  )

  console.log(
    "========================================"
  )

  console.log({
    received:
      eaPlayers.length,

    normalized:
      normalizedPlayers.length,

    failed:
      mappingFailed,
  })

  /* ========================================
     NÃO TEM NADA PARA SINCRONIZAR
  ======================================== */

  if (
    normalizedPlayers.length === 0
  ) {
    console.log(
      "\n❌ Nenhum jogador pôde ser normalizado."
    )

    return
  }

  /* ========================================
     SINCRONIZAR COM POSTGRESQL
  ======================================== */

  console.log(
    "\n💾 Sincronizando com PostgreSQL...\n"
  )

  const syncResult =
    await syncPlayers(
      normalizedPlayers
    )

  /* ========================================
     RESULTADO FINAL
  ======================================== */

  console.log(
    "\n========================================"
  )

  console.log(
    "✅ RESULTADO FINAL"
  )

  console.log(
    "========================================"
  )

  console.log({
    receivedFromEA:
      eaPlayers.length,

    mappingSuccess:
      normalizedPlayers.length,

    mappingFailed,

    databaseProcessed:
      syncResult.processed,

    databaseSuccess:
      syncResult.success,

    databaseFailed:
      syncResult.failed,
  })
}

/* ========================================
   EXECUÇÃO
======================================== */

main().catch((error) => {
  console.error(
    "\n❌ Erro fatal no batch sync:"
  )

  console.error(error)

  process.exit(1)
})