import { jointHash, type JointTransferPayload } from "../lib/jointTransferContexts"
import { prepareRealOnlyPayload } from "../lib/realOnlyTransfers"
import { prepareJointTransferSynchronization } from "./jointTransferSyncPreparation"
import { realOnlyTransferDecision } from "../lib/transferReadScope"

export type RealOnlyTransferCandidate = {
  base: JointTransferPayload; expectedBaseHash: string; patch: Parameters<typeof prepareRealOnlyPayload>[1];
  proof: { identityConfirmed: boolean; movementTypeConfirmed: boolean; currentPlayingConfirmed: boolean;
    chronologyConfirmed: boolean; sourceFileVerified: boolean; sourceHash: string; currentSourceHash: string;
    currentObservedAt: string; authority: "OFFICIAL" | "CORROBORATED" | "LEAD_ONLY"; conflicts: readonly string[] };
  gamePendingReasons: readonly string[]
}
/** Offline preparation only. REAL eligibility is independent of GAME; no DB/provider/scheduler is invoked. */
export function prepareRealOnlyTransferBatch(input: { candidates: readonly RealOnlyTransferCandidate[]; excludedEaIds: readonly string[];
  asOf: string; chunkSize?: number; checkpoint?: { inputHash: string; completedBatchIds: string[] } }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) || new Date(input.asOf).toISOString().slice(0, 10) !== input.asOf) throw new Error("REAL_ONLY_CLOCK_INVALID")
  const chunk = input.chunkSize ?? 200
  if (!Number.isInteger(chunk) || chunk < 1 || chunk > 200) throw new Error("REAL_ONLY_CHUNK_INVALID")
  const excluded = new Set(input.excludedEaIds), grouped = new Map<string, RealOnlyTransferCandidate[]>()
  for (const c of input.candidates) grouped.set(c.base.eaPlayerId, [...grouped.get(c.base.eaPlayerId) ?? [], c])
  const eligible: { eaId: string; payload: JointTransferPayload; expectedGameBaselineHash: string; category: "REAL_ONLY_TRANSFER" | "REAL_ONLY_LOAN"; gamePendingReasons: readonly string[] }[] = []
  const pending: { eaId: string; reasons: string[] }[] = [], duplicatesAvoided: string[] = []
  for (const [eaId, rows] of grouped) {
    if (excluded.has(eaId)) { duplicatesAvoided.push(eaId); continue }
    const unique = [...new Map(rows.map(r => [jointHash(r), r])).values()]
    if (unique.length !== 1) { pending.push({ eaId, reasons: ["REAL_ONLY_CONFLICTING_PROPOSALS"] }); continue }
    const c = unique[0], p = c.proof
    try {
      if (p.conflicts.length) throw new Error(p.conflicts.join(";"))
      if (jointHash(c.base) !== c.expectedBaseHash) throw new Error("REAL_ONLY_BASELINE_CHANGED")
      if (![p.identityConfirmed, p.movementTypeConfirmed, p.currentPlayingConfirmed, p.chronologyConfirmed, p.sourceFileVerified].every(Boolean) ||
        !["OFFICIAL", "CORROBORATED"].includes(p.authority) || !/^[a-f0-9]{64}$/.test(p.currentSourceHash)) throw new Error("REAL_ONLY_PROOF_INCOMPLETE")
      const observed = Date.parse(p.currentObservedAt), dayEnd = Date.parse(input.asOf) + 86400000 - 1
      if (!Number.isFinite(observed) || observed > dayEnd || dayEnd - observed > 7 * 86400000) throw new Error("REAL_ONLY_CURRENT_STATUS_REQUIRES_REFRESH")
      if (p.sourceHash !== c.patch.real.evidence.evidenceHash) throw new Error("REAL_ONLY_EVIDENCE_HASH_MISMATCH")
      const prepared = prepareRealOnlyPayload(c.base, c.patch, input.asOf)
      const transition = prepareJointTransferSynchronization({ before: [c.base], expectedBeforeHash: jointHash([c.base]),
        candidates: [prepared.payload], asOf: input.asOf, unverifiedRealEaIds: [] })
      if (transition.review.length) throw new Error(transition.review[0].reasons.join(";"))
      eligible.push({ eaId, ...prepared, gamePendingReasons: c.gamePendingReasons })
    } catch (e) { pending.push({ eaId, reasons: [e instanceof Error ? e.message : "REAL_ONLY_INVALID"] }) }
  }
  const batches = Array.from({ length: Math.ceil(eligible.length / chunk) }, (_, i) => {
    const updates = eligible.slice(i * chunk, (i + 1) * chunk), batchId = jointHash(updates)
    return { batchId, updates, decisionReference: realOnlyTransferDecision(batchId), contexts: ["REAL"] as const,
      rollback: { compareAndSwap: true, requiresCommittedReceipt: true, preservesEvidence: true }, expectedSelection: null }
  })
  const inputHash = jointHash({ candidates: input.candidates, excluded: [...excluded].sort(), asOf: input.asOf, chunk })
  const checkpoint = input.checkpoint ?? { inputHash, completedBatchIds: [] }
  if (checkpoint.inputHash !== inputHash || new Set(checkpoint.completedBatchIds).size !== checkpoint.completedBatchIds.length ||
    checkpoint.completedBatchIds.some(id => !batches.some(b => b.batchId === id))) throw new Error("REAL_ONLY_CHECKPOINT_MISMATCH")
  return { version: 1, inputHash, checkpoint, batches, remainingBatches: batches.filter(b => !checkpoint.completedBatchIds.includes(b.batchId)), eligible: eligible.length,
    transfers: eligible.filter(r => r.category === "REAL_ONLY_TRANSFER").length, loans: eligible.filter(r => r.category === "REAL_ONLY_LOAN").length,
    pending, duplicatesAvoided, executionAuthorized: false, productionWrites: 0, gameWrites: 0, canonicalEaReferenceChosen: false,
    paidCalls: 0, autoActivationAllowed: false, requiresFreshTargetBaseline: true }
}
