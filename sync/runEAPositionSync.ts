import "dotenv/config"

import { eaCatalogBatchHash, normalizedPlayerSnapshot } from "../lib/eaCatalogSemanticSync"
import { prisma } from "../lib/prisma"
import { mapEARatingsPlayer } from "../mappers/mapEARatingsPlayer"
import { normalizePlayer } from "../normalizers/normalizePlayer"
import { EARatingsProvider } from "../providers/eaRatingsProvider"
import {
  EA_POSITION_HISTORICAL_SYNC_KEY,
  EA_POSITION_SYNC_KEY,
  persistEaPositionBatchAtomically,
  planEaPositionSync,
} from "../services/eaPositionSync"
import {
  createPrismaEaPositionWriteStore,
  loadEaPositionSyncState,
} from "../services/prismaEaPositionSyncStore"
import { syncPlayers } from "../services/syncPlayers"

const BATCH_SIZE = 50

function modeFromArguments(arguments_: string[]) {
  const dryRun = arguments_.includes("--dry-run")
  const write = arguments_.includes("--write")
  if (dryRun === write || arguments_.some((argument) => !["--dry-run", "--write"].includes(argument))) {
    throw new Error("Use exatamente um modo: --dry-run ou --write")
  }
  if (write && process.env.EA_POSITION_SYNC_WRITE_ENABLED !== "true") {
    throw new Error("EA_POSITION_SYNC_WRITE_DISABLED")
  }
  return write ? "write" as const : "dry-run" as const
}

async function main() {
  const mode = modeFromArguments(process.argv.slice(2))
  const provider = new EARatingsProvider()

  const initial = await loadEaPositionSyncState(prisma, {
    externalIds: [],
    cursorKey: EA_POSITION_SYNC_KEY,
    historicalKey: EA_POSITION_HISTORICAL_SYNC_KEY,
  })
  if (!initial.historicalCheckpoint) throw new Error("EA_POSITION_HISTORICAL_CHECKPOINT_MISSING")
  const sourceOffset = mode === "dry-run" ? 0 : initial.cursor?.offset ?? 0
  const batch = await provider.getPlayersBatch({ offset: sourceOffset, limit: BATCH_SIZE, locale: "en", gender: 0 })
  const normalized = batch.players.map((player) => normalizePlayer(mapEARatingsPlayer(player)))
  const semantic = await syncPlayers(normalized, { dryRun: true, requireResolvedCreateContext: true,
    provenance: batch.provenance })
  const state = await loadEaPositionSyncState(prisma, {
    externalIds: normalized.map((player) => player.externalId),
    cursorKey: EA_POSITION_SYNC_KEY,
    historicalKey: EA_POSITION_HISTORICAL_SYNC_KEY,
  })
  const semanticByExternalId = new Map(semantic.items.map((item) => [item.externalId, item]))
  const plans = normalized.map((player, sourceIndex) => {
    const item = semanticByExternalId.get(player.externalId)
    if (!item) throw new Error(`EA_POSITION_SEMANTIC_PLAN_MISSING:${player.externalId}`)
    return planEaPositionSync({
      sourceIndex,
      player,
      current: state.players.get(player.externalId) ?? null,
      semantic: item,
    })
  })
  const counts = Object.fromEntries(["READY", "NO_OP", "BLOCKED", "CONFLICT", "INVALID"].map(status => [
    status,
    plans.filter((plan) => plan.status === status).length,
  ]))
  const batchHash = eaCatalogBatchHash(normalized.map(normalizedPlayerSnapshot))

  let writeResult = null
  if (mode === "write") {
    writeResult = await persistEaPositionBatchAtomically(
      createPrismaEaPositionWriteStore(prisma, EA_POSITION_HISTORICAL_SYNC_KEY),
      {
        key: EA_POSITION_SYNC_KEY,
        historicalKey: EA_POSITION_HISTORICAL_SYNC_KEY,
        expectedHistoricalCheckpoint: state.historicalCheckpoint!,
        expectedCursor: state.cursor,
        sourceOffset,
        sourceReceived: normalized.length,
        batchSize: BATCH_SIZE,
        totalItems: batch.totalItems,
        provenance: batch.provenance,
        batchHash,
        plans,
      }
    )
    if (writeResult.status !== "COMMITTED") process.exitCode = 1
  }

  console.log(JSON.stringify({
    mode,
    cursorKey: EA_POSITION_SYNC_KEY,
    historicalCheckpoint: state.historicalCheckpoint,
    cursorBefore: state.cursor,
    source: {
      offset: sourceOffset,
      limit: BATCH_SIZE,
      received: normalized.length,
      totalItems: batch.totalItems,
      observedAt: batch.provenance.observedAt,
      responseDate: batch.provenance.responseDate,
      etag: batch.provenance.etag,
      lastModified: batch.provenance.lastModified,
      batchHash,
    },
    counts,
    positionDiffs: plans.filter((plan) => plan.status !== "NO_OP"),
    writesExecuted: mode === "write" ? writeResult?.written ?? 0 : 0,
    provenancePersisted: mode === "write" && writeResult?.status === "COMMITTED",
    cursorChanged: mode === "write" && writeResult?.status === "COMMITTED",
    writeResult,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
