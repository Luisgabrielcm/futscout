import { jointHash, type JointTransferPayload } from "../lib/jointTransferContexts"
import { prepareJointRealGameSync } from "./jointRealGameSync"

type JointUpdate = Parameters<typeof prepareJointRealGameSync>[0]["updates"][number]
export type GlobalTransferCandidate = {
  update: JointUpdate
  proof: {
    eaId: string; destinationClubId: string; identityVerified: boolean
    sourceFileVerified: boolean; sourceHash: string; sourceUrl: string
    authority: "OFFICIAL" | "CORROBORATED" | "LEAD_ONLY"
    observedAt: string; evidenceDate: string | null
    membershipOnly: boolean; conflicts: readonly string[]
  }
}
export type GlobalTransferCheckpoint = {
  version: 1; inputHash: string; completedBatches: { batchId: string; receiptHash: string }[]
}
const sha = /^[a-f0-9]{64}$/

/** Preparation only. No provider, database, scheduler, environment flag or writer is called here. */
export function prepareGlobalTransferAutomation(input: {
  before: readonly JointTransferPayload[]; expectedBeforeHash: string; asOf: string
  candidates: readonly GlobalTransferCandidate[]; publishedEaIds: readonly string[]
  historicalLoanCount: number; historicalDivergenceCount: number
  chunkSize?: number; maxObservationAgeDays?: number; checkpoint?: GlobalTransferCheckpoint
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf)) || new Date(input.asOf).toISOString().slice(0, 10) !== input.asOf) throw new Error("GLOBAL_AS_OF_INVALID")
  const chunkSize = input.chunkSize ?? 100, maxAge = input.maxObservationAgeDays ?? 7
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 200 || !Number.isFinite(maxAge) || maxAge < 0 || maxAge > 30) throw new Error("GLOBAL_LIMIT_INVALID")
  if (jointHash(input.before) !== input.expectedBeforeHash) throw new Error("GLOBAL_BASELINE_CHANGED")
  const published = new Set(input.publishedEaIds), grouped = new Map<string, GlobalTransferCandidate[]>()
  for (const c of input.candidates) {
    const id = c.update.candidate.eaPlayerId
    grouped.set(id, [...grouped.get(id) ?? [], c])
  }
  const pending: { eaId: string; reasons: string[] }[] = [], conflicts: typeof pending = [], excluded: string[] = [], accepted: JointUpdate[] = []
  const dayEnd = Date.parse(input.asOf) + 86_400_000 - 1
  for (const [eaId, rows] of [...grouped].sort(([a], [b]) => Number(a) - Number(b))) {
    if (published.has(eaId)) { excluded.push(eaId); continue }
    const distinct = [...new Map(rows.map(c => [jointHash(c), c])).values()]
    if (distinct.length !== 1) { conflicts.push({ eaId, reasons: ["DIVERGENT_CANDIDATE_EVIDENCE"] }); continue }
    const c = distinct[0], p = c.proof, u = c.update, reasons: string[] = []
    if (p.conflicts.length) { conflicts.push({ eaId, reasons: [...p.conflicts] }); continue }
    if (p.eaId !== eaId || u.movement.eaId !== eaId || !p.identityVerified) reasons.push("IDENTITY_PROOF_REQUIRED")
    if (!p.sourceFileVerified || !sha.test(p.sourceHash) || p.sourceHash !== u.candidate.real?.evidenceHash || p.sourceUrl !== u.candidate.real?.sourceUrl || p.authority === "LEAD_ONLY") reasons.push("BOUND_SOURCE_PROOF_REQUIRED")
    if (p.destinationClubId !== u.candidate.jointTransfer.real?.club?.id) reasons.push("REAL_DESTINATION_PROOF_REQUIRED")
    const observed = Date.parse(p.observedAt), evidence = p.evidenceDate === null ? null : Date.parse(p.evidenceDate)
    if (!Number.isFinite(observed) || observed > dayEnd || dayEnd - observed > maxAge * 86_400_000 || evidence !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(p.evidenceDate!) || !Number.isFinite(evidence) || new Date(evidence).toISOString().slice(0, 10) !== p.evidenceDate || evidence > dayEnd)) reasons.push("SOURCE_CHRONOLOGY_REQUIRES_REFRESH")
    // A current roster proves membership, not permanence, an active loan or its closure.
    if (p.membershipOnly && (u.movement.kind !== "CURRENT_CLUB_CONFIRMED" || u.candidate.jointTransfer.real?.loan !== null)) reasons.push("MEMBERSHIP_IS_NOT_TRANSFER_TYPE_PROOF")
    if (!p.membershipOnly && u.movement.kind === "CURRENT_CLUB_CONFIRMED") reasons.push("MOVEMENT_PROOF_KIND_MISMATCH")
    if (reasons.length) pending.push({ eaId, reasons }); else accepted.push(u)
  }
  const prepared = prepareJointRealGameSync({ before: input.before, expectedBeforeHash: input.expectedBeforeHash,
    asOf: input.asOf, updates: accepted, unverifiedRealEaIds: pending.map(p => p.eaId) })
  pending.push(...prepared.review.map(r => ({ eaId: r.eaId, reasons: r.reasons })))
  const batches: {
    updates: typeof prepared.updates; expectedBeforeHash: string; contexts: readonly ["REAL", "GAME"];
    batchId: string; playerCount: number;
    rollback: { requiresCommittedReceipt: boolean; compareAndSwap: boolean; preservesEvidence: boolean };
    activationCohorts: string[][]
  }[] = []
  for (let offset = 0; offset < prepared.updates.length; offset += chunkSize) {
    const updates = prepared.updates.slice(offset, offset + chunkSize)
    const content = { updates, expectedBeforeHash: input.expectedBeforeHash, contexts: ["REAL", "GAME"] as const }
    batches.push({ ...content, batchId: jointHash(content), playerCount: updates.length,
      rollback: { requiresCommittedReceipt: true, compareAndSwap: true, preservesEvidence: true },
      activationCohorts: Array.from({ length: Math.ceil(updates.length / 10) }, (_, i) => updates.slice(i * 10, i * 10 + 10).map(u => u.eaId)) })
  }
  const inputHash = jointHash({ asOf: input.asOf, candidates: input.candidates, before: input.expectedBeforeHash, published: [...published].sort(), chunkSize, maxAge })
  const checkpoint = input.checkpoint ?? { version: 1 as const, inputHash, completedBatches: [] }
  if (checkpoint.version !== 1 || checkpoint.inputHash !== inputHash || new Set(checkpoint.completedBatches.map(b => b.batchId)).size !== checkpoint.completedBatches.length || checkpoint.completedBatches.some(b => !sha.test(b.receiptHash) || !batches.some(p => p.batchId === b.batchId))) throw new Error("GLOBAL_CHECKPOINT_MISMATCH")
  const completed = new Set(checkpoint.completedBatches.map(b => b.batchId))
  return { version: 1, inputHash, checkpoint, batches, remainingBatches: batches.filter(b => !completed.has(b.batchId)),
    eligible: prepared.updates.length, pending, conflicts, excludedPublished: excluded,
    referenceOnly: { loans: input.historicalLoanCount, divergences: input.historicalDivergenceCount },
    executionAuthorized: false, productionWrites: 0, paidCalls: 0, canonicalEaReferenceSelected: false,
    autoActivationAllowed: false, requiresTargetBaselinePreflight: true }
}

