import "dotenv/config"

import { prisma } from "../lib/prisma"

/* ========================================
   STATUS
======================================== */

export type ApiFootballMatchAttemptStatus =
  | "matched"
  | "not_resolved"
  | "review"
  | "weak"
  | "conflict"
  | "error"

/* ========================================
   CONFIGURAÇÃO DE RETRY
======================================== */

/*
 * Um jogador não resolvido não precisa ser
 * consultado novamente no próximo lote.
 *
 * Esses prazos poderão ser ajustados
 * futuramente.
 */

const RETRY_DAYS = {
  not_resolved: 7,
  review: 14,
  weak: 30,
  conflict: 30,
  error: 1,
} as const

/* ========================================
   TIPOS
======================================== */

type RecordMatchAttemptInput = {
  playerId: string

  status:
    ApiFootballMatchAttemptStatus

  apiFootballId?:
    | number
    | null

  confidence?:
    | number
    | null

  nameScore?:
    | number
    | null

  birthMatches?:
    | boolean
    | null

  nationalityMatches?:
    | boolean
    | null

  clubMatches?:
    | boolean
    | null

  reason?:
    | string
    | null
}

/* ========================================
   CALCULAR PRÓXIMA TENTATIVA
======================================== */

function calculateNextRetryAt(
  status:
    ApiFootballMatchAttemptStatus
) {
  /*
   * Um match concluído não precisa
   * ser tentado novamente.
   */
  if (
    status === "matched"
  ) {
    return null
  }

  const retryDays =
    RETRY_DAYS[status]

  const nextRetryAt =
    new Date()

  nextRetryAt.setDate(
    nextRetryAt.getDate() +
      retryDays
  )

  return nextRetryAt
}

/* ========================================
   REGISTRAR TENTATIVA
======================================== */

export async function recordApiFootballPlayerMatchAttempt({
  playerId,
  status,
  apiFootballId = null,
  confidence = null,
  nameScore = null,
  birthMatches = null,
  nationalityMatches = null,
  clubMatches = null,
  reason = null,
}: RecordMatchAttemptInput) {
  const now =
    new Date()

  const nextRetryAt =
    calculateNextRetryAt(
      status
    )

  return prisma.apiFootballPlayerMatchAttempt.upsert({
    where: {
      playerId,
    },

    create: {
      playerId,

      status,

      attempts: 1,

      lastApiFootballId:
        apiFootballId,

      lastConfidence:
        confidence,

      lastNameScore:
        nameScore,

      lastBirthMatches:
        birthMatches,

      lastNationalityMatches:
        nationalityMatches,

      lastClubMatches:
        clubMatches,

      lastReason:
        reason,

      lastTriedAt:
        now,

      nextRetryAt,
    },

    update: {
      status,

      attempts: {
        increment: 1,
      },

      lastApiFootballId:
        apiFootballId,

      lastConfidence:
        confidence,

      lastNameScore:
        nameScore,

      lastBirthMatches:
        birthMatches,

      lastNationalityMatches:
        nationalityMatches,

      lastClubMatches:
        clubMatches,

      lastReason:
        reason,

      lastTriedAt:
        now,

      nextRetryAt,
    },
  })
}

/* ========================================
   MATCH CONCLUÍDO
======================================== */

export async function recordMatchedPlayer({
  playerId,
  apiFootballId,
  confidence,
  nameScore,
  birthMatches,
  nationalityMatches,
  clubMatches,
}: {
  playerId: string

  apiFootballId: number

  confidence: number
  nameScore: number

  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "matched",

    apiFootballId,

    confidence,

    nameScore,

    birthMatches,

    nationalityMatches,

    clubMatches,

    reason:
      "API-Football ID associado automaticamente.",
  })
}

/* ========================================
   NÃO RESOLVIDO
======================================== */

export async function recordNotResolvedPlayer({
  playerId,
  reason = "Nenhum candidato confiável encontrado.",
}: {
  playerId: string
  reason?: string
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "not_resolved",

    reason,
  })
}

/* ========================================
   REVISÃO
======================================== */

export async function recordReviewPlayer({
  playerId,
  apiFootballId,
  confidence,
  nameScore,
  birthMatches,
  nationalityMatches,
  clubMatches,
}: {
  playerId: string

  apiFootballId:
    | number
    | null

  confidence: number
  nameScore: number

  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "review",

    apiFootballId,

    confidence,

    nameScore,

    birthMatches,

    nationalityMatches,

    clubMatches,

    reason:
      "Matcher encontrou candidato que requer revisão.",
  })
}

/* ========================================
   MATCH FRACO
======================================== */

export async function recordWeakPlayer({
  playerId,
  apiFootballId,
  confidence,
  nameScore,
  birthMatches,
  nationalityMatches,
  clubMatches,
}: {
  playerId: string

  apiFootballId:
    | number
    | null

  confidence: number
  nameScore: number

  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "weak",

    apiFootballId,

    confidence,

    nameScore,

    birthMatches,

    nationalityMatches,

    clubMatches,

    reason:
      "Candidato encontrado com confiança insuficiente.",
  })
}

/* ========================================
   CONFLITO
======================================== */

export async function recordConflictPlayer({
  playerId,
  apiFootballId,
  reason,
}: {
  playerId: string

  apiFootballId:
    | number
    | null

  reason: string
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "conflict",

    apiFootballId,

    reason,
  })
}

/* ========================================
   ERRO
======================================== */

export async function recordErrorPlayer({
  playerId,
  reason,
}: {
  playerId: string
  reason: string
}) {
  return recordApiFootballPlayerMatchAttempt({
    playerId,

    status:
      "error",

    reason,
  })
}

/* ========================================
   VERIFICAR SE PODE TENTAR
======================================== */

export async function canRetryApiFootballPlayer(
  playerId: string
) {
  const attempt =
    await prisma.apiFootballPlayerMatchAttempt.findUnique({
      where: {
        playerId,
      },

      select: {
        status: true,
        nextRetryAt: true,
      },
    })

  /*
   * Nunca foi tentado.
   */
  if (!attempt) {
    return true
  }

  /*
   * Já foi associado.
   */
  if (
    attempt.status ===
    "matched"
  ) {
    return false
  }

  /*
   * Sem restrição de retry.
   */
  if (
    !attempt.nextRetryAt
  ) {
    return true
  }

  /*
   * Retry liberado quando chegarmos
   * ou ultrapassarmos nextRetryAt.
   */
  return (
    attempt.nextRetryAt <=
    new Date()
  )
}