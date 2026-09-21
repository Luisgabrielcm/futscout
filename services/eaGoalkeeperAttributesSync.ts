import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

import type { EaCatalogBatchProvenance } from "../lib/eaCatalogSemanticSync"
import type { GoalkeeperAttributeField, GoalkeeperAttributePatch, GoalkeeperAttributeValues } from "../types/goalkeeperAttributes"
import { GOALKEEPER_ATTRIBUTE_FIELDS } from "../types/goalkeeperAttributes"
import type { PlayerPosition } from "../types/player"
import { planEaGoalkeeperAttributes } from "./eaGoalkeeperAttributes"

export const EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY = "ea-ratings-players:fc27:gk-attributes-write-v1"
export const EA_GOALKEEPER_HISTORICAL_SYNC_KEY = "ea-ratings-players"
export const EA_GOALKEEPER_BATCH_SIZE = 50

export type EaGoalkeeperStoredAttributes = GoalkeeperAttributeValues & Readonly<{
  id: string
  payloadHash: string
  updatedAt: string
}>

export type EaGoalkeeperOperationalState = Readonly<{
  playerId: string
  externalId: string
  name: string
  position: PlayerPosition
  playerUpdatedAt: string
  attributes: EaGoalkeeperStoredAttributes | null
}>

export type EaGoalkeeperWritePlan = Readonly<{
  sourceIndex: number
  sourcePage: number
  playerId: string | null
  externalId: string
  name: string
  action: "CREATE" | "UPDATE" | "NO_OP" | "INVALID" | "CONFLICT"
  reason: string
  before: GoalkeeperAttributeValues | null
  after: GoalkeeperAttributeValues | null
  changedFields: GoalkeeperAttributeField[]
  preservedFields: GoalkeeperAttributeField[]
  payloadHash: string
  expectedPlayerUpdatedAt: string | null
  expectedStateHash: string | null
}>

export function eaGoalkeeperOperationalStateHash(state: EaGoalkeeperOperationalState): string {
  return createHash("sha256").update(JSON.stringify({
    playerId: state.playerId,
    externalId: state.externalId,
    position: state.position,
    playerUpdatedAt: state.playerUpdatedAt,
    attributes: state.attributes,
  })).digest("hex")
}

export function planEaGoalkeeperAttributesWrite(input: {
  sourceIndex: number
  sourcePage: number
  player: { externalId: string; name: string; position: PlayerPosition; goalkeeperAttributes?: GoalkeeperAttributePatch }
  current: EaGoalkeeperOperationalState | null
}): EaGoalkeeperWritePlan {
  const currentValues = input.current?.attributes ? Object.fromEntries(
    GOALKEEPER_ATTRIBUTE_FIELDS.map(field => [field, input.current?.attributes?.[field]])
  ) as GoalkeeperAttributeValues : null
  const pure = planEaGoalkeeperAttributes({
    externalId: input.player.externalId,
    position: input.player.position,
    incoming: input.player.goalkeeperAttributes,
    current: input.current ? {
      playerId: input.current.playerId,
      externalId: input.current.externalId,
      position: input.current.position,
      attributes: currentValues,
    } : null,
  })
  const base = {
    sourceIndex: input.sourceIndex,
    sourcePage: input.sourcePage,
    playerId: input.current?.playerId ?? null,
    externalId: input.player.externalId,
    name: input.player.name,
    expectedPlayerUpdatedAt: input.current?.playerUpdatedAt ?? null,
    expectedStateHash: input.current ? eaGoalkeeperOperationalStateHash(input.current) : null,
  }
  if (!input.current) return { ...base, ...pure, action: "CONFLICT", reason: "PLAYER_IDENTITY_NOT_FOUND" }
  if (input.current.externalId !== input.player.externalId) {
    return { ...base, ...pure, action: "CONFLICT", reason: "PLAYER_IDENTITY_CONFLICT" }
  }
  if (input.player.position !== "GOL" || input.current.position !== "GOL") {
    return { ...base, ...pure, action: "INVALID", reason: "PRIMARY_POSITION_NOT_GOALKEEPER" }
  }
  return { ...base, ...pure }
}

export type EaGoalkeeperCursor = Readonly<{
  key: string
  offset: number
  batchSize: number
  status: string
  updatedAt: string
}>

