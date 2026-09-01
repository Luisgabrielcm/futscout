import "dotenv/config"

import {
    getOrCreateSyncState,
    resetSyncState,
} from "../sync/syncState"

import {
    prisma,
} from "../lib/prisma"

/* ========================================
   RESET DO CHECKPOINT EA
======================================== */

async function main() {
  console.log(
    "========================================"
  )

  console.log(
    "🔄 FUTSCOUT - RESET EA SYNC"
  )

  console.log(
    "========================================"
  )

  /* ========================================
     ESTADO ANTES
  ======================================== */

  const before =
    await getOrCreateSyncState()

  console.log(
    "\n📍 Estado antes do reset:"
  )

  console.log({
    offset:
      before.offset,

    batchSize:
      before.batchSize,

    status:
      before.status,

    lastSuccessAt:
      before.lastSuccessAt,

    lastError:
      before.lastError,
  })

  /* ========================================
     RESET
  ======================================== */

  console.log(
    "\n🔄 Resetando checkpoint..."
  )

  await resetSyncState()

  /* ========================================
     ESTADO DEPOIS
  ======================================== */

  const after =
    await getOrCreateSyncState()

  console.log(
    "\n📍 Estado depois do reset:"
  )

  console.log({
    offset:
      after.offset,

    batchSize:
      after.batchSize,

    status:
      after.status,

    lastSuccessAt:
      after.lastSuccessAt,

    lastError:
      after.lastError,
  })

  /* ========================================
     VALIDAÇÃO
  ======================================== */

  if (
    after.offset !== 0
  ) {
    throw new Error(
      `Reset falhou. Offset atual: ${after.offset}`
    )
  }

  if (
    after.status !== "idle"
  ) {
    throw new Error(
      `Reset falhou. Status atual: ${after.status}`
    )
  }

  console.log(
    "\n✅ CHECKPOINT RESETADO COM SUCESSO."
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
        "\n❌ ERRO AO RESETAR:"
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