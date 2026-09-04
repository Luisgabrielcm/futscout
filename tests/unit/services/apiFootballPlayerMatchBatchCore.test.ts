import assert from "node:assert/strict"
import test from "node:test"

import {
  ApiFootballCacheOnlyMissError,
  ApiFootballRateLimitError,
} from "../../../services/apiFootballErrors"
import {
  runApiFootballPlayerMatchBatchCore,
  type ApiFootballPlayerMatchBatchPlayer,
  type ApiFootballPlayerMatchBatchResolution,
} from "../../../services/apiFootballPlayerMatchBatchCore"

const players: ApiFootballPlayerMatchBatchPlayer[] = [
  {
    id: "player-a",
    externalId: "ea-a",
    name: "Player A",
  },
  {
    id: "player-b",
    externalId: "ea-b",
    name: "Player B",
  },
  {
    id: "player-c",
    externalId: "ea-c",
    name: "Player C",
  },
]

const savedResolution: ApiFootballPlayerMatchBatchResolution = {
  kind: "saved",
  apiFootballId: 101,
  confidence: 95,
  nameScore: 100,
  birthMatches: true,
  nationalityMatches: true,
  clubMatches: true,
}

const notResolvedResolution: ApiFootballPlayerMatchBatchResolution = {
  kind: "not_resolved",
  reason: "Nenhum candidato confiável encontrado.",
}

const strongNotSavedResolution: ApiFootballPlayerMatchBatchResolution = {
  ...savedResolution,
  kind: "strong_not_saved",
}

const reviewResolution: ApiFootballPlayerMatchBatchResolution = {
  ...savedResolution,
  kind: "review",
}

const weakResolution: ApiFootballPlayerMatchBatchResolution = {
  ...savedResolution,
  kind: "weak",
}

function createHarness({
  resolve,
}: {
  resolve: (
    player: ApiFootballPlayerMatchBatchPlayer
  ) =>
    | ApiFootballPlayerMatchBatchResolution
    | Promise<ApiFootballPlayerMatchBatchResolution>
}) {
  const resolvedPlayers: string[] = []
  const matched: string[] = []
  const notResolved: string[] = []
  const reviews: string[] = []
  const weak: string[] = []
  const errors: string[] = []
  const conflicts: string[] = []
  const syncErrors: string[] = []

  return {
    calls: {
      resolvedPlayers,
      matched,
      notResolved,
      reviews,
      weak,
      errors,
      conflicts,
      syncErrors,
    },
    dependencies: {
      resolvePlayer: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        resolvedPlayers.push(player.id)
        return resolve(player)
      },
      recordMatched: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        matched.push(player.id)
      },
      recordNotResolved: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        notResolved.push(player.id)
      },
      recordReview: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        reviews.push(player.id)
      },
      recordWeak: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        weak.push(player.id)
      },
      recordError: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        errors.push(player.id)
      },
      recordConflict: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        conflicts.push(player.id)
      },
      registerSyncError: async (
        player: ApiFootballPlayerMatchBatchPlayer
      ) => {
        syncErrors.push(player.id)
      },
    },
  }
}

test("rate limit on the first player pauses without attempts or a next player", async () => {
  const harness = createHarness({
    resolve: async () => {
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 12,
    failFast: true,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a"])
  assert.deepEqual(harness.calls.matched, [])
  assert.deepEqual(harness.calls.notResolved, [])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.conflicts, [])
  assert.deepEqual(harness.calls.syncErrors, [])
  assert.equal(result.processed, 0)
  assert.equal(result.saved, 0)
  assert.equal(result.rateLimited, true)
  assert.equal(result.failedFast, false)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 12)
})

test("a saved player before rate limit preserves its attempt and partial offset", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return savedResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 12,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.matched, ["player-a"])
  assert.deepEqual(harness.calls.errors, [])
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 1)
  assert.equal(result.notResolved, 0)
  assert.equal(result.rateLimited, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 13)
})

