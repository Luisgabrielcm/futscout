import "dotenv/config"

import { eaCatalogBatchHash, normalizedPlayerSnapshot } from "../lib/eaCatalogSemanticSync"
import { prisma } from "../lib/prisma"
import { mapEARatingsPlayer } from "../mappers/mapEARatingsPlayer"
import { normalizePlayer } from "../normalizers/normalizePlayer"
import { EARatingsProvider } from "../providers/eaRatingsProvider"
import {
  EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY,
  EA_GOALKEEPER_BATCH_SIZE,
  EA_GOALKEEPER_HISTORICAL_SYNC_KEY,
  persistEaGoalkeeperBatchAtomically,
  planEaGoalkeeperAttributesWrite,
  type EaGoalkeeperSourcePage,
} from "../services/eaGoalkeeperAttributesSync"
import {
  createPrismaEaGoalkeeperWriteStore,
  loadEaGoalkeeperSyncState,
} from "../services/prismaEaGoalkeeperAttributesSyncStore"
import type { NormalizedPlayer } from "../types/normalizedPlayer"
import { parseEaGoalkeeperSyncMode } from "./eaGoalkeeperAttributesSyncRunnerOptions"

const SOURCE_PAGE_SIZE = 100

type Candidate = Readonly<{ player: NormalizedPlayer; sourceIndex: number; sourcePage: number }>

async function collectGoalkeepers(provider: EARatingsProvider, sourceOffset: number) {
  const candidates: Candidate[] = []
  const pages: EaGoalkeeperSourcePage[] = []
  let scanOffset = sourceOffset
  let totalItems = Number.MAX_SAFE_INTEGER
  let nextOffset = sourceOffset
  let requests = 0

  while (candidates.length < EA_GOALKEEPER_BATCH_SIZE && scanOffset < totalItems) {
    const batch = await provider.getPlayersBatch({ offset: scanOffset, limit: SOURCE_PAGE_SIZE, locale: "en", gender: 0 })
    requests++
    totalItems = batch.totalItems
    const normalized = batch.players.map(player => normalizePlayer(mapEARatingsPlayer(player)))
    const pageIndex = pages.length
    const pageExternalIds: string[] = []
    for (let index = 0; index < normalized.length; index++) {
      const player = normalized[index]
      nextOffset = scanOffset + index + 1
      if (player.position === "GOL") {
        candidates.push({ player, sourceIndex: nextOffset - 1, sourcePage: pageIndex })
        pageExternalIds.push(player.externalId)
        if (candidates.length === EA_GOALKEEPER_BATCH_SIZE) break
      }
    }
    if (pageExternalIds.length) pages.push({
      pageIndex,
      provenance: batch.provenance,
      batchHash: eaCatalogBatchHash(normalized.map(normalizedPlayerSnapshot)),
      externalIds: pageExternalIds,
    })
    if (batch.players.length === 0 || nextOffset >= totalItems) break
    scanOffset += batch.players.length
  }
  return { candidates, pages, nextOffset, totalItems, requests }
}

async function main() {
  const mode = parseEaGoalkeeperSyncMode(process.argv.slice(2))
  const initial = await loadEaGoalkeeperSyncState(prisma, { externalIds: [],
    cursorKey: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY, historicalKey: EA_GOALKEEPER_HISTORICAL_SYNC_KEY })
  if (!initial.historicalCheckpoint) throw new Error("EA_GOALKEEPER_HISTORICAL_CHECKPOINT_MISSING")
  const sourceOffset = mode === "write" ? initial.cursor?.offset ?? 0 : 0
  const scan = await collectGoalkeepers(new EARatingsProvider(), sourceOffset)
  const state = await loadEaGoalkeeperSyncState(prisma, {
    externalIds: scan.candidates.map(candidate => candidate.player.externalId),
    cursorKey: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY,
    historicalKey: EA_GOALKEEPER_HISTORICAL_SYNC_KEY,
  })
  const plans = scan.candidates.map(candidate => planEaGoalkeeperAttributesWrite({
    sourceIndex: candidate.sourceIndex,
    sourcePage: candidate.sourcePage,
    player: candidate.player,
    current: state.players.get(candidate.player.externalId) ?? null,
  }))
  const counts = Object.fromEntries(["CREATE", "UPDATE", "NO_OP", "INVALID", "CONFLICT"].map(action => [
    action, plans.filter(plan => plan.action === action).length,
  ]))

  let writeResult = null
  if (mode === "write") {
    writeResult = await persistEaGoalkeeperBatchAtomically(
      createPrismaEaGoalkeeperWriteStore(prisma, EA_GOALKEEPER_HISTORICAL_SYNC_KEY),
      { key: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY, historicalKey: EA_GOALKEEPER_HISTORICAL_SYNC_KEY,
        expectedHistoricalCheckpoint: state.historicalCheckpoint!, expectedCursor: state.cursor,
        sourceOffset, nextOffset: scan.nextOffset, totalItems: scan.totalItems,
        sourcePages: scan.pages, plans }
    )
    if (writeResult.status !== "COMMITTED") process.exitCode = 1
  }

  console.log(JSON.stringify({
    mode,
    cursorKey: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY,
    cursorBefore: state.cursor,
    historicalCheckpoint: state.historicalCheckpoint,
    sourceOffset,
    nextOffset: scan.nextOffset,
    totalItems: scan.totalItems,
    requests: scan.requests,
    eligibleGoalkeepers: plans.length,
    counts,
    pages: scan.pages.map(page => ({ pageIndex: page.pageIndex,
      offset: page.provenance.requestOffset, limit: page.provenance.requestLimit,
      observedAt: page.provenance.observedAt, responseDate: page.provenance.responseDate,
      etag: page.provenance.etag, lastModified: page.provenance.lastModified,
      selectedGoalkeepers: page.externalIds.length, batchHash: page.batchHash })),
    candidates: plans,
    writesExecuted: mode === "write" ? writeResult?.written ?? 0 : 0,
    provenancePersisted: mode === "write" && writeResult?.status === "COMMITTED",
    cursorChanged: mode === "write" && writeResult?.status === "COMMITTED",
    writeResult,
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