export type EaGoalkeeperAudit = Readonly<{
  protected: Record<string, Readonly<{ count: string; hash: string }>>
  historicalCheckpoint: Readonly<{ offset: number; updatedAt: string }> | null
  positionCursor: Readonly<{ offset: number; updatedAt: string }> | null
}>

export type EaGoalkeeperSourcePage = Readonly<{
  pageIndex: number
  provenance: EaCatalogBatchProvenance
  batchHash: string
  externalIds: string[]
}>

export type EaGoalkeeperWriteTransaction = {
  readHistoricalCheckpoint(key: string): Promise<{ offset: number; updatedAt: string } | null>
  readCursor(key: string): Promise<EaGoalkeeperCursor | null>
  readPlayer(externalId: string): Promise<EaGoalkeeperOperationalState | null>
  createProvenance(page: EaGoalkeeperSourcePage, plans: readonly EaGoalkeeperWritePlan[]): Promise<string>
  createAttributes(plan: EaGoalkeeperWritePlan, observationId: string, observedAt: Date): Promise<number>
  updateAttributes(plan: EaGoalkeeperWritePlan, observationId: string, observedAt: Date): Promise<number>
  verify(plans: readonly EaGoalkeeperWritePlan[], observationIds: ReadonlyMap<number, string>): Promise<boolean>
  advanceCursor(input: { key: string; expected: EaGoalkeeperCursor | null; offset: number; batchSize: number;
    completed: boolean; now: Date }): Promise<number>
}

export type EaGoalkeeperWriteStore = {
  audit(): Promise<EaGoalkeeperAudit>
  transaction<T>(work: (tx: EaGoalkeeperWriteTransaction) => Promise<T>): Promise<T>
}

export type EaGoalkeeperWriteRequest = Readonly<{
  key: string
  historicalKey: string
  expectedHistoricalCheckpoint: { offset: number; updatedAt: string }
  expectedCursor: EaGoalkeeperCursor | null
  sourceOffset: number
  nextOffset: number
  totalItems: number
  sourcePages: readonly EaGoalkeeperSourcePage[]
  plans: readonly EaGoalkeeperWritePlan[]
}>

export type EaGoalkeeperWriteResult = Readonly<{
  status: "COMMITTED" | "BLOCKED" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"
  written: number
  nextOffset: number
  provenanceIds: string[]
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  retries: 0
  reason: string
}>

class GoalkeeperWriteAbort extends Error {
  constructor(readonly status: EaGoalkeeperWriteResult["status"], readonly safeReason: string) { super(safeReason) }
}

const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null

function result(request: EaGoalkeeperWriteRequest, status: EaGoalkeeperWriteResult["status"],
  transactionState: EaGoalkeeperWriteResult["transactionState"], reason: string, written = 0,
  provenanceIds: string[] = []): EaGoalkeeperWriteResult {
  return { status, written, nextOffset: request.nextOffset, provenanceIds, transactionState, retries: 0, reason }
}

function validRequest(request: EaGoalkeeperWriteRequest): boolean {
  if (request.key !== EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY || request.historicalKey !== EA_GOALKEEPER_HISTORICAL_SYNC_KEY ||
      request.sourceOffset < 0 || request.nextOffset <= request.sourceOffset || request.nextOffset > request.totalItems ||
      request.plans.length === 0 || request.plans.length > EA_GOALKEEPER_BATCH_SIZE) return false
  const ids = request.plans.map(plan => plan.externalId)
  const pageIndexes = request.sourcePages.map(page => page.pageIndex)
  const pages = new Set(pageIndexes)
  if (new Set(ids).size !== ids.length || request.sourcePages.length === 0 || pages.size !== pageIndexes.length) return false
  return request.plans.every(plan => pages.has(plan.sourcePage) &&
    request.sourcePages.find(page => page.pageIndex === plan.sourcePage)?.externalIds.includes(plan.externalId) &&
    ["CREATE", "UPDATE", "NO_OP"].includes(plan.action) &&
    plan.playerId && plan.expectedPlayerUpdatedAt && plan.expectedStateHash && plan.after &&
    Object.keys(plan.after).length === GOALKEEPER_ATTRIBUTE_FIELDS.length &&
    Object.keys(plan.after).every(field => (GOALKEEPER_ATTRIBUTE_FIELDS as readonly string[]).includes(field)) &&
    plan.changedFields.every(field => (GOALKEEPER_ATTRIBUTE_FIELDS as readonly string[]).includes(field))) &&
    request.sourcePages.every(page => page.provenance.totalItems === request.totalItems &&
      page.externalIds.length === request.plans.filter(plan => plan.sourcePage === page.pageIndex).length &&
      page.externalIds.every(id => ids.includes(id)))
}

