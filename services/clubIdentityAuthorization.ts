import { clubIdentityHash, type ClubIdentityReport } from "./clubPlayerIdentityPipeline"

export function createClubIdentityAuthorizationSummary(report: ClubIdentityReport) {
  // Explicit order and field allowlist. A hash is evidence, never permission to write.
  const orderedAutoMatchCandidates = report.rows.filter(r => r.decision === "AUTO_MATCH").map(r => ({
    playerId: r.localCandidate!.playerId, slug: r.localCandidate!.slug, providerId: r.providerPlayerId,
    confidence: r.confidence!, margin: r.margin, expectedUpdatedAt: r.localCandidate!.expectedUpdatedAt,
  }))
  const candidateListHash = clubIdentityHash(orderedAutoMatchCandidates)
  const summary = {
    authorizationSummaryVersion: 1 as const, scope: "CLUB_PLAYER_IDENTITY" as const,
    clubId: report.config.clubId, clubSlug: report.config.clubSlug, apiFootballTeamId: report.config.apiFootballTeamId,
    season: report.config.season, generatedAt: report.generatedAt,
    validUntil: new Date(Math.min(Date.parse(report.cache.expiresAt),
      Date.parse(report.generatedAt) + report.config.budget.maxDryRunAgeMs)).toISOString(),
    cacheRowHash: report.cache.rowHash, snapshotHash: report.snapshotHash, inputHash: report.inputHash,
    policy: { maxAutoWrites: report.config.writePolicy.maxAutoWrites,
      stopOnConflict: report.config.writePolicy.stopOnConflict, stopOnAuditMismatch: report.config.writePolicy.stopOnAuditMismatch,
      stopOnIndeterminateCommit: report.config.writePolicy.stopOnIndeterminateCommit, zeroRetry: report.config.writePolicy.zeroRetry },
    candidateListHash, orderedAutoMatchCandidates,
  }
  return { summary, summaryHash: clubIdentityHash(summary), writeEnabled: false as const }
}
export type ClubIdentityAuthorizationSummary = ReturnType<typeof createClubIdentityAuthorizationSummary>["summary"]

// A future adapter must re-read/recompute this entire report before each transaction.
// This function only describes actions; there is no callable persistence dependency.
export function planClubIdentityAutoWrite(report: ClubIdentityReport) {
  const blockers = [...report.rows, ...report.localAssociations].filter(r => r.decision === "CONFLICT").map(r => r.reason)
  let selected = 0
  const actions = report.rows.map(r => {
    const action = r.decision === "ALREADY_MATCHED" ? "NO_OP" : r.decision === "CONFLICT" ? "STOP" :
      r.decision !== "AUTO_MATCH" ? "SKIP" : selected++ < report.config.writePolicy.maxAutoWrites ? "ATOMIC_CANDIDATE" : "DEFER_BUDGET"
    return { providerId: r.providerPlayerId, playerId: r.localCandidate?.playerId ?? null, action }
  })
  return { blockers, actions,
    selectedAutoMatches: actions.filter(a => a.action === "ATOMIC_CANDIDATE").length,
    ...createClubIdentityAuthorizationSummary(report) }
}
