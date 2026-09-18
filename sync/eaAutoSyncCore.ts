import { randomUUID } from "node:crypto"

import {
  eaCatalogBatchHash,
  normalizedPlayerSnapshot,
  type EaCatalogBatchProvenance,
  type EaSemanticSyncAction,
  type EaSemanticSyncPlan,
} from "../lib/eaCatalogSemanticSync"
import type { NormalizedPlayer } from "../types/normalizedPlayer"
import type { EaAutoSyncSourceAudit } from "./eaAutoSyncSourceAudit"

export type EaAutoSyncMode = "dry-run" | "write"

export type EaCatalogChangeSignal =
  | "CHANGED_ETAG"
  | "UNCHANGED_ETAG"
  | "UNCHANGED_LAST_MODIFIED_HINT"
  | "UNKNOWN"

export type EaPreviousBatchSignal = {
  etag: string | null
  lastModified: Date | null
  totalItems: number
  batchHash: string
}

export type EaAutoSyncProcessResult = {
  processed: number
  success: number
  failed: number
  created: number
  updated: number
  noOp: number
  conflicts: number
  invalid: number
  items: Array<EaSemanticSyncPlan & { playerId: string | null }>
}

export type EaAutoSyncSourceBatch<SourcePlayer> = {
  players: SourcePlayer[]
  totalItems: number
  provenance: EaCatalogBatchProvenance
}

export type EaAutoSyncConfig = {
  mode: EaAutoSyncMode
  initialOffset: number
  batchSize: number
  maxBatches: number
  locale: string
  gender: number
}

export type EaAutoSyncError = {
  stage: "provider" | "mapper" | "normalizer" | "database" | "checkpoint"
  offset: number
  externalId: string | null
  message: string
}

export type EaAutoSyncBatchReport = {
  offset: number
  limit: number
  received: number
  totalItems: number
  observedAt: Date
  responseDate: Date | null
  etag: string | null
  lastModified: Date | null
  batchHash: string | null
  catalogSignal: EaCatalogChangeSignal
  etagAvailable: boolean
  lastModifiedAvailable: boolean
  actions: Record<EaSemanticSyncAction, number>
  changedFields: Record<string, string[]>
  changes: Record<string, EaSemanticSyncPlan["changes"]>
  sourceAudit: EaAutoSyncSourceAudit | null
  valid: boolean
}

export type EaAutoSyncRunReport = {
  runId: string
  mode: EaAutoSyncMode
  startedAt: Date
  finishedAt: Date
  catalogContext: {
    provider: string | null
    endpoint: string | null
    eaGameVersion: string | null
    gameVersionEvidence: string | null
    locale: string
    gender: number
  }
  requests: number
  playersRead: number
  actions: Record<EaSemanticSyncAction, number>
  errors: EaAutoSyncError[]
  batches: EaAutoSyncBatchReport[]
  checkpoint: {
    initialOffset: number
    scannedOffset: number
    persistedOffset: number
    advanced: boolean
  }
  completedCatalog: boolean
  stoppedReason: string | null
  removalPolicy: "NO_AUTO_DELETE"
}

export type EaAutoSyncDependencies<SourcePlayer> = {
  fetchBatch(input: {
    limit: number
    offset: number
    locale: string
    gender: number
  }): Promise<EaAutoSyncSourceBatch<SourcePlayer>>
  normalizePlayer(player: SourcePlayer): NormalizedPlayer
  inspectSourceBatch?(players: SourcePlayer[]): EaAutoSyncSourceAudit
  processBatch(
    players: NormalizedPlayer[],
    options: { dryRun: boolean; provenance: EaCatalogBatchProvenance }
  ): Promise<EaAutoSyncProcessResult>
  loadPreviousBatchSignal?(
    provenance: EaCatalogBatchProvenance
  ): Promise<EaPreviousBatchSignal | null>
  onWriteStart?(): Promise<void>
  onBatchAccepted?(players: NormalizedPlayer[]): Promise<void>
  updateCheckpoint?(offset: number): Promise<void>
  onCatalogCompleted?(): Promise<void>
  onFailure?(error: EaAutoSyncError): Promise<void>
  now?: () => Date
  createRunId?: () => string
}