export async function persistEaGoalkeeperBatchAtomically(store: EaGoalkeeperWriteStore,
  request: EaGoalkeeperWriteRequest, now: () => Date = () => new Date()): Promise<EaGoalkeeperWriteResult> {
  if (!validRequest(request)) return result(request, "BLOCKED", "NOT_STARTED", "FIELD_SCOPE_OR_BATCH_INVALID")
  const beforeAudit = await store.audit()
  if (!isDeepStrictEqual(beforeAudit.historicalCheckpoint, request.expectedHistoricalCheckpoint)) {
    return result(request, "CONCURRENT_MODIFICATION", "NOT_STARTED", "HISTORICAL_CHECKPOINT_CHANGED")
  }
  let callbackReturned = false
  try {
    const committed = await store.transaction(async tx => {
      const historical = await tx.readHistoricalCheckpoint(request.historicalKey)
      const cursor = await tx.readCursor(request.key)
      if (!isDeepStrictEqual(historical, request.expectedHistoricalCheckpoint) ||
          !isDeepStrictEqual(cursor, request.expectedCursor) || (cursor?.offset ?? 0) !== request.sourceOffset) {
        throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_OR_CHECKPOINT_CHANGED")
      }
      for (const plan of request.plans) {
        const current = await tx.readPlayer(plan.externalId)
        if (!current || current.playerId !== plan.playerId || current.playerUpdatedAt !== plan.expectedPlayerUpdatedAt ||
            current.position !== "GOL" || eaGoalkeeperOperationalStateHash(current) !== plan.expectedStateHash) {
          throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", `PLAYER_OR_GK_STATE_CHANGED:${plan.externalId}`)
        }
      }
      const observationIds = new Map<number, string>()
      for (const page of request.sourcePages) {
        observationIds.set(page.pageIndex, await tx.createProvenance(page,
          request.plans.filter(plan => plan.sourcePage === page.pageIndex)))
      }
      let written = 0
      for (const plan of request.plans) {
        if (plan.action === "NO_OP") continue
        const observationId = observationIds.get(plan.sourcePage)!
        const observedAt = request.sourcePages.find(page => page.pageIndex === plan.sourcePage)!.provenance.observedAt
        const count = plan.action === "CREATE"
          ? await tx.createAttributes(plan, observationId, observedAt)
          : await tx.updateAttributes(plan, observationId, observedAt)
        if (count !== 1) throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", `GOALKEEPER_CAS_FAILED:${plan.externalId}`)
        written++
      }
      if (!await tx.verify(request.plans, observationIds)) {
        throw new GoalkeeperWriteAbort("ROLLED_BACK", "GOALKEEPER_READ_BACK_MISMATCH")
      }
      if (await tx.advanceCursor({ key: request.key, expected: request.expectedCursor, offset: request.nextOffset,
        batchSize: EA_GOALKEEPER_BATCH_SIZE, completed: request.nextOffset >= request.totalItems, now: now() }) !== 1) {
        throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_CAS_FAILED")
      }
      callbackReturned = true
      return { written, provenanceIds: [...observationIds.values()] }
    })
    const afterAudit = await store.audit()
    if (!isDeepStrictEqual(beforeAudit, afterAudit)) {
      return result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "PROTECTED_STATE_CHANGED",
        committed.written, committed.provenanceIds)
    }
    return result(request, "COMMITTED", "COMMIT_CONFIRMED", "GOALKEEPER_BATCH_COMMITTED",
      committed.written, committed.provenanceIds)
  } catch (error) {
    if (error instanceof GoalkeeperWriteAbort) return result(request, error.status, "ROLLED_BACK", error.safeReason)
    const code = errorCode(error)
    const concurrent = ["P2034", "40001", "40P01"].includes(code ?? "")
    if (callbackReturned && !concurrent) {
      return result(request, "INDETERMINATE_COMMIT", "COMMIT_INDETERMINATE", "COMMIT_ACKNOWLEDGEMENT_UNKNOWN")
    }
    return result(request, concurrent ? "CONCURRENT_MODIFICATION" : "ROLLED_BACK", "ROLLED_BACK",
      concurrent ? "DATABASE_CONCURRENCY_CONFLICT" : "TRANSACTION_FAILED")
  }
}
