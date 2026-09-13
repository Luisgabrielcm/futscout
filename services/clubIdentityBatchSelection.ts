import type { ClubIdentityReport } from "./clubPlayerIdentityPipeline"

// Ranking describes the review order; it never silently chooses/replaces five candidates.
export function rankClubIdentityAutoMatches(report: ClubIdentityReport) {
  return report.rows.filter(r => r.decision === "AUTO_MATCH").sort((a, b) =>
    b.confidence! - a.confidence! || Number(b.lineupEvidence.present) - Number(a.lineupEvidence.present) ||
    (b.margin ?? -1) - (a.margin ?? -1) || a.providerPlayerId - b.providerPlayerId)
}

export function selectedClubIdentityAutoMatches(report: ClubIdentityReport) {
  const list = report.config.orderedBatchCandidates
  if (list === undefined) return report.rows.filter(r => r.decision === "AUTO_MATCH")
  if (!Array.isArray(list) || !list.length || list.length > report.config.writePolicy.maxAutoWrites ||
      list.length > 5 || new Set(list.map(c => c.playerId)).size !== list.length ||
      new Set(list.map(c => c.providerId)).size !== list.length || new Set(list.map(c => c.slug)).size !== list.length) {
    throw new Error("INVALID_BATCH_SELECTION")
  }
  return list.flatMap(c => {
    if (!c.playerId || !c.slug || !Number.isSafeInteger(c.providerId) || c.providerId <= 0) throw new Error("INVALID_BATCH_SELECTION")
    const rows = report.rows.filter(r => r.providerPlayerId === c.providerId)
    const r = rows[0]
    // Only a NEW authorization can omit an ineligible original member. The write adapter
    // compares the recomputed ordered list to its authorized list before every transaction.
    if (rows.length === 1 && report.config.ineligibleBatchPolicy === "DEFER" &&
        (r.decision === "REVIEW" || r.decision === "UNRESOLVED")) return []
    if (rows.length !== 1 || r.localCandidate?.playerId !== c.playerId || r.localCandidate?.slug !== c.slug ||
        !["AUTO_MATCH", "ALREADY_MATCHED"].includes(r.decision)) throw new Error("BATCH_CANDIDATE_NOT_ELIGIBLE")
    // A new envelope after verified commits can be a no-op; never fill the vacancy.
    return r.decision === "AUTO_MATCH" ? [r] : []
  })
}
