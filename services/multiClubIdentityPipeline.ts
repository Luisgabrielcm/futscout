import { clubIdentityHash, requireClubIdentityConfig, runClubPlayerIdentityPipeline,
  type ClubIdentityConfig, type ClubIdentityEvidence, type ClubIdentityReport } from "./clubPlayerIdentityPipeline"
import { rankClubIdentityAutoMatches } from "./clubIdentityBatchSelection"

export type MultiClubIdentityOptions = {
  clubs: ClubIdentityConfig[]; mode: "DRY_RUN"
  maxClubs?: number; maxAutoWritesPerClub?: number; maxAutoWritesGlobal?: number
}
export type MultiClubLimits = { maxClubs: number; maxAutoWritesPerClub: number; maxAutoWritesGlobal: number }
export function requireMultiClubOptions(options: MultiClubIdentityOptions): MultiClubLimits {
  if (options.mode !== "DRY_RUN") throw new Error("MULTI_CLUB_WRITE_DISABLED")
  const limits = { maxClubs: options.maxClubs ?? 5, maxAutoWritesPerClub: options.maxAutoWritesPerClub ?? 5,
    maxAutoWritesGlobal: options.maxAutoWritesGlobal ?? 20 }
  for (const [key, ceiling] of [["maxClubs", 5], ["maxAutoWritesPerClub", 5], ["maxAutoWritesGlobal", 20]] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceiling) throw new Error("INVALID_MULTI_CLUB_LIMIT")
  }
  if (!Array.isArray(options.clubs) || !options.clubs.length || options.clubs.length > limits.maxClubs) throw new Error("CLUB_LIMIT_EXCEEDED")
  for (const key of ["clubId", "clubSlug", "apiFootballTeamId"] as const) {
    if (new Set(options.clubs.map(c => c[key])).size !== options.clubs.length) throw new Error("DUPLICATE_CLUB")
  }
  for (const c of options.clubs) {
    requireClubIdentityConfig(c)
    if (c.season !== 2026 || c.writePolicy.maxAutoWrites !== limits.maxAutoWritesPerClub ||
        c.orderedBatchCandidates !== undefined || c.ineligibleBatchPolicy !== undefined) throw new Error("MULTI_CLUB_CONFIG_MISMATCH")
  }
  return limits
}

export type MultiClubLoad = { status: "NEEDS_FRESH_ROSTER"; reason: string } |
  { status: "READY"; evidence: ClubIdentityEvidence }
export type MultiClubCandidate = { playerId: string; slug: string; providerId: number; confidence: number;
  margin: number | null; expectedUpdatedAt: string }
type ClubPlan = {
  clubId: string; clubSlug: string; teamId: number; season: number
  status: "READY" | "NEEDS_FRESH_ROSTER" | "STOPPED"; reason: string | null
  cacheRowHash: string | null; snapshotHash: string | null; dryRunHash: string
  report: ClubIdentityReport | null
  summary: { scope: "MULTI_CLUB_DRY_RUN_ONLY"; writeEnabled: false; clubId: string; clubSlug: string;
    teamId: number; season: number; cacheRowHash: string | null; snapshotHash: string | null;
    counts: ClubIdentityReport["counts"] | null; reviewStaleClub: number | null; candidateCount: number;
    orderedAutoMatchCandidates: MultiClubCandidate[] }
  deferred: MultiClubCandidate[]
}
const candidate = (r: ClubIdentityReport["rows"][number]): MultiClubCandidate => ({
  playerId: r.localCandidate!.playerId, slug: r.localCandidate!.slug, providerId: r.providerPlayerId,
  confidence: r.confidence!, margin: r.margin, expectedUpdatedAt: r.localCandidate!.expectedUpdatedAt,
})

