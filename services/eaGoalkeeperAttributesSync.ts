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

export type EaGoalkeeperReadBackCategory =
  | "PLAYER_OR_POSITION"
  | "GK_ROW_MISSING"
  | "GK_DIVING_MISMATCH"
  | "GK_HANDLING_MISMATCH"
  | "GK_KICKING_MISMATCH"
  | "GK_POSITIONING_MISMATCH"
  | "GK_REFLEXES_MISMATCH"
  | "PAYLOAD_HASH_MISMATCH"
  | "SOURCE_OBSERVATION_MISMATCH"
  | "INVALID_PLAN"

export type EaGoalkeeperReadBackResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; category: EaGoalkeeperReadBackCategory; externalId: string }>

const readBackValueMismatchCategory: Record<GoalkeeperAttributeField, EaGoalkeeperReadBackCategory> = {
  diving: "GK_DIVING_MISMATCH",
  handling: "GK_HANDLING_MISMATCH",
  kicking: "GK_KICKING_MISMATCH",
  positioning: "GK_POSITIONING_MISMATCH",
  reflexes: "GK_REFLEXES_MISMATCH",
}

export function verifyEaGoalkeeperReadBack(input: {
  plan: EaGoalkeeperWritePlan
  current: EaGoalkeeperOperationalState | null
  expectedSourceObservationId: string | undefined
  persistedSourceObservationId: string | null | undefined
}): EaGoalkeeperReadBackResult {
  const { plan, current } = input
  const mismatch = (category: EaGoalkeeperReadBackCategory): EaGoalkeeperReadBackResult =>
    ({ ok: false, category, externalId: plan.externalId })

  if (!plan.after) return mismatch("INVALID_PLAN")
  if (!current || current.externalId !== plan.externalId || current.playerId !== plan.playerId ||
      current.position !== "GOL") return mismatch("PLAYER_OR_POSITION")
  if (!current.attributes) return mismatch("GK_ROW_MISSING")
  for (const field of GOALKEEPER_ATTRIBUTE_FIELDS) {
    if (current.attributes[field] !== plan.after[field]) {
      return mismatch(readBackValueMismatchCategory[field])
    }
  }
  if (current.attributes.payloadHash !== plan.payloadHash) return mismatch("PAYLOAD_HASH_MISMATCH")
  if (plan.action !== "NO_OP" && (!input.expectedSourceObservationId ||
      input.persistedSourceObservationId !== input.expectedSourceObservationId)) {
    return mismatch("SOURCE_OBSERVATION_MISMATCH")
  }
  return { ok: true }
}

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
  readPlayers(externalIds: readonly string[]): Promise<ReadonlyMap<string, EaGoalkeeperOperationalState>>
  createProvenance(page: EaGoalkeeperSourcePage, plans: readonly EaGoalkeeperWritePlan[]): Promise<string>
  createAttributesBatch(items: readonly Readonly<{ plan: EaGoalkeeperWritePlan; observationId: string;
    observedAt: Date }>[]): Promise<number>
  updateAttributes(plan: EaGoalkeeperWritePlan, expected: EaGoalkeeperOperationalState,
    observationId: string, observedAt: Date): Promise<number>
  verify(plans: readonly EaGoalkeeperWritePlan[], observationIds: ReadonlyMap<number, string>): Promise<EaGoalkeeperReadBackResult>
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

export type EaGoalkeeperWriteFailurePhase =
  | "TRANSACTION_START"
  | "CHECKPOINT_CURSOR_READ"
  | "PLAYER_REVALIDATION"
  | "PROVENANCE_CREATE"
  | "GK_ATTRIBUTE_CREATE"
  | "GK_ATTRIBUTE_UPDATE"
  | "READ_BACK"
  | "CURSOR_ADVANCE"
  | "COMMIT"
  | "POST_COMMIT_AUDIT"

export type EaGoalkeeperReadBackStep = "PLAYER_STATE_READ" | "SOURCE_OBSERVATION_READ" | "PLAYER_BATCH_READ"

export class EaGoalkeeperReadBackStoreError extends Error {
  constructor(readonly step: EaGoalkeeperReadBackStep, readonly externalId: string | null,
    readonly elapsedMs: number, cause: unknown) {
    super("GOALKEEPER_READ_BACK_STORAGE_FAILURE")
    this.name = "EaGoalkeeperReadBackStoreError"
    Object.defineProperty(this, "cause", { value: cause, configurable: true })
  }
}

export async function runEaGoalkeeperReadBackQuery<T>(input: {
  step: EaGoalkeeperReadBackStep
  externalId?: string | null
  query: () => Promise<T>
  now?: () => number
}): Promise<T> {
  const now = input.now ?? Date.now
  const startedAt = now()
  try {
    return await input.query()
  } catch (cause) {
    throw new EaGoalkeeperReadBackStoreError(input.step, input.externalId ?? null,
      Math.max(0, Math.round(now() - startedAt)), cause)
  }
}

