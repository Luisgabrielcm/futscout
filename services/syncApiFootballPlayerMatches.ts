import "dotenv/config"

import { prisma } from "../lib/prisma"

import {
    resolveApiFootballPlayer,
} from "./resolveApiFootballPlayer"

import {
    clearApiFootballTeamPlayersCache,
} from "./getApiFootballTeamPlayers"

import {
    recordConflictPlayer,
    recordErrorPlayer,
    recordMatchedPlayer,
    recordNotResolvedPlayer,
    recordReviewPlayer,
    recordWeakPlayer,
} from "./apiFootballPlayerMatchAttempt"

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SYNC_KEY =
  "api-football-player-matcher"

const DEFAULT_SEASON = 2024

const DEFAULT_BATCH_SIZE = 10

/* ========================================
   TIPOS
======================================== */

export type SyncApiFootballPlayerMatchesResult = {
  selected: number
  processed: number

  saved: number

  strongNotSaved: number
  review: number
  weak: number
  notResolved: number

  conflicts: number
  errors: number

  rateLimited: boolean

  status:
    | "completed"
    | "paused"
    | "idle"

  nextOffset: number

  remainingEligible: number
}

/* ========================================
   GARANTIR SYNC STATE
======================================== */

async function ensureSyncState({
  batchSize,
}: {
  batchSize: number
}) {
  return prisma.syncState.upsert({
    where: {
      key: SYNC_KEY,
    },

    create: {
      key: SYNC_KEY,

      offset: 0,

      batchSize,

      status: "idle",
    },

    update: {
      batchSize,
    },
  })
}

/* ========================================
   MARCAR COMO RUNNING
======================================== */

async function markSyncRunning() {
  await prisma.syncState.update({
    where: {
      key: SYNC_KEY,
    },

    data: {
      status: "running",
      lastError: null,
    },
  })
}

/* ========================================
   MARCAR PAUSADO
======================================== */

async function markSyncPaused({
  offset,
  error,
}: {
  offset: number
  error: string
}) {
  await prisma.syncState.update({
    where: {
      key: SYNC_KEY,
    },

    data: {
      offset,

      status: "paused",

      lastError: error,
    },
  })
}

/* ========================================
   MARCAR SUCESSO
======================================== */

async function markSyncSuccess({
  offset,
  completed,
}: {
  offset: number
  completed: boolean
}) {
  await prisma.syncState.update({
    where: {
      key: SYNC_KEY,
    },

    data: {
      offset,

      status:
        completed
          ? "completed"
          : "idle",

      lastError: null,

      lastSuccessAt:
        new Date(),
    },
  })
}

/* ========================================
   REGISTRAR SYNC ERROR
======================================== */

async function registerSyncError({
  playerExternalId,
  message,
  stack,
  payload,
}: {
  playerExternalId:
    | string
    | null

  message: string

  stack:
    | string
    | null

  payload:
    | {
        [key: string]:
          | string
          | number
          | boolean
          | null
      }
    | null
}) {
  await prisma.syncError.create({
    data: {
      provider:
        "api-football",

      externalId:
        playerExternalId,

      stage:
        "player-matcher",

      message,

      stack,

      payload:
        payload ??
        undefined,

      resolved:
        false,
    },
  })
}

/* ========================================
   SINCRONIZAR LOTE
======================================== */

export async function syncApiFootballPlayerMatches({
  batchSize = DEFAULT_BATCH_SIZE,
  season = DEFAULT_SEASON,
}: {
  batchSize?: number
  season?: number
} = {}): Promise<
  SyncApiFootballPlayerMatchesResult
