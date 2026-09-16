import { transferEvidenceHash } from "../lib/transferHistory"
import type { ClubIdentityReport } from "./clubPlayerIdentityPipeline"

export type TransferQueueSignal = {
  playerId: string; providerPlayerId: number | null; ownershipUnique: boolean
  reason: "REVIEW_STALE_CLUB" | "ABSENT_WITH_EXTERNAL_EVIDENCE" | "RECENT_TRANSFER_WINDOW_CHANGE" | "MANUAL_PRIORITY" | "BACKGROUND_INCREMENTAL"
  evidenceHash: string; observedAt: string; nextEligibleAt?: string | null
}
const priorities: TransferQueueSignal["reason"][] = ["REVIEW_STALE_CLUB", "ABSENT_WITH_EXTERNAL_EVIDENCE", "RECENT_TRANSFER_WINDOW_CHANGE", "MANUAL_PRIORITY", "BACKGROUND_INCREMENTAL"]
type IdentityReportSignal = Pick<ClubIdentityReport, "inputHash" | "generatedAt"> & {
  rows: Pick<ClubIdentityReport["rows"][number], "reason" | "decision" | "providerPlayerId" | "localCandidate" | "rosterEvidence" | "lineupEvidence">[]
}
export function transferSignalsFromIdentityReports(reports: readonly IdentityReportSignal[]): TransferQueueSignal[] {
  return reports.flatMap(report => report.rows.filter(r => r.reason === "REVIEW_STALE_CLUB" && r.localCandidate).map(r => ({
    playerId: r.localCandidate!.playerId,
    providerPlayerId: r.localCandidate!.apiFootballId === r.providerPlayerId ? r.providerPlayerId : null,
    ownershipUnique: r.decision === "REVIEW" && r.localCandidate!.apiFootballId === r.providerPlayerId,
    reason: "REVIEW_STALE_CLUB" as const, observedAt: report.generatedAt,
    evidenceHash: transferEvidenceHash([report.inputHash, r.providerPlayerId, r.rosterEvidence, r.lineupEvidence]),
  })))
}
export function selectTransferObservationQueue(signals: readonly TransferQueueSignal[], now: Date, limit: number,
  processedKeys: ReadonlySet<string> = new Set()) {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_TRANSFER_QUEUE_BUDGET")
  const identityReview: TransferQueueSignal[] = [], deferred: TransferQueueSignal[] = []
  const eligible = signals.filter(s => {
    if (!s.playerId || !s.evidenceHash || !priorities.includes(s.reason) || !Number.isFinite(Date.parse(s.observedAt)) || Date.parse(s.observedAt) > now.getTime()) throw new Error("INVALID_TRANSFER_QUEUE_SIGNAL")
    if (!Number.isSafeInteger(s.providerPlayerId) || s.providerPlayerId! < 1 || !s.ownershipUnique) { identityReview.push(s); return false }
    if (s.nextEligibleAt && (!Number.isFinite(Date.parse(s.nextEligibleAt)) || Date.parse(s.nextEligibleAt) > now.getTime())) { deferred.push(s); return false }
    return true
  }).sort((a, b) => priorities.indexOf(a.reason) - priorities.indexOf(b.reason) || a.observedAt.localeCompare(b.observedAt) || a.playerId.localeCompare(b.playerId))
  const ownership = new Map<number, Set<string>>()
  for (const s of signals) if (s.providerPlayerId !== null) ownership.set(s.providerPlayerId, new Set([...(ownership.get(s.providerPlayerId) ?? []), s.playerId]))
  const selected: (TransferQueueSignal & { key: string })[] = [], seen = new Set<number>()
  for (const s of eligible) {
    if (ownership.get(s.providerPlayerId!)!.size !== 1) { identityReview.push(s); continue }
    const key = transferEvidenceHash(["transfer-queue-v1", s.playerId, s.providerPlayerId, s.evidenceHash])
    if (processedKeys.has(key) || seen.has(s.providerPlayerId!)) continue
    seen.add(s.providerPlayerId!)
    if (selected.length === limit) { deferred.push(s); continue }
    selected.push({ ...s, key })
  }
  return { selected, identityReview, deferred, apiCalls: 0 as const, writes: 0 as const }
}