test("a not-resolved player before rate limit records its attempt without advancing offset", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return notResolvedResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 12,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.notResolved, ["player-a"])
  assert.deepEqual(harness.calls.errors, [])
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.notResolved, 1)
  assert.equal(result.rateLimited, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 12)
})

test("a generic error records attempt and SyncError, then continues", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") {
        throw new Error("temporary parsing failure")
      }
      return notResolvedResolution
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players: players.slice(0, 2),
    previousOffset: 4,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.errors, ["player-a"])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.notResolved, ["player-b"])
  assert.equal(result.processed, 2)
  assert.equal(result.errors, 1)
  assert.equal(result.notResolved, 1)
  assert.equal(result.rateLimited, false)
  assert.equal(result.status, "idle")
  assert.equal(result.decision, "continue")
  assert.equal(result.nextOffset, 4)
})

test("failFast omitted preserves generic-error continuation through the batch", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") {
        throw new Error("temporary parsing failure")
      }
      return notResolvedResolution
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 4,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, [
    "player-a",
    "player-b",
    "player-c",
  ])
  assert.deepEqual(harness.calls.errors, ["player-a"])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.notResolved, ["player-b", "player-c"])
  assert.equal(result.processed, 3)
  assert.equal(result.saved, 0)
  assert.equal(result.errors, 1)
  assert.equal(result.notResolved, 2)
  assert.equal(result.failedFast, false)
  assert.equal(result.status, "idle")
  assert.equal(result.decision, "continue")
  assert.equal(result.nextOffset, 4)
})

test("failFast stops after recording a generic error on the first player", async () => {
  const harness = createHarness({
    resolve: async () => {
      throw new Error("temporary parsing failure")
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 4,
    failFast: true,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a"])
  assert.deepEqual(harness.calls.errors, ["player-a"])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.matched, [])
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.errors, 1)
  assert.equal(result.failedFast, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 4)
})

test("failFast preserves a saved player before a generic error", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return savedResolution
      if (player.id === "player-b") {
        throw new Error("temporary parsing failure")
      }
      return notResolvedResolution
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 4,
    failFast: true,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.matched, ["player-a"])
  assert.deepEqual(harness.calls.errors, ["player-b"])
  assert.deepEqual(harness.calls.syncErrors, ["player-b"])
  assert.equal(result.processed, 2)
  assert.equal(result.saved, 1)
  assert.equal(result.errors, 1)
  assert.equal(result.failedFast, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 5)
})

test("an apiFootballId conflict records conflict and continues", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") {
        throw new Error(
          "Conflito de apiFootballId=101: já pertence a outro jogador."
        )
      }
      return savedResolution
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players: players.slice(0, 2),
    previousOffset: 7,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.conflicts, ["player-a"])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.matched, ["player-b"])
  assert.equal(result.processed, 2)
  assert.equal(result.conflicts, 1)
  assert.equal(result.saved, 1)
  assert.equal(result.rateLimited, false)
  assert.equal(result.nextOffset, 8)
})

test("failFast stops after recording a conflict on the first player", async () => {
  const harness = createHarness({
    resolve: async () => {
      throw new Error(
        "Conflito de apiFootballId=101: já pertence a outro jogador."
      )
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 7,
    failFast: true,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a"])
  assert.deepEqual(harness.calls.conflicts, ["player-a"])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.matched, [])
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.conflicts, 1)
  assert.equal(result.failedFast, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 7)
})

test("failFast false preserves conflict continuation through the batch", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") {
        throw new Error(
          "Conflito de apiFootballId=101: já pertence a outro jogador."
        )
      }
      return notResolvedResolution
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 7,
    failFast: false,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, [
    "player-a",
    "player-b",
    "player-c",
  ])
  assert.deepEqual(harness.calls.conflicts, ["player-a"])
  assert.deepEqual(harness.calls.syncErrors, ["player-a"])
  assert.deepEqual(harness.calls.notResolved, ["player-b", "player-c"])
  assert.equal(result.processed, 3)
  assert.equal(result.saved, 0)
  assert.equal(result.conflicts, 1)
  assert.equal(result.notResolved, 2)
  assert.equal(result.failedFast, false)
  assert.equal(result.status, "idle")
  assert.equal(result.decision, "continue")
  assert.equal(result.nextOffset, 7)
})

