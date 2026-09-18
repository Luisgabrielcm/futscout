import "dotenv/config"

import { prisma } from "../lib/prisma"
import { mapEARatingsPlayer } from "../mappers/mapEARatingsPlayer"
import { normalizePlayer } from "../normalizers/normalizePlayer"
import { EARatingsProvider } from "../providers/eaRatingsProvider"
import { syncPlayers } from "../services/syncPlayers"
import type { EARatingsPlayer } from "../types/eaRatingsPlayer"
import { runEaAutoSync } from "./eaAutoSyncCore"
import { parseEaAutoSyncRunnerOptions } from "./eaAutoSyncRunnerOptions"
import { auditEaRatingsSourceBatch } from "./eaAutoSyncSourceAudit"
import {
  EA_RATINGS_SYNC_KEY,
  getOrCreateSyncState,
  markSyncCompleted,
  markSyncFailed,
  markSyncRunning,
  updateSyncOffset,
} from "./syncState"
import { registerSyncError, resolveSyncErrorsByExternalId } from "./syncError"

const provider = new EARatingsProvider()

async function main() {
  const arguments_ = process.argv.slice(2)
  const locale = process.env.EA_AUTO_SYNC_LOCALE?.trim() || "en"
  const gender = Number(process.env.EA_AUTO_SYNC_GENDER ?? 0)
  if (!Number.isInteger(gender)) throw new Error("EA_AUTO_SYNC_GENDER_INVALID")

  const existingState = await prisma.syncState.findUnique({ where: { key: EA_RATINGS_SYNC_KEY } })
  let runnerOptions = parseEaAutoSyncRunnerOptions(
    arguments_,
    process.env,
    existingState?.offset ?? 0,
  )

  if (runnerOptions.mode === "write" && !existingState) {
    const createdState = await getOrCreateSyncState()
    runnerOptions = { ...runnerOptions, initialOffset: createdState.offset }
  }

  const { mode, initialOffset, batchSize, maxBatches } = runnerOptions
  let activeOffset = initialOffset

  const report = await runEaAutoSync<EARatingsPlayer>({
    mode, initialOffset, batchSize, maxBatches, locale, gender,
  }, {
    fetchBatch: (input) => provider.getPlayersBatch(input),
    inspectSourceBatch: auditEaRatingsSourceBatch,
    normalizePlayer: (player) => normalizePlayer(mapEARatingsPlayer(player)),
    processBatch: (players, options) => syncPlayers(players, {
      ...options,
      requireResolvedCreateContext: true,
      onError: mode === "write"
        ? async ({ player, error }) => {
            await registerSyncError({
              provider: "ea-ratings", externalId: player.externalId, offset: activeOffset,
              stage: "database", error, payload: player,
            })
          }
        : undefined,
    }),
    loadPreviousBatchSignal: async (provenance) => prisma.eaCatalogObservation.findFirst({
      where: {
        provider: provenance.provider, endpoint: provenance.endpoint,
        locale: provenance.locale, gender: provenance.gender,
        requestOffset: provenance.requestOffset, requestLimit: provenance.requestLimit,
      },
      orderBy: { observedAt: "desc" },
      select: { etag: true, lastModified: true, totalItems: true, batchHash: true },
    }),
    onWriteStart: async () => { await markSyncRunning() },
    onBatchAccepted: async (players) => {
      for (const player of players) {
        await resolveSyncErrorsByExternalId("ea-ratings", player.externalId)
      }
    },
    updateCheckpoint: async (offset) => {
      await updateSyncOffset(offset)
      activeOffset = offset
    },
    onCatalogCompleted: async () => { await markSyncCompleted() },
    onFailure: async (error) => {
      await registerSyncError({
        provider: "ea-ratings", offset: error.offset,
        stage: error.stage === "checkpoint" ? "database" : error.stage,
        error: new Error(error.message),
      })
      await markSyncFailed(new Error(error.message))
    },
  })

  console.log(JSON.stringify(report, null, 2))
  if (report.stoppedReason) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
