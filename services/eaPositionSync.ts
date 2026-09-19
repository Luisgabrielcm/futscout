import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

import type { EaCatalogBatchProvenance, EaSemanticSyncAction } from "../lib/eaCatalogSemanticSync"
import type { PlayerPosition } from "../types/player"

export const EA_POSITION_SYNC_KEY = "ea-ratings-players:fc27:position-write-v1"
export const EA_POSITION_HISTORICAL_SYNC_KEY = "ea-ratings-players"

const allowedPositions = new Set<PlayerPosition>([
  "GOL", "LD", "LE", "ZAG", "VOL", "MC", "MD", "ME", "MEI", "PD", "PE", "SA", "ATA",
])
const positionFields = ["position", "secondaryPosition", "secondaryPositions"] as const

export type EaPositionValues = Readonly<{
  position: PlayerPosition
  secondaryPosition: PlayerPosition | null
  secondaryPositions: PlayerPosition[]
}>

export type EaPositionPlayerState = EaPositionValues & Readonly<{
  id: string
  externalId: string
  name: string
  updatedAt: string
}>

export type EaPositionPlanStatus = "READY" | "NO_OP" | "BLOCKED" | "CONFLICT" | "INVALID"

export type EaPositionPlan = Readonly<{
  sourceIndex: number
  playerId: string | null
  externalId: string
  name: string
  status: EaPositionPlanStatus
  reason: string
  before: EaPositionValues | null
  after: EaPositionValues | null
  changedFields: string[]
  sourceChangedFields: string[]
  payloadHash: string
  expectedUpdatedAt: string | null
  expectedStateHash: string | null
}>

export type EaPositionPlanInput = Readonly<{
  sourceIndex: number
  player: Readonly<{
    externalId: string
    name: string
    position: PlayerPosition
    secondaryPosition?: PlayerPosition
    secondaryPositions: PlayerPosition[]
  }>
  current: EaPositionPlayerState | null
  semantic: Readonly<{
    action: EaSemanticSyncAction
    changedFields: string[]
    payloadHash: string
    reason: string | null
  }>
}>

function canonicalPositions(primary: PlayerPosition, alternatives: readonly PlayerPosition[]): PlayerPosition[] {
  if (!allowedPositions.has(primary)) throw new Error("EA_POSITION_PRIMARY_INVALID")
  for (const value of alternatives) {
    if (!allowedPositions.has(value)) throw new Error("EA_POSITION_ALTERNATIVE_INVALID")
  }
  return [...new Set(alternatives.filter((value) => value !== primary))]
    .sort((left, right) => left.localeCompare(right))
}

export function canonicalEaPositionValues(input: {
  position: PlayerPosition
  secondaryPosition?: PlayerPosition | null
  secondaryPositions: readonly PlayerPosition[]
}): EaPositionValues {
  const secondaryPositions = canonicalPositions(input.position, input.secondaryPositions)
  return {
    position: input.position,
    secondaryPosition: secondaryPositions[0] ?? null,
    secondaryPositions,
  }
}

export function eaPositionStateHash(state: EaPositionPlayerState): string {
  return createHash("sha256").update(JSON.stringify({
    id: state.id,
    externalId: state.externalId,
    updatedAt: state.updatedAt,
    position: state.position,
    secondaryPosition: state.secondaryPosition,
    secondaryPositions: [...state.secondaryPositions],
  })).digest("hex")
}

export function planEaPositionSync(input: EaPositionPlanInput): EaPositionPlan {
  const base = {
    sourceIndex: input.sourceIndex,
    playerId: input.current?.id ?? null,
    externalId: input.player.externalId,
    name: input.player.name,
    sourceChangedFields: [...input.semantic.changedFields],
    payloadHash: input.semantic.payloadHash,
    expectedUpdatedAt: input.current?.updatedAt ?? null,
    expectedStateHash: input.current ? eaPositionStateHash(input.current) : null,
  }
  if (input.semantic.action === "INVALID") {
    return { ...base, status: "INVALID", reason: input.semantic.reason ?? "SOURCE_INVALID", before: null,
      after: null, changedFields: [] }
  }
  if (!input.current || input.semantic.action === "CREATE" || input.semantic.action === "CONFLICT" ||
      input.current.externalId !== input.player.externalId) {
    return { ...base, status: "CONFLICT", reason: "PLAYER_IDENTITY_NOT_WRITABLE", before: null,
      after: null, changedFields: [] }
  }

  let after: EaPositionValues
  try {
    after = canonicalEaPositionValues(input.player)
  } catch (error) {
    return { ...base, status: "INVALID", reason: error instanceof Error ? error.message : "POSITION_INVALID",
      before: canonicalEaPositionValues(input.current), after: null, changedFields: [] }
  }
  const before = canonicalEaPositionValues(input.current)
  const changedFields = positionFields.filter((field) => !isDeepStrictEqual(before[field], after[field]))
  if (!changedFields.length) {
    return { ...base, status: "NO_OP", reason: "POSITION_SEMANTICALLY_EQUAL", before, after,
      changedFields: [] }
  }
  return { ...base, status: "READY", reason: "POSITION_CHANGE_READY", before, after,
    changedFields: [...changedFields] }
}