/** Cache keys include source version; failed fetches must not become completed observations. */
export function groupTransferResearch(input: readonly { eaId: string; clubId: string; sourceUrl: string; sourceVersion: string }[]) {
  const groups = new Map<string, { key: string; clubId: string; sourceUrl: string; sourceVersion: string; eaIds: string[] }>()
  for (const row of input) {
    const url = new URL(row.sourceUrl)
    if (url.protocol !== "https:" || !/^\d+$/.test(row.eaId) || !row.sourceVersion || !row.clubId) throw new Error("RESEARCH_SOURCE_INVALID")
    const key = jointHash({ clubId: row.clubId, sourceUrl: row.sourceUrl, sourceVersion: row.sourceVersion })
    const group = groups.get(key) ?? { key, clubId: row.clubId, sourceUrl: row.sourceUrl, sourceVersion: row.sourceVersion, eaIds: [] }
    if (!group.eaIds.includes(row.eaId)) group.eaIds.push(row.eaId)
    groups.set(key, group)
  }
  return [...groups.values()].map(g => ({ ...g, eaIds: g.eaIds.sort((a, b) => Number(a) - Number(b)),
    cacheKey: g.key, onRateLimit: "STOP_AND_CHECKPOINT" as const, paidProviderAllowed: false }))
}