// Pure matching + injected read boundary only. No writer, recorder, HTTP or authorization token.
export async function runMultiClubIdentityPipeline(options: MultiClubIdentityOptions, deps: {
  load: (config: ClubIdentityConfig, now: Date) => Promise<MultiClubLoad>
  audit: (config: ClubIdentityConfig) => Promise<boolean>
}, now = new Date()) {
  const limits = requireMultiClubOptions(options)
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_CLOCK")
  const clubs: ClubPlan[] = [], claimedPlayers = new Set<string>(), claimedProviders = new Set<number>()
  let stopReason: string | null = null
  for (const config of options.clubs) {
    let report: ClubIdentityReport | null = null, status: ClubPlan["status"] = "READY", reason: string | null = null
    try {
      const loaded = await deps.load(config, now)
      if (loaded.status === "NEEDS_FRESH_ROSTER") { status = loaded.status; reason = loaded.reason }
      else {
        report = runClubPlayerIdentityPipeline(config, loaded.evidence, now)
        if ([...report.rows, ...report.localAssociations].some(r => r.decision === "CONFLICT")) {
          status = "STOPPED"; reason = "STRUCTURAL_CONFLICT"
        }
        // Global uniqueness includes deferred AUTO_MATCH rows, not only the first five.
        for (const row of rankClubIdentityAutoMatches(report)) {
          const id = row.localCandidate!.playerId
          if (claimedPlayers.has(id) || claimedProviders.has(row.providerPlayerId)) { status = "STOPPED"; reason = "CROSS_CLUB_CLAIM" }
          claimedPlayers.add(id); claimedProviders.add(row.providerPlayerId)
        }
      }
      if (!(await deps.audit(config))) { status = "STOPPED"; reason = "AUDIT_MISMATCH" }
    } catch (error) {
      status = "STOPPED"
      // Never surface arbitrary DB errors/URLs. Only known evidence errors receive a specific label.
      reason = error instanceof Error && ["CACHE_HASH_CHANGED", "INVALID_SNAPSHOT", "CLUB_IDENTITY_MISMATCH"].includes(error.message)
        ? error.message : "EVIDENCE_READ_OR_VALIDATION_FAILED"
    }
    const ranked = report ? rankClubIdentityAutoMatches(report) : []
    const selected = status === "READY" ? ranked.slice(0, limits.maxAutoWritesPerClub).map(candidate) : []
    const summary: ClubPlan["summary"] = { scope: "MULTI_CLUB_DRY_RUN_ONLY", writeEnabled: false,
      clubId: config.clubId, clubSlug: config.clubSlug, teamId: config.apiFootballTeamId, season: config.season,
      cacheRowHash: report?.cache.rowHash ?? config.cache.expectedRowHash ?? null,
      snapshotHash: report?.snapshotHash ?? config.snapshot.expectedHash ?? null,
      counts: report?.counts ?? null, reviewStaleClub: report?.rows.filter(r => r.reason === "REVIEW_STALE_CLUB").length ?? null,
      candidateCount: selected.length, orderedAutoMatchCandidates: selected }
    const deferred = ranked.map(candidate).filter(c => !selected.some(s => s.playerId === c.playerId))
    // generatedAt is deliberately excluded; inputHash includes all local evidence and updatedAt values.
    const dryRunHash = clubIdentityHash({ config, status, reason, summary, deferred, inputHash: report?.inputHash ?? null,
      rows: report?.rows ?? null, localAssociations: report?.localAssociations ?? null })
    clubs.push({ clubId: config.clubId, clubSlug: config.clubSlug, teamId: config.apiFootballTeamId, season: config.season,
      status, reason, cacheRowHash: summary.cacheRowHash, snapshotHash: summary.snapshotHash, dryRunHash, report, summary, deferred })
    if (status === "STOPPED") { stopReason = reason; break }
  }
  const selectedCount = clubs.reduce((sum, c) => sum + c.summary.candidateCount, 0)
  // No silent truncation or reallocation across clubs. An over-budget plan is not simulatable.
  if (!stopReason && selectedCount > limits.maxAutoWritesGlobal) stopReason = "GLOBAL_AUTO_WRITE_LIMIT_EXCEEDED"
  const envelope = { batchVersion: 1, scope: "MULTI_CLUB_DRY_RUN_ONLY", writeEnabled: false, mode: "DRY_RUN",
    orderedClubList: options.clubs.map(c => ({ clubId: c.clubId, clubSlug: c.clubSlug, teamId: c.apiFootballTeamId, season: c.season })),
    ...limits, clubs: clubs.map(c => ({ ...c.summary, status: c.status, reason: c.reason, dryRunHash: c.dryRunHash })), stopReason }
  return { envelope, batchHash: clubIdentityHash(envelope), clubs, selectedCount, stopped: stopReason !== null, stopReason,
    notExecutedClubs: options.clubs.slice(clubs.length).map(c => c.clubSlug),
    reviewQueue: clubs.flatMap(c => (c.report?.reviewQueue ?? []).map(r => ({ club: c.clubSlug, provider: r.providerPlayerId,
      candidate: r.localCandidate, decision: r.decision, reason: r.reason }))),
    apiCalls: 0 as const, writes: 0 as const }
}
export type MultiClubIdentityReport = Awaited<ReturnType<typeof runMultiClubIdentityPipeline>>

