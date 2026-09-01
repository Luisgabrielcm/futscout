import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    syncApiFootballPlayerMatches,
} from "../services/syncApiFootballPlayerMatches"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const BATCH_SIZE = 10
const SEASON = 2024

/* ========================================
   MAIN
======================================== */

async function main() {
  console.log(
    "\n========================================"
  )

  console.log(
    "FUTSCOUT - API-FOOTBALL PLAYER SYNC"
  )

  console.log(
    "========================================"
  )

  console.log({
    batchSize:
      BATCH_SIZE,

    season:
      SEASON,
  })

  const result =
    await syncApiFootballPlayerMatches({
      batchSize:
        BATCH_SIZE,

      season:
        SEASON,
    })

  console.log(
    "\n========================================"
  )

  console.log(
    "RESUMO DO LOTE"
  )

  console.log(
    "========================================"
  )

  console.log({
    selecionados:
      result.selected,

    processados:
      result.processed,

    salvos:
      result.saved,

    matchForteNaoSalvo:
      result.strongNotSaved,

    revisar:
      result.review,

    matchFraco:
      result.weak,

    naoResolvido:
      result.notResolved,

    conflitos:
      result.conflicts,

    erros:
      result.errors,

    rateLimited:
      result.rateLimited,

    status:
      result.status,

    progressoSalvo:
      result.nextOffset,
    
    jogadoresElegiveisRestantes:
      result.remainingEligible,
  })

  if (
    result.rateLimited
  ) {
    console.log(
      "\n⏸ Sincronização pausada por limite da API."
    )
  } else {
    console.log(
      "\n✅ Lote finalizado."
    )
  }

  console.log(
    "\n========================================"
  )
}

main()
  .catch(
    (error) => {
      console.error(
        "Erro geral:",
        error
      )

      process.exitCode = 1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )