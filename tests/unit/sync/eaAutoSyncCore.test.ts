import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import type { EaSemanticSyncAction, EaSemanticSyncPlan } from "../../../lib/eaCatalogSemanticSync"
import {
  assessEaCatalogChangeSignal,
  runEaAutoSync,
  type EaAutoSyncProcessResult,
} from "../../../sync/eaAutoSyncCore"
import type { NormalizedPlayer } from "../../../types/normalizedPlayer"

const attributeNames = (
  "pace acceleration sprintSpeed shooting positioning finishing shotPower longShots volleys penalties passing vision " +
  "crossing freeKickAccuracy shortPassing longPassing curve dribbling agility balance reactions ballControl dribblingStat " +
  "composure defending interceptions headingAccuracy defensiveAwareness standingTackle slidingTackle physical jumping stamina strength aggression"
).split(" ")

function player(externalId = "1", overrides: Partial<NormalizedPlayer> = {}): NormalizedPlayer {
  return {
    externalId,
    source: "ea-ratings",
    name: `Player ${externalId}`,
    position: "MC",
    secondaryPositions: [],
    officialOverall: 80,
    attributes: Object.fromEntries(attributeNames.map((name) => [name, 70])),
    playStyles: [],
    club: { externalId: "10", name: "Manchester City" },
    league: { name: "Premier League" },
    ...overrides,
  }
}

function provenance(offset = 0, limit = 2, totalItems = 2) {
  return {
    provider: "ea-ratings" as const,
    endpoint: "https://drop-api.ea.com/rating/ea-sports-fc",
    eaGameVersion: "FC27",
    gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT" as const,
    gameVersionEvidenceUrl: "https://www.ea.com/games/ea-sports-fc/ratings",
    catalogVersion: null,
    sourceUpdatedAt: null,
    observedAt: new Date("2026-09-17T12:00:00.000Z"),
    responseDate: new Date("2026-09-17T12:00:00.000Z"),
    etag: "catalog-etag",
    lastModified: null,
    locale: "en",
    gender: 0,
    requestOffset: offset,
    requestLimit: limit,
    totalItems,
  }
}

function processed(actions: EaSemanticSyncAction[], changedFields: string[][] = []): EaAutoSyncProcessResult {
  const counts = { CREATE: 0, UPDATE: 0, NO_OP: 0, CONFLICT: 0, INVALID: 0 }
  const items = actions.map((action, index) => {
    counts[action]++
    return {
      externalId: String(index + 1),
      action,
      payloadHash: `${index}`.padStart(64, "0"),
      changedFields: changedFields[index] ?? [],
      changes: (changedFields[index] ?? []).map((field) => ({
        field,
        before: "before",
        after: "after",
        reason: "SOURCE_VALUE_CHANGED" as const,
      })),
      reason: action === "CONFLICT" ? "IDENTITY_CONFLICT" : null,
      playerId: action === "CREATE" ? null : `player-${index}`,
    } satisfies EaSemanticSyncPlan & { playerId: string | null }
  })
  const failed = counts.CONFLICT + counts.INVALID
  return {
    processed: actions.length,
    success: actions.length - failed,
    failed,
    created: counts.CREATE,
    updated: counts.UPDATE,
    noOp: counts.NO_OP,
    conflicts: counts.CONFLICT,
    invalid: counts.INVALID,
    items,
  }
}

const config = {
  mode: "dry-run" as const,
  initialOffset: 0,
  batchSize: 2,
  maxBatches: 1,
  locale: "en",
  gender: 0,
}

test("100% NO_OP dry-run reports provenance and never writes checkpoint", async () => {
  let checkpoints = 0
  let writeStarts = 0
  const report = await runEaAutoSync(config, {
    fetchBatch: async () => ({ players: [player("1"), player("2")], totalItems: 2, provenance: provenance() }),
    normalizePlayer: (value) => value,
    processBatch: async (_players, options) => {
      assert.equal(options.dryRun, true)
      return processed(["NO_OP", "NO_OP"])
    },
    loadPreviousBatchSignal: async () => ({
      etag: "catalog-etag", lastModified: null, totalItems: 2, batchHash: "previous",
    }),
    inspectSourceBatch: () => ({
      positions: [],
      coverage: {
        potential: 0,
        players: 2,
        officialOverall: 2,
        lineAttributes: { players: 2, fields: {} },
        primaryPosition: 2,
        secondaryPositions: 0,
        playStyles: { players: 0, normal: 0, plus: 0 },
        club: 2,
        league: 2,
        salary: { players: 0, paths: [] },
        contract: { players: 0, paths: [] },
        loan: { players: 0, paths: [] },
        goalkeeperSpecificAttributes: { players: 0, fields: [], fieldPlayers: {} },
      },
    }),
    onWriteStart: async () => { writeStarts++ },
    updateCheckpoint: async () => { checkpoints++ },
    createRunId: () => "run-no-op",
  })

  assert.equal(report.runId, "run-no-op")
  assert.equal(report.actions.NO_OP, 2)
  assert.equal(report.batches[0].catalogSignal, "UNCHANGED_ETAG")
  assert.equal(report.checkpoint.scannedOffset, 2)
  assert.equal(report.checkpoint.persistedOffset, 0)
  assert.equal(report.checkpoint.advanced, false)
  assert.equal(checkpoints, 0)
  assert.equal(writeStarts, 0)
  assert.equal(report.requests, 1)
  assert.equal(report.batches.length, 1)
  assert.equal(report.batches[0].offset, 0)
  assert.equal(report.batches[0].limit, 2)
  assert.equal(report.batches[0].totalItems, 2)
  assert.equal(report.batches[0].observedAt.toISOString(), "2026-09-17T12:00:00.000Z")
  assert.equal(report.batches[0].responseDate?.toISOString(), "2026-09-17T12:00:00.000Z")
  assert.equal(report.batches[0].etag, "catalog-etag")
  assert.equal(report.batches[0].lastModified, null)
  assert.notEqual(report.batches[0].sourceAudit, null)
})

test("reports unavailable HTTP metadata as null without inventing values", async () => {
  const report = await runEaAutoSync(config, {
    fetchBatch: async () => ({
      players: [player()],
      totalItems: 1,
      provenance: {
        ...provenance(0, 2, 1),
        responseDate: null,
        etag: null,
        lastModified: null,
      },
    }),
    normalizePlayer: (value) => value,
    processBatch: async () => processed(["NO_OP"]),
  })

  assert.equal(report.batches[0].responseDate, null)
  assert.equal(report.batches[0].etag, null)
  assert.equal(report.batches[0].lastModified, null)
  assert.equal(report.batches[0].sourceAudit, null)
})

test("write mode advances checkpoint only after a valid semantic UPDATE", async () => {
  const order: string[] = []
  const report = await runEaAutoSync({ ...config, mode: "write" }, {
    fetchBatch: async () => ({ players: [player()], totalItems: 1, provenance: provenance(0, 2, 1) }),
    normalizePlayer: (value) => value,
    processBatch: async (_players, options) => {
      assert.equal(options.dryRun, false)
      order.push("process")
      return processed(["UPDATE"], [["officialOverall"]])
    },
    onWriteStart: async () => { order.push("start") },
    onBatchAccepted: async () => { order.push("accepted") },
    updateCheckpoint: async (offset) => { order.push(`checkpoint:${offset}`) },
    onCatalogCompleted: async () => { order.push("completed") },
  })

  assert.deepEqual(order, ["start", "process", "accepted", "checkpoint:1", "completed"])
  assert.equal(report.actions.UPDATE, 1)
  assert.deepEqual(report.batches[0].changedFields["1"], ["officialOverall"])
  assert.deepEqual(report.batches[0].changes["1"], [{
    field: "officialOverall",
    before: "before",
    after: "after",
    reason: "SOURCE_VALUE_CHANGED",
  }])
  assert.equal(report.checkpoint.persistedOffset, 1)
})

test("club and PlayStyle changes remain observable as semantic fields", async () => {
  const report = await runEaAutoSync(config, {
    fetchBatch: async () => ({ players: [player()], totalItems: 1, provenance: provenance(0, 2, 1) }),
    normalizePlayer: (value) => value,
    processBatch: async () => processed(["UPDATE"], [["club.externalId", "club.name", "playStyles"]]),
  })
  assert.deepEqual(report.batches[0].changedFields["1"], ["club.externalId", "club.name", "playStyles"])
})

test("new EA externalId is reported as CREATE without implicit deletion", async () => {
  const report = await runEaAutoSync(config, {
    fetchBatch: async () => ({ players: [player("new")], totalItems: 1, provenance: provenance(0, 2, 1) }),
    normalizePlayer: (value) => value,
    processBatch: async () => processed(["CREATE"], [["player"]]),
  })
  assert.equal(report.actions.CREATE, 1)
  assert.equal(report.removalPolicy, "NO_AUTO_DELETE")
})

test("conflict stops the batch and cannot advance checkpoint or fetch the next batch", async () => {
  let requests = 0
  let checkpoints = 0
  const report = await runEaAutoSync({ ...config, mode: "write", maxBatches: 2 }, {
    fetchBatch: async () => {
      requests++
      return { players: [player()], totalItems: 4, provenance: provenance(0, 2, 4) }
    },
    normalizePlayer: (value) => value,
    processBatch: async () => processed(["CONFLICT"]),
    updateCheckpoint: async () => { checkpoints++ },
  })
  assert.equal(report.actions.CONFLICT, 1)
  assert.equal(requests, 1)
  assert.equal(checkpoints, 0)
  assert.match(report.stoppedReason ?? "", /BATCH_INCOMPLETE/)
})

test("invalid payload stops before persistence and checkpoint", async () => {
  let processes = 0
  let checkpoints = 0
  const report = await runEaAutoSync({ ...config, mode: "write" }, {
    fetchBatch: async () => ({ players: [player()], totalItems: 1, provenance: provenance(0, 2, 1) }),
    normalizePlayer: () => { throw new Error("INVALID_PAYLOAD") },
    processBatch: async () => { processes++; return processed([]) },
    updateCheckpoint: async () => { checkpoints++ },
  })
  assert.equal(report.actions.INVALID, 1)
  assert.equal(processes, 0)
  assert.equal(checkpoints, 0)
})

test("duplicate EA identity is a conflict before semantic persistence", async () => {
  let processes = 0
  const report = await runEaAutoSync(config, {
    fetchBatch: async () => ({ players: [player("1"), player("1")], totalItems: 2, provenance: provenance() }),
    normalizePlayer: (value) => value,
    processBatch: async () => { processes++; return processed([]) },
  })
  assert.equal(processes, 0)
  assert.equal(report.actions.CONFLICT, 1)
  assert.match(report.stoppedReason ?? "", /DUPLICATE_EXTERNAL_ID/)
})

test("provider failure uses zero automatic retry", async () => {
  let requests = 0
  const report = await runEaAutoSync({ ...config, maxBatches: 3 }, {
    fetchBatch: async () => { requests++; throw new Error("TIMEOUT") },
    normalizePlayer: (value: NormalizedPlayer) => value,
    processBatch: async () => processed([]),
  })
  assert.equal(requests, 1)
  assert.equal(report.requests, 1)
  assert.match(report.stoppedReason ?? "", /TIMEOUT/)
})

test("partial database failure preserves checkpoint and marks the run incomplete", async () => {
  let checkpoints = 0
  const partial = processed(["UPDATE", "NO_OP"])
  partial.failed = 1
  partial.success = 1
  const report = await runEaAutoSync({ ...config, mode: "write" }, {
    fetchBatch: async () => ({ players: [player("1"), player("2")], totalItems: 2, provenance: provenance() }),
    normalizePlayer: (value) => value,
    processBatch: async () => partial,
    updateCheckpoint: async () => { checkpoints++ },
  })
  assert.equal(checkpoints, 0)
  assert.equal(report.checkpoint.persistedOffset, 0)
  assert.equal(report.batches[0].valid, false)
})

test("repeated dry-runs remain idempotent NO_OP observations", async () => {
  const run = () => runEaAutoSync(config, {
    fetchBatch: async () => ({ players: [player()], totalItems: 1, provenance: provenance(0, 2, 1) }),
    normalizePlayer: (value) => value,
    processBatch: async () => processed(["NO_OP"]),
  })
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(first.actions.NO_OP, 1)
  assert.equal(second.actions.NO_OP, 1)
  assert.equal(first.checkpoint.advanced, false)
  assert.equal(second.checkpoint.advanced, false)
})

test("catalog signals are conservative when headers are absent or only Last-Modified matches", () => {
  const current = provenance()
  assert.equal(assessEaCatalogChangeSignal({ ...current, etag: null }, null), "UNKNOWN")
  assert.equal(assessEaCatalogChangeSignal({ ...current, etag: "new" }, {
    etag: "old", lastModified: null, totalItems: 2, batchHash: "hash",
  }), "CHANGED_ETAG")
  const lastModified = new Date("2026-09-17T10:00:00.000Z")
  assert.equal(assessEaCatalogChangeSignal({ ...current, etag: null, lastModified }, {
    etag: null, lastModified, totalItems: 2, batchHash: "hash",
  }), "UNCHANGED_LAST_MODIFIED_HINT")
})

test("auto-sync adapter reuses the EA pipeline and contains no Current Club V2 writer or scheduler", () => {
  const runner = readFileSync("sync/runEARatingsAutoSync.ts", "utf8")
  assert.match(runner, /EARatingsProvider/)
  assert.match(runner, /mapEARatingsPlayer/)
  assert.match(runner, /normalizePlayer/)
  assert.match(runner, /syncPlayers/)
  assert.match(runner, /updateSyncOffset/)
  for (const forbidden of [
    "playerApprovedCurrentClub", "playerCurrentClubProposal",
    "playerTransferObservation", "playerCurrentClubState", "Player.clubId",
    "cron", "schedule",
  ]) {
    assert.equal(runner.includes(forbidden), false)
  }
})