> {
  /* ======================================
     1. ESTADO
  ====================================== */

  const syncState =
    await ensureSyncState({
      batchSize,
    })

  await markSyncRunning()

  clearApiFootballTeamPlayersCache()

  const now =
    new Date()

  /* ======================================
     2. SELECIONAR JOGADORES ELEGÍVEIS
  ====================================== */

  /*
   * Regras:
   *
   * - ainda não possui apiFootballId;
   * - possui data de nascimento;
   * - possui clube;
   *
   * E:
   *
   * - nunca foi tentado
   *
   * OU
   *
   * - possui nextRetryAt vencido.
   *
   * Dessa forma, um jogador
   * not_resolved não reaparece em
   * todos os lotes.
   */

  const players =
    await prisma.player.findMany({
      where: {
        apiFootballId:
          null,

        dateOfBirth: {
          not: null,
        },

        clubId: {
          not: null,
        },

        OR: [
          {
            apiFootballMatchAttempt:
              null,
          },

          {
            apiFootballMatchAttempt: {
              is: {
                status: {
                  not:
                    "matched",
                },

                OR: [
                  {
                    nextRetryAt:
                      null,
                  },

                  {
                    nextRetryAt: {
                      lte:
                        now,
                    },
                  },
                ],
              },
            },
          },
        ],
      },

      select: {
        id: true,

        externalId:
          true,

        name: true,

        slug: true,

        officialOverall:
          true,

        dateOfBirth:
          true,

        nationality:
          true,

        club: {
          select: {
            id: true,
            name: true,
            apiFootballId:
              true,
          },
        },

        apiFootballMatchAttempt: {
          select: {
            status: true,
            attempts: true,
            nextRetryAt:
              true,
          },
        },
      },

      orderBy: [
        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ],

      take:
        batchSize,
    })

  /* ======================================
     3. CONTADORES
  ====================================== */

  let processed = 0

  let saved = 0

  let strongNotSaved = 0
  let review = 0
  let weak = 0
  let notResolved = 0

  let conflicts = 0
  let errors = 0

  let rateLimited = false

  /* ======================================
     4. PROCESSAR
  ====================================== */

  for (
    const player of
      players
  ) {
    console.log(
      "\n----------------------------------------"
    )

    console.log(
      `JOGADOR: ${player.name}`
    )

    console.log({
      slug:
        player.slug,

      overall:
        player.officialOverall,

      birth:
        player.dateOfBirth
          ?.toISOString()
          .slice(0, 10) ??
        null,

      nationality:
        player.nationality,

      club:
        player.club?.name ??
        null,

      clubApiFootballId:
        player.club
          ?.apiFootballId ??
        null,

      previousAttempt:
        player
          .apiFootballMatchAttempt
          ? {
              status:
                player
                  .apiFootballMatchAttempt
                  .status,

              attempts:
                player
                  .apiFootballMatchAttempt
                  .attempts,

              nextRetryAt:
                player
                  .apiFootballMatchAttempt
                  .nextRetryAt,
            }
          : null,
    })

    try {
      const result =
        await resolveApiFootballPlayer({
          playerId:
            player.id,

          season,

          save:
            true,
        })

      /* ==================================
         NÃO RESOLVIDO
      ================================== */

      if (!result) {
        await recordNotResolvedPlayer({
          playerId:
            player.id,

          reason:
            "Nenhum candidato confiável encontrado no elenco da API-Football.",
        })

        console.log(
          "RESULTADO: NÃO RESOLVIDO"
        )

        notResolved++
        processed++

        continue
      }

      console.log({
        apiFootballId:
          result.apiFootballId,

        apiName:
          result.apiName,

        apiFullName:
          result.apiFullName,

        nameScore:
          `${result.nameScore}%`,

        birthMatches:
          result.birthMatches,

        nationalityMatches:
          result.nationalityMatches,

        clubMatches:
          result.clubMatches,

        confidence:
          `${result.confidence}%`,

        classification:
          result.classification,

        canAutoSave:
          result.canAutoSave,

        saved:
          result.saved,

        source:
          result.source,
      })

      /* ==================================
         SALVO
      ================================== */

      if (
        result.saved
      ) {
        await recordMatchedPlayer({
          playerId:
            player.id,

          apiFootballId:
            result.apiFootballId,

          confidence:
            result.confidence,

          nameScore:
            result.nameScore,

          birthMatches:
            result.birthMatches,

          nationalityMatches:
            result.nationalityMatches,

          clubMatches:
            result.clubMatches,
        })

        saved++
        processed++

        console.log(
          `✅ SALVO: ${player.name} → ${result.apiFootballId}`
        )

        continue
      }

      /* ==================================
         MATCH FORTE NÃO SALVO
      ================================== */

      if (
        result.classification ===
        "MATCH FORTE"
      ) {
        await recordReviewPlayer({
          playerId:
            player.id,

          apiFootballId:
            result.apiFootballId,

          confidence:
            result.confidence,

          nameScore:
            result.nameScore,

          birthMatches:
            result.birthMatches,

          nationalityMatches:
            result.nationalityMatches,

          clubMatches:
            result.clubMatches,
        })

        strongNotSaved++
        processed++

        console.log(
          "⚠️ Match forte, mas sem autorização para auto-save."
        )

        continue
      }

      /* ==================================
         REVISAR
      ================================== */

      if (
        result.classification ===
        "REVISAR"
      ) {
        await recordReviewPlayer({
          playerId:
            player.id,

          apiFootballId:
            result.apiFootballId,

          confidence:
            result.confidence,

          nameScore:
            result.nameScore,

          birthMatches:
            result.birthMatches,

          nationalityMatches:
            result.nationalityMatches,

          clubMatches:
            result.clubMatches,
        })

        review++
        processed++

        console.log(
          "⚠️ Necessita revisão."
        )

        continue
      }

      /* ==================================
         MATCH FRACO
      ================================== */

      await recordWeakPlayer({
        playerId:
          player.id,

        apiFootballId:
          result.apiFootballId,

        confidence:
          result.confidence,

        nameScore:
          result.nameScore,

        birthMatches:
          result.birthMatches,

        nationalityMatches:
          result.nationalityMatches,

        clubMatches:
          result.clubMatches,
      })

      weak++
      processed++

      console.log(
        "❌ Match fraco."
      )
    } catch (
      error
    ) {
      /* ==================================
         RATE LIMIT
      ================================== */

      if (
        error instanceof
          Error &&
        error.message ===
          "RATE_LIMIT_429"
      ) {
        console.log(
          "\nAPI-FOOTBALL: HTTP 429"
        )

        console.log(
          "Sincronização pausada para preservar a cota."
        )

        /*
         * IMPORTANTE:
         *
         * Não registramos tentativa para
         * este jogador porque o matcher
         * não conseguiu terminar.
         *
         * Assim ele continua elegível
         * quando a API voltar.
         */

        rateLimited =
          true

        break
      }

      const message =
        error instanceof
          Error
          ? error.message
          : String(error)

      const stack =
        error instanceof
          Error
          ? error.stack ??
            null
          : null

      /* ==================================
         CONFLITO
      ================================== */

      const isConflict =
        message.startsWith(
          "Conflito de apiFootballId="
        ) ||
        message.startsWith(
          "Conflito: apiFootballId"
        )

      if (
        isConflict
      ) {
        conflicts++

        await recordConflictPlayer({
          playerId:
            player.id,

          apiFootballId:
            null,

          reason:
            message,
        })
      } else {
        errors++

        await recordErrorPlayer({
          playerId:
            player.id,

          reason:
            message,
        })
      }

      console.error(
        "ERRO:",
        message
      )

      /*
       * Além do controle específico
       * do matcher, mantemos SyncError
       * para erros técnicos.
       */
      try {
        await registerSyncError({
          playerExternalId:
            player.externalId,

          message,

          stack,

          payload: {
            playerId:
              player.id,

            playerName:
              player.name,

            slug:
              player.slug,

            clubId:
              player.club?.id ??
              null,

            clubName:
              player.club?.name ??
              null,

            season,
          },
        })
      } catch (
        syncError
      ) {
        console.error(
          "Não foi possível registrar SyncError:",
          syncError
        )
      }

      processed++
    }
  }

  /* ======================================
     5. PROGRESSO
  ====================================== */

  const previousOffset =
    syncState.offset

  /*
   * Continuamos tratando offset como
   * quantidade de IDs efetivamente
   * associados pela rotina.
   */

  const nextOffset =
    previousOffset +
    saved

  /* ======================================
     6. CONTAR ELEGÍVEIS RESTANTES
  ====================================== */

  const remainingEligible =
    await prisma.player.count({
      where: {
        apiFootballId:
          null,

        dateOfBirth: {
          not: null,
        },

        clubId: {
          not: null,
        },

        OR: [
          {
            apiFootballMatchAttempt:
              null,
          },

          {
            apiFootballMatchAttempt: {
              is: {
                status: {
                  not:
                    "matched",
                },

                OR: [
                  {
                    nextRetryAt:
                      null,
                  },

                  {
                    nextRetryAt: {
                      lte:
                        new Date(),
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    })

  /* ======================================
     7. COMPLETED?
  ====================================== */

  /*
   * "completed" aqui significa:
   *
   * não existe nenhum jogador elegível
   * para processar agora.
   *
   * Jogadores com retry futuro podem
   * continuar existindo no banco.
   */

  const completed =
    remainingEligible === 0

  /* ======================================
     8. ATUALIZAR SYNC STATE
  ====================================== */

  if (
    rateLimited
  ) {
    await markSyncPaused({
      offset:
        nextOffset,

      error:
        "API-Football rate limit HTTP 429",
    })
  } else {
    await markSyncSuccess({
      offset:
        nextOffset,

      completed,
    })
  }

  /* ======================================
     9. RETORNO
  ====================================== */

  return {
    selected:
      players.length,

    processed,

    saved,

    strongNotSaved,

    review,

    weak,

    notResolved,

    conflicts,

    errors,

    rateLimited,

    status:
      rateLimited
        ? "paused"
        : completed
          ? "completed"
          : "idle",

    nextOffset,

    remainingEligible,
  }
}