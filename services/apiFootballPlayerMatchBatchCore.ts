import {
  isApiFootballRateLimitError,
} from "./apiFootballErrors"

export type ApiFootballPlayerMatchBatchPlayer = {
  id: string
  externalId: string | null
  name: string
}

type MatchDetails = {
  apiFootballId: number
  confidence: number
  nameScore: number
  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
}

export type ApiFootballPlayerMatchBatchError = {
  cause: unknown
  message: string
  stack: string | null
}

export type ApiFootballPlayerMatchBatchResolution =
  | ({ kind: "saved" } & MatchDetails)
  | ({ kind: "strong_not_saved" } & MatchDetails)
  | ({ kind: "review" } & MatchDetails)
  | ({ kind: "weak" } & MatchDetails)
  | {
      kind: "not_resolved"
      reason: string
    }

type BatchDependencies = {
  resolvePlayer: (
    player: ApiFootballPlayerMatchBatchPlayer
  ) =>
    | ApiFootballPlayerMatchBatchResolution
    | Promise<ApiFootballPlayerMatchBatchResolution>
  recordMatched: (
    player: ApiFootballPlayerMatchBatchPlayer,
    resolution: Extract<ApiFootballPlayerMatchBatchResolution, { kind: "saved" }>
  ) => Promise<unknown>
  recordNotResolved: (
    player: ApiFootballPlayerMatchBatchPlayer,
    resolution: Extract<ApiFootballPlayerMatchBatchResolution, { kind: "not_resolved" }>
  ) => Promise<unknown>
  recordReview: (
    player: ApiFootballPlayerMatchBatchPlayer,
    resolution: Extract<
      ApiFootballPlayerMatchBatchResolution,
      { kind: "strong_not_saved" | "review" }
    >
  ) => Promise<unknown>
  recordWeak: (
    player: ApiFootballPlayerMatchBatchPlayer,
    resolution: Extract<ApiFootballPlayerMatchBatchResolution, { kind: "weak" }>
  ) => Promise<unknown>
  recordConflict: (
    player: ApiFootballPlayerMatchBatchPlayer,
    error: ApiFootballPlayerMatchBatchError
  ) => Promise<unknown>
  recordError: (
    player: ApiFootballPlayerMatchBatchPlayer,
    error: ApiFootballPlayerMatchBatchError
  ) => Promise<unknown>
  registerSyncError: (
    player: ApiFootballPlayerMatchBatchPlayer,
    error: ApiFootballPlayerMatchBatchError
  ) => Promise<unknown>
  onPlayerStart?: (
    player: ApiFootballPlayerMatchBatchPlayer
  ) => void
  onResolution?: (
    player: ApiFootballPlayerMatchBatchPlayer,
    resolution: ApiFootballPlayerMatchBatchResolution
  ) => void
  onRateLimit?: () => void
  onError?: (
    error: ApiFootballPlayerMatchBatchError
  ) => void
  onSyncErrorRegistrationFailure?: (
    error: unknown
  ) => void
}

export type ApiFootballPlayerMatchBatchCoreResult = {
  processed: number
  saved: number
  strongNotSaved: number
  review: number
  weak: number
  notResolved: number
  conflicts: number
  errors: number
  rateLimited: boolean
  status: "paused" | "idle"
  decision: "paused" | "continue"
  nextOffset: number
}

function getErrorDetails(
  error: unknown
): ApiFootballPlayerMatchBatchError {
  return {
    cause: error,
    message:
      error instanceof Error
        ? error.message
        : String(error),
    stack:
      error instanceof Error
        ? error.stack ?? null
        : null,
  }
}

function isApiFootballIdConflict(
  message: string
) {
  return (
    message.startsWith(
      "Conflito de apiFootballId="
    ) ||
    message.startsWith(
      "Conflito: apiFootballId"
    )
  )
}

export async function runApiFootballPlayerMatchBatchCore({
  players,
  previousOffset,
  dependencies,
}: {
  players: ApiFootballPlayerMatchBatchPlayer[]
  previousOffset: number
  dependencies: BatchDependencies
}): Promise<ApiFootballPlayerMatchBatchCoreResult> {
  let processed = 0
  let saved = 0
  let strongNotSaved = 0
  let review = 0
  let weak = 0
  let notResolved = 0
  let conflicts = 0
  let errors = 0
  let rateLimited = false

  for (const player of players) {
    dependencies.onPlayerStart?.(
      player
    )

    try {
      const resolution =
        await dependencies.resolvePlayer(
          player
        )

      dependencies.onResolution?.(
        player,
        resolution
      )

      if (
        resolution.kind ===
        "not_resolved"
      ) {
        await dependencies.recordNotResolved(
          player,
          resolution
        )
        notResolved++
        processed++
        continue
      }

      if (resolution.kind === "saved") {
        await dependencies.recordMatched(
          player,
          resolution
        )
        saved++
        processed++
        continue
      }

      if (
        resolution.kind ===
        "strong_not_saved"
      ) {
        await dependencies.recordReview(
          player,
          resolution
        )
        strongNotSaved++
        processed++
        continue
      }

      if (resolution.kind === "review") {
        await dependencies.recordReview(
          player,
          resolution
        )
        review++
        processed++
        continue
      }

      await dependencies.recordWeak(
        player,
        resolution
      )
      weak++
      processed++
    } catch (error) {
      if (
        isApiFootballRateLimitError(
          error
        )
      ) {
        dependencies.onRateLimit?.()
        rateLimited = true
        break
      }

      const errorDetails =
        getErrorDetails(error)

      if (
        isApiFootballIdConflict(
          errorDetails.message
        )
      ) {
        conflicts++
        await dependencies.recordConflict(
          player,
          errorDetails
        )
      } else {
        errors++
        await dependencies.recordError(
          player,
          errorDetails
        )
      }

      dependencies.onError?.(
        errorDetails
      )

      try {
        await dependencies.registerSyncError(
          player,
          errorDetails
        )
      } catch (syncError) {
        dependencies.onSyncErrorRegistrationFailure?.(
          syncError
        )
      }

      processed++
    }
  }

  return {
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
        : "idle",
    decision:
      rateLimited
        ? "paused"
        : "continue",
    nextOffset:
      previousOffset +
      saved,
  }
}
