import { jointHash, validateJointTransferPayload, type JointMovement, type JointTransferPayload } from "../lib/jointTransferContexts"
import { assessRealGameProjection, projectionHash, type RealGameEligibility } from "../lib/realGameProjection"
import { prepareJointTransferSynchronization } from "./jointTransferSyncPreparation"
import { prepareJointTransferCommit, type JointCommitItem } from "./jointTransferPersistence"

export function confirmedRealChange(before: JointTransferPayload | undefined, next: JointTransferPayload, event: JointMovement) {
  if (!event.evidenceConfirmed || event.context !== "REAL" || event.eaId !== next.eaPlayerId) return { kind: "REVIEW", reason: "UNCONFIRMED_REAL_EVENT" } as const
  if (next.jointTransfer.real?.loan) return event.kind === "LOAN_START" ? { kind: "LOAN_START", reason: null } as const : { kind: "REVIEW", reason: "LOAN_MOVEMENT_CONFLICT" } as const
  if (before?.jointTransfer.real?.loan && !["LOAN_RETURN_CONFIRMED", "LOAN_RECALL_CONFIRMED", "LOAN_TO_PERMANENT"].includes(event.kind))
    return { kind: "REVIEW", reason: "LOAN_CLOSING_EVIDENCE_REQUIRED" } as const
  return { kind: event.kind, reason: null }
}

/** One evaluation creates a REAL + projected-GAME unit; original EA fields never change. */
export function prepareJointRealGameSync(input: {
  before: readonly JointTransferPayload[]; expectedBeforeHash: string; asOf: string; unverifiedRealEaIds: readonly string[];
  updates: readonly { candidate: JointTransferPayload; movement: JointMovement; eligibility: RealGameEligibility }[]
}) {
  if (jointHash(input.before) !== input.expectedBeforeHash) throw new Error("JOINT_REAL_GAME_BASELINE_CHANGED")
  const before = new Map(input.before.map(p => [p.eaPlayerId, p]))
  if (before.size !== input.before.length || new Set(input.updates.map(r => r.candidate.eaPlayerId)).size !== input.updates.length) throw new Error("JOINT_REAL_GAME_DUPLICATE_ID")
  const ready: JointTransferPayload[] = [], review: { eaId: string; reasons: string[]; candidate: JointTransferPayload }[] = []
  for (const row of input.updates) {
    try {
    const candidate = structuredClone(row.candidate)
    delete candidate.jointTransfer.futscoutProjection
    validateJointTransferPayload(candidate)
    const old = before.get(candidate.eaPlayerId)
    if (old && jointHash(old.game) !== jointHash(candidate.game)) throw new Error("ORIGINAL_EA_SNAPSHOT_MUTATION_FORBIDDEN")
    const detected = confirmedRealChange(old, candidate, row.movement)
    let assessment = assessRealGameProjection(candidate, row.eligibility, row.movement, input.asOf)
    const prior = old?.jointTransfer.futscoutProjection
    if (prior && projectionHash({ ...assessment, asOf: prior.asOf }) === projectionHash(prior)) assessment = prior
    candidate.jointTransfer.futscoutProjection = assessment
    const reasons = [...assessment.reasons, ...(detected.reason ? [detected.reason] : []), ...(input.unverifiedRealEaIds.includes(candidate.eaPlayerId) ? ["UNVERIFIED_REAL_SIGNAL_EXCLUDED"] : [])]
    if (reasons.length) { review.push({ eaId: candidate.eaPlayerId, reasons: [...new Set(reasons)], candidate }); continue }
    validateJointTransferPayload(candidate); ready.push(candidate)
    } catch (error) {
      review.push({ eaId: row.candidate.eaPlayerId, reasons: [error instanceof Error ? error.message : "INVALID_JOINT_REAL_GAME_CANDIDATE"], candidate: row.candidate })
    }
  }
  // Keep incompatible/ambiguous players outside the writer, without blocking safe players.
  const scopes = new Set(ready.map(p => p.eaPlayerId)), baseline = input.before.filter(p => scopes.has(p.eaPlayerId))
  const incremental = prepareJointTransferSynchronization({ before: baseline, candidates: ready, expectedBeforeHash: jointHash(baseline), asOf: input.asOf, unverifiedRealEaIds: input.unverifiedRealEaIds })
  const rejected = new Set(incremental.review.map(r => r.eaId))
  const updates = incremental.updates.filter(u => !rejected.has(u.eaId)).map(u => ({ ...u, contexts: ["REAL", "GAME"] as const,
    gamePresentation: "FUTSCOUT_PROJECTED" as const, atomicUnit: "PLAYER_REAL_AND_PROJECTED_GAME" as const, originalEaSnapshotChanged: false }))
  const content = { updates, review: [...review, ...incremental.review], beforeHash: input.expectedBeforeHash, sourceLoanPlanHash: incremental.loans.batchHash }
  const batchHash = jointHash(content)
  return { ...content, batchHash, checkpoint: { batchHash, nextPlayerIndex: 0 }, idempotencyKey: `joint-real-game:${batchHash}`,
    jointReady: updates.length, reviewCount: content.review.length, executionAuthorized: false, automaticRealOnlyActivation: false, canonicalEaReferenceSelected: false }
}

/** Optional operator preparation. The existing transaction writes each full revision atomically. */
export function prepareJointRealGameCommit(items: readonly JointCommitItem[], decisionReference: string) {
  for (const item of items) {
    validateJointTransferPayload(item.payload)
    if (item.payload.jointTransfer.futscoutProjection?.status !== "READY") throw new Error("READY_REAL_GAME_PAIR_REQUIRED")
  }
  return prepareJointTransferCommit(items, decisionReference)
}