export type EaPositionCursor = Readonly<{
  key: string
  offset: number
  batchSize: number
  status: string
  updatedAt: string
}>

export type EaPositionAudit = Readonly<{
  protected: Record<string, Readonly<{ count: string; hash: string }>>
  historicalCheckpoint: Readonly<{ offset: number; updatedAt: string }> | null
}>

export type EaPositionProvenanceInput = Readonly<{
  provenance: EaCatalogBatchProvenance
  batchHash: string
  plans: readonly EaPositionPlan[]
}>

export type EaPositionWriteTransaction = {
  readHistoricalCheckpoint(key: string): Promise<{ offset: number; updatedAt: string } | null>
  readCursor(key: string): Promise<EaPositionCursor | null>
  readPlayer(externalId: string): Promise<EaPositionPlayerState | null>
  updatePositions(expected: EaPositionPlayerState, after: EaPositionValues): Promise<number>
  verifyPositions(plans: readonly EaPositionPlan[]): Promise<boolean>
  createProvenance(input: EaPositionProvenanceInput): Promise<string>
  advanceCursor(input: {
    key: string
    expected: EaPositionCursor | null
    offset: number
    batchSize: number
    completed: boolean
    now: Date
  }): Promise<number>
}

export type EaPositionWriteStore = {
  audit(): Promise<EaPositionAudit>
  transaction<T>(work: (tx: EaPositionWriteTransaction) => Promise<T>): Promise<T>
}

export type EaPositionWriteRequest = Readonly<{
  key: string
  historicalKey: string
  expectedHistoricalCheckpoint: { offset: number; updatedAt: string }
  expectedCursor: EaPositionCursor | null
  sourceOffset: number
  sourceReceived: number
  batchSize: number
  totalItems: number
  provenance: EaCatalogBatchProvenance
  batchHash: string
  plans: readonly EaPositionPlan[]
}>

export type EaPositionWriteStatus = "COMMITTED" | "BLOCKED" | "CONCURRENT_MODIFICATION" |
  "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"

export type EaPositionWriteResult = Readonly<{
  status: EaPositionWriteStatus
  written: number
  nextOffset: number
  provenanceId: string | null
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  retries: 0
  reason: string
}>

class PositionWriteAbort extends Error {
  constructor(readonly status: EaPositionWriteStatus, readonly safeReason: string) { super(safeReason) }
}

const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null

const writeResult = (request: EaPositionWriteRequest, status: EaPositionWriteStatus,
  transactionState: EaPositionWriteResult["transactionState"], reason: string, written = 0,
  provenanceId: string | null = null): EaPositionWriteResult => ({ status, written,
    nextOffset: request.sourceOffset + request.sourceReceived, provenanceId, transactionState, retries: 0, reason })

function validWriteRequest(request: EaPositionWriteRequest): boolean {
  if (request.key !== EA_POSITION_SYNC_KEY || request.historicalKey !== EA_POSITION_HISTORICAL_SYNC_KEY ||
      request.sourceOffset < 0 || request.sourceReceived <= 0 || request.sourceReceived > request.batchSize ||
      request.batchSize <= 0 || request.plans.length !== request.sourceReceived ||
      request.provenance.requestOffset !== request.sourceOffset ||
      request.provenance.requestLimit !== request.batchSize || request.provenance.totalItems !== request.totalItems) return false
  const ids = request.plans.map((plan) => plan.externalId)
  return new Set(ids).size === ids.length && request.plans.every((plan, index) => plan.sourceIndex === index &&
    ["READY", "NO_OP"].includes(plan.status) && plan.changedFields.every((field) =>
      (positionFields as readonly string[]).includes(field)) &&
    (plan.status !== "READY" || (plan.before !== null && plan.after !== null && plan.playerId !== null &&
      plan.expectedUpdatedAt !== null && plan.expectedStateHash !== null &&
      Object.keys(plan.after).every((field) => (positionFields as readonly string[]).includes(field)))))
}

