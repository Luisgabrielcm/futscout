import {
  prisma,
} from "../lib/prisma"

import {
  databaseRetry,
} from "../lib/databaseRetry"

/* ========================================
   TIPOS
======================================== */

export type SyncErrorStage =
  | "provider"
  | "mapper"
  | "normalizer"
  | "database"

export type RegisterSyncErrorInput = {
  provider: string

  externalId?: string

  offset?: number

  stage: SyncErrorStage

  error: unknown

  payload?: unknown
}

/* ========================================
   NORMALIZAR MENSAGEM DE ERRO
======================================== */

function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/* ========================================
   NORMALIZAR STACK TRACE
======================================== */

function getErrorStack(
  error: unknown
): string | undefined {
  if (
    error instanceof Error &&
    error.stack
  ) {
    return error.stack
  }

  return undefined
}

/* ========================================
   CONVERTER PAYLOAD PARA JSON SEGURO
======================================== */

function toSafeJson(
  payload: unknown
) {
  if (
    payload === undefined ||
    payload === null
  ) {
    return undefined
  }

  try {
    return JSON.parse(
      JSON.stringify(
        payload
      )
    )
  } catch {
    return {
      unserializable:
        true,

      value:
        String(payload),
    }
  }
}

/* ========================================
   REGISTRAR ERRO
======================================== */

export async function registerSyncError(
  input: RegisterSyncErrorInput
) {
  const {
    provider,
    externalId,
    offset,
    stage,
    error,
    payload,
  } = input

  const message =
    getErrorMessage(
      error
    )

  const stack =
    getErrorStack(
      error
    )

  const safePayload =
    toSafeJson(
      payload
    )

  /* ========================================
     PROCURAR ERRO ABERTO SEMELHANTE
  ======================================== */

  const existingError =
    await databaseRetry(
      () =>
        prisma.syncError.findFirst({
          where: {
            provider,

            externalId:
              externalId ??
              null,

            offset:
              offset ??
              null,

            stage,

            message,

            resolved:
              false,
          },

          orderBy: {
            createdAt:
              "desc",
          },
        }),

      `Buscar SyncError ${provider} ${externalId ?? "sem-id"}`
    )

  /* ========================================
     ERRO JÁ EXISTE
  ======================================== */

  if (existingError) {
    return databaseRetry(
      () =>
        prisma.syncError.update({
          where: {
            id:
              existingError.id,
          },

          data: {
            attempts: {
              increment: 1,
            },

            stack,

            payload:
              safePayload,
          },
        }),

      `Atualizar SyncError ${existingError.id}`
    )
  }

  /* ========================================
     CRIAR NOVO ERRO
  ======================================== */

  return databaseRetry(
    () =>
      prisma.syncError.create({
        data: {
          provider,

          externalId:
            externalId ??
            null,

          offset:
            offset ??
            null,

          stage,

          message,

          stack,

          payload:
            safePayload,

          attempts:
            1,

          resolved:
            false,
        },
      }),

    `Criar SyncError ${provider} ${externalId ?? "sem-id"}`
  )
}

/* ========================================
   RESOLVER ERRO ESPECÍFICO
======================================== */

export async function resolveSyncError(
  id: string
) {
  return databaseRetry(
    () =>
      prisma.syncError.update({
        where: {
          id,
        },

        data: {
          resolved:
            true,

          resolvedAt:
            new Date(),
        },
      }),

    `Resolver SyncError ${id}`
  )
}

/* ========================================
   RESOLVER ERROS DE UM EXTERNAL ID
======================================== */

export async function resolveSyncErrorsByExternalId(
  provider: string,
  externalId: string
) {
  return databaseRetry(
    () =>
      prisma.syncError.updateMany({
        where: {
          provider,

          externalId,

          resolved:
            false,
        },

        data: {
          resolved:
            true,

          resolvedAt:
            new Date(),
        },
      }),

    `Resolver SyncErrors ${provider} ${externalId}`
  )
}

/* ========================================
   BUSCAR ERROS PENDENTES
======================================== */

export async function getUnresolvedSyncErrors(
  provider?: string
) {
  return databaseRetry(
    () =>
      prisma.syncError.findMany({
        where: {
          resolved:
            false,

          ...(provider
            ? {
                provider,
              }
            : {}),
        },

        orderBy: {
          createdAt:
            "desc",
        },
      }),

    provider
      ? `Buscar SyncErrors pendentes ${provider}`
      : "Buscar todos os SyncErrors pendentes"
  )
}

/* ========================================
   CONTAR ERROS PENDENTES
======================================== */

export async function countUnresolvedSyncErrors(
  provider?: string
) {
  return databaseRetry(
    () =>
      prisma.syncError.count({
        where: {
          resolved:
            false,

          ...(provider
            ? {
                provider,
              }
            : {}),
        },
      }),

    provider
      ? `Contar SyncErrors pendentes ${provider}`
      : "Contar todos os SyncErrors pendentes"
  )
}