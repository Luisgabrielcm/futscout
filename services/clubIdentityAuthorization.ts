import { clubIdentityHash, type ClubIdentityReport } from "./clubPlayerIdentityPipeline"
import { isDeepStrictEqual } from "node:util"

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

export function clubIdentityWriteToken(report: ClubIdentityReport) {
  return "AUTHORIZE_CLUB_IDENTITY_V1:" + createClubIdentityAuthorizationSummary(report).summaryHash
}

export function requireClubIdentityAuthorization(report: ClubIdentityReport, summary: unknown, confirmation: string, now: Date) {
  const expected = createClubIdentityAuthorizationSummary(report).summary
  if (report.mode !== "DRY_RUN" || !isDeepStrictEqual(summary, expected) || confirmation !== clubIdentityWriteToken(report)) {
    throw new Error("AUTHORIZATION_MISMATCH")
  }
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(Date.parse(expected.generatedAt)) ||
      !Number.isFinite(Date.parse(expected.validUntil)) || Date.parse(expected.generatedAt) > now.getTime() ||
      Date.parse(expected.validUntil) <= now.getTime()) throw new Error("AUTHORIZATION_EXPIRED")
  const max = expected.policy.maxAutoWrites, candidates = expected.orderedAutoMatchCandidates
  if (!Number.isInteger(max) || max < 1 || max > 10 || candidates.length > max) throw new Error("AUTO_WRITE_BUDGET_EXCEEDED")
  if (new Set(candidates.map(c => c.playerId)).size !== candidates.length || new Set(candidates.map(c => c.providerId)).size !== candidates.length) {
    throw new Error("DUPLICATE_AUTHORIZED_CANDIDATE")
  }
  if ([...report.rows, ...report.localAssociations].some(r => r.decision === "CONFLICT")) throw new Error("CONFLICT")
  return expected
}

// A future adapter must re-read/recompute this entire report before each transaction.
// This function only describes actions; there is no callable persistence dependency.
export function planClubIdentityAutoWrite(report: ClubIdentityReport) {
  const blockers = [...report.rows, ...report.localAssociations].filter(r => r.decision === "CONFLICT").map(r => r.reason)
  if (report.rows.filter(r => r.decision === "AUTO_MATCH").length > report.config.writePolicy.maxAutoWrites) {
    throw new Error("AUTO_WRITE_BUDGET_EXCEEDED")
  }
  const actions = report.rows.map(r => {
    const action = r.decision === "ALREADY_MATCHED" ? "NO_OP" : r.decision === "CONFLICT" ? "STOP" :
      r.decision !== "AUTO_MATCH" ? "SKIP" : "ATOMIC_CANDIDATE"
    return { providerId: r.providerPlayerId, playerId: r.localCandidate?.playerId ?? null, action }
  })
  return { blockers, actions,
    selectedAutoMatches: actions.filter(a => a.action === "ATOMIC_CANDIDATE").length,
    ...createClubIdentityAuthorizationSummary(report) }
}