export async function persistEaPositionBatchAtomically(store: EaPositionWriteStore,
  request: EaPositionWriteRequest, now: () => Date = () => new Date()): Promise<EaPositionWriteResult> {
  if (!validWriteRequest(request)) return writeResult(request, "BLOCKED", "NOT_STARTED", "FIELD_SCOPE_OR_BATCH_INVALID")
  const beforeAudit = await store.audit()
  if (!isDeepStrictEqual(beforeAudit.historicalCheckpoint, request.expectedHistoricalCheckpoint)) {
    return writeResult(request, "CONCURRENT_MODIFICATION", "NOT_STARTED", "HISTORICAL_CHECKPOINT_CHANGED")
  }
  let callbackReturned = false
  try {
    const committed = await store.transaction(async tx => {
      const historical = await tx.readHistoricalCheckpoint(request.historicalKey)
      const cursor = await tx.readCursor(request.key)
      if (!isDeepStrictEqual(historical, request.expectedHistoricalCheckpoint) ||
          !isDeepStrictEqual(cursor, request.expectedCursor) ||
          (cursor?.offset ?? 0) !== request.sourceOffset) {
        throw new PositionWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_OR_CHECKPOINT_CHANGED")
      }
      let written = 0
      for (const plan of request.plans.filter((item) => item.status === "READY")) {
        const current = await tx.readPlayer(plan.externalId)
        if (!current || current.id !== plan.playerId || current.updatedAt !== plan.expectedUpdatedAt ||
            eaPositionStateHash(current) !== plan.expectedStateHash || !isDeepStrictEqual(plan.before,
              canonicalEaPositionValues(current))) {
          throw new PositionWriteAbort("CONCURRENT_MODIFICATION", `PLAYER_STATE_CHANGED:${plan.externalId}`)
        }
        if (await tx.updatePositions(current, plan.after!) !== 1) {
          throw new PositionWriteAbort("CONCURRENT_MODIFICATION", `PLAYER_CAS_FAILED:${plan.externalId}`)
        }
        written++
      }
      if (!await tx.verifyPositions(request.plans.filter((item) => item.status === "READY"))) {
        throw new PositionWriteAbort("ROLLED_BACK", "POSITION_READ_BACK_MISMATCH")
      }
      const provenanceId = await tx.createProvenance({ provenance: request.provenance,
        batchHash: request.batchHash, plans: request.plans })
      const nextOffset = request.sourceOffset + request.sourceReceived
      const cursorWrites = await tx.advanceCursor({ key: request.key, expected: request.expectedCursor,
        offset: nextOffset, batchSize: request.batchSize, completed: nextOffset >= request.totalItems, now: now() })
      if (cursorWrites !== 1) throw new PositionWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_CAS_FAILED")
      callbackReturned = true
      return { written, provenanceId }
    })
    const afterAudit = await store.audit()
    if (!isDeepStrictEqual(beforeAudit.protected, afterAudit.protected) ||
        !isDeepStrictEqual(beforeAudit.historicalCheckpoint, afterAudit.historicalCheckpoint)) {
      return writeResult(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "PROTECTED_STATE_CHANGED",
        committed.written, committed.provenanceId)
    }
    return writeResult(request, "COMMITTED", "COMMIT_CONFIRMED", "POSITION_BATCH_COMMITTED",
      committed.written, committed.provenanceId)
  } catch (error) {
    if (error instanceof PositionWriteAbort) {
      return writeResult(request, error.status, "ROLLED_BACK", error.safeReason)
    }
    const code = errorCode(error)
    if (callbackReturned && !["P2034", "40001", "40P01"].includes(code ?? "")) {
      return writeResult(request, "INDETERMINATE_COMMIT", "COMMIT_INDETERMINATE",
        "COMMIT_ACKNOWLEDGEMENT_UNKNOWN")
    }
    const concurrent = ["P2034", "40001", "40P01"].includes(code ?? "")
    return writeResult(request, concurrent ? "CONCURRENT_MODIFICATION" : "ROLLED_BACK", "ROLLED_BACK",
      concurrent ? "DATABASE_CONCURRENCY_CONFLICT" : "TRANSACTION_FAILED")
  }
}
