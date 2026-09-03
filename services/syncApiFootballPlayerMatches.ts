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

import {
    runApiFootballPlayerMatchBatchCore,
} from "./apiFootballPlayerMatchBatchCore"

import {
    buildApiFootballPlayerMatchSelectionArgs,
} from "./apiFootballPlayerMatchSelection"

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
  playerIds,
}: {
  batchSize?: number
  season?: number
  playerIds?: readonly string[]
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

  const selectionArgs =
    buildApiFootballPlayerMatchSelectionArgs({
      batchSize,
      now,
      playerIds,
    })

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
      ...selectionArgs,

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

    })

  /* ======================================
     3. PROCESSAR LOTE
  ====================================== */

  const resolvedResults =
    new Map<
      string,
      NonNullable<
        Awaited<
          ReturnType<
            typeof resolveApiFootballPlayer
          >
        >
      >
    >()

  const batchResult =
    await runApiFootballPlayerMatchBatchCore({
      players,
      previousOffset:
        syncState.offset,
      dependencies: {
        resolvePlayer:
          async (player) => {
            const result =
              await resolveApiFootballPlayer({
                playerId:
                  player.id,
                season,
                save: true,
              })

            if (!result) {
              return {
                kind:
                  "not_resolved",
                reason:
                  "Nenhum candidato confiável encontrado no elenco da API-Football.",
              }
            }

            resolvedResults.set(
              player.id,
              result
            )

            const details = {
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
            }

            if (result.saved) {
              return {
                kind: "saved",
                ...details,
              }
            }

            if (
              result.classification ===
              "MATCH FORTE"
            ) {
              return {
                kind:
                  "strong_not_saved",
                ...details,
              }
            }

            if (
              result.classification ===
              "REVISAR"
            ) {
              return {
                kind: "review",
                ...details,
              }
            }

            return {
              kind: "weak",
              ...details,
            }
          },
        recordMatched:
          async (player, result) => {
            await recordMatchedPlayer({
              playerId: player.id,
              ...result,
            })
            console.log(
              `✅ SALVO: ${player.name} → ${result.apiFootballId}`
            )
          },
        recordNotResolved:
          async (player, result) => {
            await recordNotResolvedPlayer({
              playerId: player.id,
              reason: result.reason,
            })
            console.log(
              "RESULTADO: NÃO RESOLVIDO"
            )
          },
        recordReview:
          async (player, result) => {
            await recordReviewPlayer({
              playerId: player.id,
              ...result,
            })
            console.log(
              result.kind ===
                "strong_not_saved"
                ? "⚠️ Match forte, mas sem autorização para auto-save."
                : "⚠️ Necessita revisão."
            )
          },
        recordWeak:
          async (player, result) => {
            await recordWeakPlayer({
              playerId: player.id,
              ...result,
            })
            console.log(
              "❌ Match fraco."
            )
          },
        recordConflict:
          async (player, error) => {
            await recordConflictPlayer({
              playerId: player.id,
              apiFootballId: null,
              reason: error.message,
            })
          },
        recordError:
          async (player, error) => {
            await recordErrorPlayer({
              playerId: player.id,
              reason: error.message,
            })
          },
        registerSyncError:
          async (player, error) => {
            const selectedPlayer =
              players.find(
                (candidate) =>
                  candidate.id ===
                  player.id
              )!

            await registerSyncError({
              playerExternalId:
                selectedPlayer.externalId,
              message:
                error.message,
              stack:
                error.stack,
              payload: {
                playerId:
                  selectedPlayer.id,
                playerName:
                  selectedPlayer.name,
                slug:
                  selectedPlayer.slug,
                clubId:
                  selectedPlayer.club?.id ??
                  null,
                clubName:
                  selectedPlayer.club?.name ??
                  null,
                season,
              },
            })
          },
        onPlayerStart:
          (player) => {
            const selectedPlayer =
              players.find(
                (candidate) =>
                  candidate.id ===
                  player.id
              )!

            console.log(
              "\n----------------------------------------"
            )
            console.log(
              `JOGADOR: ${selectedPlayer.name}`
            )
            console.log({
              slug:
                selectedPlayer.slug,
              overall:
                selectedPlayer.officialOverall,
              birth:
                selectedPlayer.dateOfBirth
                  ?.toISOString()
                  .slice(0, 10) ??
                null,
              nationality:
                selectedPlayer.nationality,
              club:
                selectedPlayer.club?.name ??
                null,
              clubApiFootballId:
                selectedPlayer.club
                  ?.apiFootballId ??
                null,
              previousAttempt:
                selectedPlayer.apiFootballMatchAttempt
                  ? {
                      status:
                        selectedPlayer.apiFootballMatchAttempt.status,
                      attempts:
                        selectedPlayer.apiFootballMatchAttempt.attempts,
                      nextRetryAt:
                        selectedPlayer.apiFootballMatchAttempt.nextRetryAt,
                    }
                  : null,
            })
          },
        onResolution:
          (player, resolution) => {
            if (
              resolution.kind ===
              "not_resolved"
            ) {
              return
            }

            const result =
              resolvedResults.get(
                player.id
              )

            if (result) {
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
            }
          },
        onRateLimit:
          () => {
            console.log(
              "\nAPI-FOOTBALL: HTTP 429"
            )
            console.log(
              "Sincronização pausada para preservar a cota."
            )
          },
        onError:
          (error) => {
            console.error(
              "ERRO:",
              error.message
            )
          },
        onSyncErrorRegistrationFailure:
          (error) => {
            console.error(
              "Não foi possível registrar SyncError:",
              error
            )
          },
      },
    })

  const {
    processed,
    saved,
    strongNotSaved,
    review,
    weak,
    notResolved,
    conflicts,
    errors,
    rateLimited,
    nextOffset,
  } = batchResult

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