export function requireSameMultiClubDryRun(expected: MultiClubIdentityReport, actual: MultiClubIdentityReport) {
  if (clubIdentityHash(expected.envelope) !== expected.batchHash || clubIdentityHash(actual.envelope) !== actual.batchHash ||
      expected.batchHash !== actual.batchHash) throw new Error("BATCH_DRY_RUN_CHANGED")
}

// A finite, in-memory model of FUTURE commits. Cannot accept a callback, DB or writer.
// Replaying the model returns the same events; it never performs real commits or retries.
export function simulateMultiClubIdentityPlan(report: MultiClubIdentityReport, failure?: {
  clubId: string; playerId: string; outcome: "FAILURE" | "AUDIT_MISMATCH" | "INDETERMINATE_COMMIT"
}) {
  if (report.stopped || report.envelope.writeEnabled !== false || clubIdentityHash(report.envelope) !== report.batchHash) {
    throw new Error("BATCH_NOT_SIMULATABLE")
  }
  const plans = report.envelope.clubs
  if (plans.length > report.envelope.maxClubs || plans.some(c => c.candidateCount !== c.orderedAutoMatchCandidates.length ||
      c.candidateCount > report.envelope.maxAutoWritesPerClub) ||
      plans.reduce((sum, c) => sum + c.candidateCount, 0) > report.envelope.maxAutoWritesGlobal) throw new Error("SIMULATION_LIMIT_EXCEEDED")
  if (failure && (!plans.some(c => c.clubId === failure.clubId && c.orderedAutoMatchCandidates.some(p => p.playerId === failure.playerId)) ||
      !["FAILURE", "AUDIT_MISMATCH", "INDETERMINATE_COMMIT"].includes(failure.outcome))) throw new Error("INVALID_SIMULATION_FAILURE")
  const events: { clubId: string; playerId: string | null; event: string }[] = []
  const committed: string[] = [], indeterminate: string[] = []
  for (const c of plans) {
    if (c.status !== "READY") { events.push({ clubId: c.clubId, playerId: null, event: "SKIP" }); continue }
    for (const p of c.orderedAutoMatchCandidates) {
      if (failure?.clubId === c.clubId && failure.playerId === p.playerId) {
        if (failure.outcome === "AUDIT_MISMATCH") committed.push(p.playerId)
        if (failure.outcome === "INDETERMINATE_COMMIT") indeterminate.push(p.playerId)
        events.push({ clubId: c.clubId, playerId: p.playerId, event: failure.outcome })
        return { simulation: true, committed, indeterminate, events, stopped: true, retries: 0, realWrites: 0 }
      }
      committed.push(p.playerId); events.push({ clubId: c.clubId, playerId: p.playerId, event: "SIMULATED_COMMIT_AND_AUDIT" })
    }
    events.push({ clubId: c.clubId, playerId: null, event: "CLUB_AUDIT" })
  }
  return { simulation: true, committed, indeterminate, events, stopped: false, retries: 0, realWrites: 0 }
}