export type EaGoalkeeperWriteResult = Readonly<{
  status: "COMMITTED" | "BLOCKED" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH" | "AUDIT_FAILED"
  written: number
  nextOffset: number
  provenanceIds: string[]
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  retries: 0
  reason: string
  // Transaction wall time includes waiting to acquire/start the transaction, but excludes audits.
  // Unmeasured overhead includes acquisition, driver work and commit/rollback; it is NOT commit time.
  timing?: Readonly<{ transactionTotalMs: number; unmeasuredOverheadMs: number;
    preAuditMs: number; postAuditMs: number | null;
    phasesMs: Partial<Record<EaGoalkeeperWriteFailurePhase, number>> }>
  diagnostic?: Readonly<{ phase: EaGoalkeeperWriteFailurePhase; code: string | null;
    category?: EaGoalkeeperReadBackCategory; externalId?: string;
    readBack?: Readonly<{ step: EaGoalkeeperReadBackStep; externalId?: string; elapsedMs: number }> }>
}>

class GoalkeeperWriteAbort extends Error {
  constructor(readonly status: EaGoalkeeperWriteResult["status"], readonly safeReason: string,
    readonly readBack?: Extract<EaGoalkeeperReadBackResult, { ok: false }>) { super(safeReason) }
}

function safeErrorCode(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && typeof current.code === "string" &&
        /^(?:P\d{4}|[0-9A-Z]{5}|E[A-Z0-9_]{3,30})$/.test(current.code)) return current.code
    current = "cause" in current ? current.cause : null
  }
  return null
}

function directErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code : null
}

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
  request: EaGoalkeeperWriteRequest, now: () => Date = () => new Date(),
  clock: () => number = () => performance.now()): Promise<EaGoalkeeperWriteResult> {
  if (!validRequest(request)) return result(request, "BLOCKED", "NOT_STARTED", "FIELD_SCOPE_OR_BATCH_INVALID")
  const preAuditStartedAt = clock()
  const beforeAudit = await store.audit()
  const preAuditMs = Math.max(0, clock() - preAuditStartedAt)
  if (!isDeepStrictEqual(beforeAudit.historicalCheckpoint, request.expectedHistoricalCheckpoint)) {
    return result(request, "CONCURRENT_MODIFICATION", "NOT_STARTED", "HISTORICAL_CHECKPOINT_CHANGED")
  }
  let callbackReturned = false
  let failurePhase: EaGoalkeeperWriteFailurePhase = "TRANSACTION_START"
  let transactionStartedAt: number | undefined
  let transactionEndedAt: number | undefined
  let postAuditMs: number | null = null
  let committed: { written: number; provenanceIds: string[] }
  const phasesMs: Partial<Record<EaGoalkeeperWriteFailurePhase, number>> = {}
  const measure = async <T>(phase: EaGoalkeeperWriteFailurePhase, work: () => Promise<T>): Promise<T> => {
    failurePhase = phase
    const startedAt = clock()
    try { return await work() }
    finally { phasesMs[phase] = (phasesMs[phase] ?? 0) + Math.max(0, clock() - startedAt) }
  }
  const addTiming = (output: EaGoalkeeperWriteResult): EaGoalkeeperWriteResult => {
    if (transactionStartedAt === undefined || transactionEndedAt === undefined) return output
    const transactionTotalMs = Math.max(0, transactionEndedAt - transactionStartedAt)
    const measuredMs = Object.values(phasesMs).reduce((total, elapsed) => total + (elapsed ?? 0), 0)
    return { ...output, timing: { transactionTotalMs, preAuditMs, postAuditMs,
      unmeasuredOverheadMs: Math.max(0, transactionTotalMs - measuredMs), phasesMs: { ...phasesMs } } }
  }
  try {
    transactionStartedAt = clock()
    try {
      committed = await store.transaction(async tx => {
      await measure("CHECKPOINT_CURSOR_READ", async () => {
        const historical = await tx.readHistoricalCheckpoint(request.historicalKey)
        const cursor = await tx.readCursor(request.key)
        if (!isDeepStrictEqual(historical, request.expectedHistoricalCheckpoint) ||
            !isDeepStrictEqual(cursor, request.expectedCursor) || (cursor?.offset ?? 0) !== request.sourceOffset) {
          throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_OR_CHECKPOINT_CHANGED")
        }
        return { historical, cursor }
      })
      const currentPlayers = await measure("PLAYER_REVALIDATION", async () => {
        const players = await tx.readPlayers(request.plans.map(plan => plan.externalId))
        for (const plan of request.plans) {
          const current = players.get(plan.externalId) ?? null
          if (!current || current.playerId !== plan.playerId || current.playerUpdatedAt !== plan.expectedPlayerUpdatedAt ||
              current.position !== "GOL" || eaGoalkeeperOperationalStateHash(current) !== plan.expectedStateHash) {
            throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", `PLAYER_OR_GK_STATE_CHANGED:${plan.externalId}`)
          }
        }
        return players
      })
      const observationIds = new Map<number, string>()
      await measure("PROVENANCE_CREATE", async () => {
        for (const page of request.sourcePages) {
          observationIds.set(page.pageIndex, await tx.createProvenance(page,
            request.plans.filter(plan => plan.sourcePage === page.pageIndex)))
        }
      })
      let written = 0
      const creates = request.plans.filter(plan => plan.action === "CREATE").map(plan => ({
        plan, observationId: observationIds.get(plan.sourcePage)!,
        observedAt: request.sourcePages.find(page => page.pageIndex === plan.sourcePage)!.provenance.observedAt,
      }))
      if (creates.length) {
        const count = await measure("GK_ATTRIBUTE_CREATE", () => tx.createAttributesBatch(creates))
        if (count !== creates.length) throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", "GOALKEEPER_CAS_FAILED")
        written += count
      }
      await measure("GK_ATTRIBUTE_UPDATE", async () => {
        for (const plan of request.plans) {
          if (plan.action !== "UPDATE") continue
          const expected = currentPlayers.get(plan.externalId)!
          const observationId = observationIds.get(plan.sourcePage)!
          const observedAt = request.sourcePages.find(page => page.pageIndex === plan.sourcePage)!.provenance.observedAt
          const count = await tx.updateAttributes(plan, expected, observationId, observedAt)
          if (count !== 1) throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", `GOALKEEPER_CAS_FAILED:${plan.externalId}`)
          written++
        }
      })
      const readBack = await measure("READ_BACK", () => tx.verify(request.plans, observationIds))
      if (!readBack.ok) {
        throw new GoalkeeperWriteAbort("ROLLED_BACK", "GOALKEEPER_READ_BACK_MISMATCH", readBack)
      }
      if (await measure("CURSOR_ADVANCE", () => tx.advanceCursor({ key: request.key, expected: request.expectedCursor,
        offset: request.nextOffset, batchSize: EA_GOALKEEPER_BATCH_SIZE,
        completed: request.nextOffset >= request.totalItems, now: now() })) !== 1) {
        throw new GoalkeeperWriteAbort("CONCURRENT_MODIFICATION", "CURSOR_CAS_FAILED")
      }
      failurePhase = "COMMIT"
      callbackReturned = true
      return { written, provenanceIds: [...observationIds.values()] }
      })
    } finally {
      transactionEndedAt = clock()
    }
  } catch (error) {
    if (error instanceof GoalkeeperWriteAbort) {
      const output = addTiming(result(request, error.status, "ROLLED_BACK", error.safeReason))
      return error.readBack ? { ...output, diagnostic: { phase: "READ_BACK", code: null,
        category: error.readBack.category, externalId: error.readBack.externalId } } : output
    }
    const code = safeErrorCode(error)
    // Keep the pre-existing classification semantics; nested codes enrich diagnostics only.
    const concurrent = ["P2034", "40001", "40P01"].includes(directErrorCode(error) ?? "")
    if (callbackReturned && !concurrent) {
      return { ...addTiming(result(request, "INDETERMINATE_COMMIT", "COMMIT_INDETERMINATE", "COMMIT_ACKNOWLEDGEMENT_UNKNOWN")),
        diagnostic: { phase: failurePhase, code } }
    }
    const readBack = error instanceof EaGoalkeeperReadBackStoreError
      ? { step: error.step, ...(error.externalId ? { externalId: error.externalId } : {}), elapsedMs: error.elapsedMs }
      : undefined
    return { ...addTiming(result(request, concurrent ? "CONCURRENT_MODIFICATION" : "ROLLED_BACK", "ROLLED_BACK",
      concurrent ? "DATABASE_CONCURRENCY_CONFLICT" : "TRANSACTION_FAILED")),
    diagnostic: { phase: failurePhase, code, ...(readBack ? { externalId: readBack.externalId, readBack } : {}) } }
  }
  // The transaction promise resolved: subsequent audit failures cannot undo commit certainty.
  const postAuditStartedAt = clock()
  let afterAudit: EaGoalkeeperAudit
  try {
    try { afterAudit = await store.audit() }
    finally { postAuditMs = Math.max(0, clock() - postAuditStartedAt) }
  } catch (error) {
    return { ...addTiming(result(request, "AUDIT_FAILED", "COMMIT_CONFIRMED", "POST_COMMIT_AUDIT_FAILED",
      committed.written, committed.provenanceIds)),
    diagnostic: { phase: "POST_COMMIT_AUDIT", code: safeErrorCode(error) } }
  }
  if (!isDeepStrictEqual(beforeAudit, afterAudit)) {
    return addTiming(result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "PROTECTED_STATE_CHANGED",
      committed.written, committed.provenanceIds))
  }
  return addTiming(result(request, "COMMITTED", "COMMIT_CONFIRMED", "GOALKEEPER_BATCH_COMMITTED",
    committed.written, committed.provenanceIds))
}
