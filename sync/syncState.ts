import {
  prisma,
} from "../lib/prisma"

import {
  databaseRetry,
} from "../lib/databaseRetry"

/* ========================================
   CONFIGURAÇÃO
======================================== */

export const EA_RATINGS_SYNC_KEY =
  "ea-ratings-players"

const DEFAULT_BATCH_SIZE = 10

/* ========================================
   BUSCAR OU CRIAR ESTADO
======================================== */

export async function getOrCreateSyncState() {
  return databaseRetry(
    () =>
      prisma.syncState.upsert({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        update: {},

        create: {
          key:
            EA_RATINGS_SYNC_KEY,

          offset: 0,

          batchSize:
            DEFAULT_BATCH_SIZE,

          status:
            "idle",
        },
      }),

    "Buscar/criar SyncState EA Ratings"
  )
}

/* ========================================
   MARCAR COMO RUNNING
======================================== */

export async function markSyncRunning() {
  return databaseRetry(
    () =>
      prisma.syncState.update({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        data: {
          status:
            "running",

          lastError:
            null,
        },
      }),

    "Marcar SyncState como running"
  )
}

/* ========================================
   ATUALIZAR CHECKPOINT
======================================== */

export async function updateSyncOffset(
  offset: number
) {
  return databaseRetry(
    () =>
      prisma.syncState.update({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        data: {
          offset,

          lastSuccessAt:
            new Date(),

          status:
            "running",

          lastError:
            null,
        },
      }),

    `Atualizar checkpoint para offset ${offset}`
  )
}

/* ========================================
   ATUALIZAR BATCH SIZE
======================================== */

export async function updateBatchSize(
  batchSize: number
) {
  return databaseRetry(
    () =>
      prisma.syncState.update({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        data: {
          batchSize,
        },
      }),

    `Atualizar batchSize para ${batchSize}`
  )
}

/* ========================================
   MARCAR COMO COMPLETO
======================================== */

export async function markSyncCompleted() {
  return databaseRetry(
    () =>
      prisma.syncState.update({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        data: {
          status:
            "completed",

          lastSuccessAt:
            new Date(),

          lastError:
            null,
        },
      }),

    "Marcar SyncState como completed"
  )
}

/* ========================================
   MARCAR COMO FALHA
======================================== */

export async function markSyncFailed(
  error: unknown
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error)

  return databaseRetry(
    () =>
      prisma.syncState.update({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        data: {
          status:
            "failed",

          lastError:
            message.slice(
              0,
              5000
            ),
        },
      }),

    "Marcar SyncState como failed"
  )
}

/* ========================================
   RESETAR CHECKPOINT
======================================== */

export async function resetSyncState() {
  return databaseRetry(
    () =>
      prisma.syncState.upsert({
        where: {
          key:
            EA_RATINGS_SYNC_KEY,
        },

        update: {
          offset: 0,

          status:
            "idle",

          lastError:
            null,
        },

        create: {
          key:
            EA_RATINGS_SYNC_KEY,

          offset: 0,

          batchSize:
            DEFAULT_BATCH_SIZE,

          status:
            "idle",
        },
      }),

    "Resetar SyncState EA Ratings"
  )
}