const emptyActions = (): Record<EaSemanticSyncAction, number> => ({
  CREATE: 0,
  UPDATE: 0,
  NO_OP: 0,
  CONFLICT: 0,
  INVALID: 0,
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function assessEaCatalogChangeSignal(
  current: EaCatalogBatchProvenance,
  previous: EaPreviousBatchSignal | null
): EaCatalogChangeSignal {
  if (!previous) return "UNKNOWN"

  if (current.etag && previous.etag) {
    return current.etag === previous.etag
      ? "UNCHANGED_ETAG"
      : "CHANGED_ETAG"
  }

  if (
    current.lastModified &&
    previous.lastModified &&
    current.totalItems === previous.totalItems &&
    current.lastModified.getTime() === previous.lastModified.getTime()
  ) {
    return "UNCHANGED_LAST_MODIFIED_HINT"
  }

  return "UNKNOWN"
}

function validateConfig(config: EaAutoSyncConfig): void {
  if (!Number.isInteger(config.initialOffset) || config.initialOffset < 0) {
    throw new Error("EA_AUTO_SYNC_INITIAL_OFFSET_INVALID")
  }
  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    throw new Error("EA_AUTO_SYNC_BATCH_SIZE_INVALID")
  }
  if (!Number.isInteger(config.maxBatches) || config.maxBatches <= 0) {
    throw new Error("EA_AUTO_SYNC_MAX_BATCHES_INVALID")
  }
  if (!config.locale.trim() || !Number.isInteger(config.gender)) {
    throw new Error("EA_AUTO_SYNC_SOURCE_CONTEXT_INVALID")
  }
}

export async function runEaAutoSync<SourcePlayer>(
  config: EaAutoSyncConfig,
  dependencies: EaAutoSyncDependencies<SourcePlayer>
): Promise<EaAutoSyncRunReport> {
  validateConfig(config)

  const now = dependencies.now ?? (() => new Date())
  const report: EaAutoSyncRunReport = {
    runId: (dependencies.createRunId ?? randomUUID)(),
    mode: config.mode,
    startedAt: now(),
    finishedAt: now(),
    catalogContext: {
      provider: null,
      endpoint: null,
      eaGameVersion: null,
      gameVersionEvidence: null,
      locale: config.locale,
      gender: config.gender,
    },
    requests: 0,
    playersRead: 0,
    actions: emptyActions(),
    errors: [],
    batches: [],
    checkpoint: {
      initialOffset: config.initialOffset,
      scannedOffset: config.initialOffset,
      persistedOffset: config.initialOffset,
      advanced: false,
    },
    completedCatalog: false,
    stoppedReason: null,
    removalPolicy: "NO_AUTO_DELETE",
  }

  const fail = async (error: EaAutoSyncError) => {
    report.errors.push(error)
    report.stoppedReason = `${error.stage.toUpperCase()}:${error.message}`
    if (config.mode === "write" && dependencies.onFailure) {
      await dependencies.onFailure(error)
    }
  }

  if (config.mode === "write") {
    if (!dependencies.updateCheckpoint) {
      throw new Error("EA_AUTO_SYNC_WRITE_CHECKPOINT_REQUIRED")
    }
    await dependencies.onWriteStart?.()
  }

  let offset = config.initialOffset

  for (let batchIndex = 0; batchIndex < config.maxBatches; batchIndex++) {
    let batch: EaAutoSyncSourceBatch<SourcePlayer>
    try {
      report.requests++
      batch = await dependencies.fetchBatch({
        limit: config.batchSize,
        offset,
        locale: config.locale,
        gender: config.gender,
      })
    } catch (error) {
      await fail({ stage: "provider", offset, externalId: null, message: errorMessage(error) })
      break
    }

    report.catalogContext = {
      provider: batch.provenance.provider,
      endpoint: batch.provenance.endpoint,
      eaGameVersion: batch.provenance.eaGameVersion,
      gameVersionEvidence: batch.provenance.gameVersionEvidence,
      locale: batch.provenance.locale,
      gender: batch.provenance.gender,
    }
    report.playersRead += batch.players.length

    if (batch.players.length === 0) {
      report.completedCatalog = true
      if (config.mode === "write") await dependencies.onCatalogCompleted?.()
      break
    }

    const normalized: NormalizedPlayer[] = []
    for (const sourcePlayer of batch.players) {
      try {
        normalized.push(dependencies.normalizePlayer(sourcePlayer))
      } catch (error) {
        report.actions.INVALID++
        await fail({ stage: "normalizer", offset, externalId: null, message: errorMessage(error) })
        break
      }
    }

    if (normalized.length !== batch.players.length) break

    const externalIds = normalized.map((player) => player.externalId)
    if (new Set(externalIds).size !== externalIds.length) {
      report.actions.CONFLICT++
      await fail({
        stage: "normalizer",
        offset,
        externalId: null,
        message: "EA_AUTO_SYNC_DUPLICATE_EXTERNAL_ID",
      })
      break
    }

    const batchHash = eaCatalogBatchHash(normalized.map(normalizedPlayerSnapshot))
    const previous = dependencies.loadPreviousBatchSignal
      ? await dependencies.loadPreviousBatchSignal(batch.provenance)
      : null
    const catalogSignal = assessEaCatalogChangeSignal(batch.provenance, previous)

    let processed: EaAutoSyncProcessResult
    try {
      processed = await dependencies.processBatch(normalized, {
        dryRun: config.mode === "dry-run",
        provenance: batch.provenance,
      })
    } catch (error) {
      await fail({ stage: "database", offset, externalId: null, message: errorMessage(error) })
      break
    }

    const actions = emptyActions()
    actions.CREATE = processed.created
    actions.UPDATE = processed.updated
    actions.NO_OP = processed.noOp
    actions.CONFLICT = processed.conflicts
    actions.INVALID = processed.invalid
    for (const action of Object.keys(actions) as EaSemanticSyncAction[]) {
      report.actions[action] += actions[action]
    }

    const valid =
      processed.processed === normalized.length &&
      processed.failed === 0 &&
      processed.conflicts === 0 &&
      processed.invalid === 0 &&
      (config.mode === "dry-run" || processed.success === normalized.length)

    report.batches.push({
      offset: batch.provenance.requestOffset,
      limit: batch.provenance.requestLimit,
      received: batch.players.length,
      totalItems: batch.totalItems,
      observedAt: batch.provenance.observedAt,
      responseDate: batch.provenance.responseDate,
      etag: batch.provenance.etag,
      lastModified: batch.provenance.lastModified,
      batchHash,
      catalogSignal,
      etagAvailable: batch.provenance.etag !== null,
      lastModifiedAvailable: batch.provenance.lastModified !== null,
      actions,
      changedFields: Object.fromEntries(processed.items.map((item) => [item.externalId, item.changedFields])),
      changes: Object.fromEntries(processed.items.map((item) => [item.externalId, item.changes])),
      sourceAudit: dependencies.inspectSourceBatch?.(batch.players) ?? null,
      valid,
    })

    if (!valid) {
      await fail({ stage: "database", offset, externalId: null, message: "EA_AUTO_SYNC_BATCH_INCOMPLETE" })
      break
    }

    const nextOffset = offset + batch.players.length
    report.checkpoint.scannedOffset = nextOffset

    if (config.mode === "write") {
      try {
        await dependencies.onBatchAccepted?.(normalized)
        await dependencies.updateCheckpoint!(nextOffset)
        report.checkpoint.persistedOffset = nextOffset
        report.checkpoint.advanced = true
      } catch (error) {
        await fail({ stage: "checkpoint", offset, externalId: null, message: errorMessage(error) })
        break
      }
    }

    offset = nextOffset

    if (batch.players.length < config.batchSize || offset >= batch.totalItems) {
      report.completedCatalog = true
      if (config.mode === "write") await dependencies.onCatalogCompleted?.()
      break
    }
  }

  report.finishedAt = now()
  return report
}