test("rate limit after multiple results preserves earlier counters and stops later players", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return savedResolution
      if (player.id === "player-b") return notResolvedResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const laterPlayer: ApiFootballPlayerMatchBatchPlayer = {
    id: "player-d",
    externalId: "ea-d",
    name: "Player D",
  }

  const result = await runApiFootballPlayerMatchBatchCore({
    players: [...players, laterPlayer],
    previousOffset: 20,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, [
    "player-a",
    "player-b",
    "player-c",
  ])
  assert.deepEqual(harness.calls.matched, ["player-a"])
  assert.deepEqual(harness.calls.notResolved, ["player-b"])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.syncErrors, [])
  assert.equal(result.processed, 2)
  assert.equal(result.saved, 1)
  assert.equal(result.notResolved, 1)
  assert.equal(result.rateLimited, true)
  assert.equal(result.status, "paused")
  assert.equal(result.decision, "paused")
  assert.equal(result.nextOffset, 21)
})

test("strong-not-saved records review, updates only its counter, and continues", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return strongNotSavedResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 9,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.reviews, ["player-a"])
  assert.deepEqual(harness.calls.weak, [])
  assert.equal(result.strongNotSaved, 1)
  assert.equal(result.review, 0)
  assert.equal(result.weak, 0)
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.nextOffset, 9)
})

test("review records review, updates only its counter, and continues", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return reviewResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 9,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.reviews, ["player-a"])
  assert.deepEqual(harness.calls.weak, [])
  assert.equal(result.review, 1)
  assert.equal(result.strongNotSaved, 0)
  assert.equal(result.weak, 0)
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.nextOffset, 9)
})

test("weak records weak, updates only its counter, and continues", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return weakResolution
      throw new ApiFootballRateLimitError()
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 9,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.weak, ["player-a"])
  assert.deepEqual(harness.calls.reviews, [])
  assert.equal(result.weak, 1)
  assert.equal(result.review, 0)
  assert.equal(result.strongNotSaved, 0)
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 0)
  assert.equal(result.nextOffset, 9)
})

test("cache-only miss pauses without attempt or SyncError", async () => {
  const harness = createHarness({
    resolve: async () => {
      throw new ApiFootballCacheOnlyMissError("team roster")
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 12,
    failFast: true,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a"])
  assert.deepEqual(harness.calls.matched, [])
  assert.deepEqual(harness.calls.notResolved, [])
  assert.deepEqual(harness.calls.reviews, [])
  assert.deepEqual(harness.calls.weak, [])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.conflicts, [])
  assert.deepEqual(harness.calls.syncErrors, [])
  assert.equal(result.processed, 0)
  assert.equal(result.saved, 0)
  assert.equal(result.rateLimited, false)
  assert.equal(result.cacheOnlyMiss, true)
  assert.equal(result.failedFast, false)
  assert.equal(result.status, "paused")
  assert.equal(result.nextOffset, 12)
})

test("cache-only miss preserves completed results and stops later players", async () => {
  const harness = createHarness({
    resolve: async (player) => {
      if (player.id === "player-a") return savedResolution
      throw new ApiFootballCacheOnlyMissError("team roster")
    },
  })

  const result = await runApiFootballPlayerMatchBatchCore({
    players,
    previousOffset: 20,
    dependencies: harness.dependencies,
  })

  assert.deepEqual(harness.calls.resolvedPlayers, ["player-a", "player-b"])
  assert.deepEqual(harness.calls.matched, ["player-a"])
  assert.deepEqual(harness.calls.errors, [])
  assert.deepEqual(harness.calls.syncErrors, [])
  assert.equal(result.processed, 1)
  assert.equal(result.saved, 1)
  assert.equal(result.cacheOnlyMiss, true)
  assert.equal(result.rateLimited, false)
  assert.equal(result.status, "paused")
  assert.equal(result.nextOffset, 21)
})
