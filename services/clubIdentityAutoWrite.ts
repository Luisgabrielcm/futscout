import { isDeepStrictEqual } from "node:util"
import type { PrismaClient } from "../app/generated/prisma/client"
import { runClubPlayerIdentityPipeline, type ClubIdentityConfig, type ClubIdentityEvidence, type ClubIdentityReport } from "./clubPlayerIdentityPipeline"
import { createClubIdentityAuthorizationSummary, requireClubIdentityAuthorization } from "./clubIdentityAuthorization"
import { loadClubIdentityEvidence } from "./clubPlayerIdentityReadRepository"
import { persistPlayerIdentityWithPolicy, type AtomicIdentityMatch, type AtomicIdentityPolicy, type AtomicMatchResult } from "./playerIdentityAtomicPersistence"
import { assertIdentityWriteAudit, readIdentityWriteAudit, type IdentityWriteAudit } from "./playerIdentityWritePilot"

export type ClubIdentityWriteState = { evidence: ClubIdentityEvidence; audit: IdentityWriteAudit }
export type ClubIdentityGitState = { branch: string; clean: boolean; head: string }
export type ClubIdentityAutoWriteInput = {
  mode: "AUTO_WRITE"; config: ClubIdentityConfig; report: ClubIdentityReport; summary: unknown
  confirmation: string; expectedHead: string
}
export type ClubIdentityWriteDependencies = {
  clock: () => Date; git: () => ClubIdentityGitState
  loadState: () => Promise<ClubIdentityWriteState>
  persist: (match: AtomicIdentityMatch, expected: ClubIdentityEvidence, revalidate: (evidence: ClubIdentityEvidence, now: Date) => void,
    validUntil: Date) => Promise<AtomicMatchResult>
}
export function requireClubIdentityGit(git: ClubIdentityGitState, expectedHead: string) {
  if (git.branch !== "beta-next" || !git.clean || !/^[a-f0-9]{40}$/.test(expectedHead) || git.head !== expectedHead) throw new Error("GIT_GATE_FAILED")
}

function preparedMatch(evidence: ClubIdentityEvidence, row: ClubIdentityReport["rows"][number]): AtomicIdentityMatch {
  if (row.decision !== "AUTO_MATCH" || !row.localCandidate) throw new Error("MATCHER_NOT_AUTO_MATCH")
  const p = evidence.players.find(p => p.id === row.localCandidate!.playerId)
  if (!p || p.apiFootballId !== null || p.attempt || !evidence.cache || !evidence.cacheRowHash) throw new Error("PLAYER_BASELINE_CHANGED")
  const { id, slug, externalId, name, dateOfBirth, nationality, position, secondaryPositions, clubId, club, updatedAt } = p
  return structuredClone({ identity: { id, slug, externalId, name, dateOfBirth, nationality, position, secondaryPositions, clubId, club, updatedAt },
    providerId: row.providerPlayerId, decision: "AUTO_MATCH", confidence: row.confidence!, nameScore: row.nameScore!, margin: row.margin,
    birthMatches: row.birth.matches, nationalityMatches: row.nationality.matches, clubMatches: row.rosterEvidence.teamMatches,
    cacheExpiresAt: evidence.cache.expiresAt, cacheRowHash: evidence.cacheRowHash, snapshotHash: evidence.snapshot?.contentHash ?? null })
}

// The provided report is never trusted as a current decision; recompute the unchanged matcher.
export async function executeClubIdentityAutoWrite(input: ClubIdentityAutoWriteInput, deps: ClubIdentityWriteDependencies) {
  const request = structuredClone(input), now = deps.clock()
  if (request.mode !== "AUTO_WRITE" || !isDeepStrictEqual(request.config, request.report.config)) throw new Error("AUTHORIZATION_MISMATCH")
  const summary = requireClubIdentityAuthorization(request.report, request.summary, request.confirmation, now)
  requireClubIdentityGit(deps.git(), request.expectedHead)
  const completed: number[] = [], results: AtomicMatchResult[] = [], matches: AtomicIdentityMatch[] = []
  const skipped = request.report.rows.filter(r => r.decision !== "AUTO_MATCH").map(r => ({ providerId: r.providerPlayerId,
    decision: r.decision, action: r.decision === "ALREADY_MATCHED" ? "NO_OP" : "SKIP" }))
  const assertCurrent = (evidence: ClubIdentityEvidence, at: Date) => {
    requireClubIdentityAuthorization(request.report, request.summary, request.confirmation, at)
    const current = runClubPlayerIdentityPipeline(request.config, evidence, at)
    if ([...current.rows, ...current.localAssociations].some(r => r.decision === "CONFLICT")) throw new Error("CONFLICT")
    const next = createClubIdentityAuthorizationSummary(current).summary
    if (next.cacheRowHash !== summary.cacheRowHash || next.snapshotHash !== summary.snapshotHash ||
        !isDeepStrictEqual(next.orderedAutoMatchCandidates, summary.orderedAutoMatchCandidates.filter(c => !completed.includes(c.providerId))) ||
        (!completed.length && next.inputHash !== summary.inputHash)) throw new Error("AUTHORIZATION_MISMATCH")
    return current
  }
  let state = await deps.loadState()
  assertCurrent(state.evidence, deps.clock())
  const before = state.audit
  let after = state.audit, stopped = false, auditFailure = false, stopReason: string | null = null
  for (const candidate of summary.orderedAutoMatchCandidates) {
    let persistenceStarted = false
    try {
      requireClubIdentityGit(deps.git(), request.expectedHead)
      const fresh = await deps.loadState()
      if (!isDeepStrictEqual(state, fresh)) throw new Error("STATE_OR_AUDIT_CHANGED")
      const current = assertCurrent(fresh.evidence, deps.clock())
      const match = preparedMatch(fresh.evidence, current.rows.find(r => r.providerPlayerId === candidate.providerId)!)
      matches.push(match)
      persistenceStarted = true
      const result = await deps.persist(match, fresh.evidence, (evidence, at) => {
        requireClubIdentityGit(deps.git(), request.expectedHead)
        if (!isDeepStrictEqual(evidence, fresh.evidence)) throw new Error("STATE_CHANGED_IN_TRANSACTION")
        const inTransaction = assertCurrent(evidence, at)
        if (!isDeepStrictEqual(preparedMatch(evidence, inTransaction.rows.find(r => r.providerPlayerId === candidate.providerId)!), match)) {
          throw new Error("MATCHER_NOT_AUTO_MATCH")
        }
      }, new Date(summary.validUntil))
      if (result.playerId !== candidate.playerId || result.providerId !== candidate.providerId) throw new Error("INVALID_PERSISTENCE_RESULT")
      results.push(result)
      if (result.status === "MATCHED") completed.push(candidate.providerId)
      else { stopped = true; stopReason = result.status }
    } catch (error) {
      stopped = true
      stopReason = persistenceStarted ? "INDETERMINATE_COMMIT" : error instanceof Error &&
        ["GIT_GATE_FAILED", "AUTHORIZATION_EXPIRED", "AUTHORIZATION_MISMATCH", "CONFLICT", "STATE_OR_AUDIT_CHANGED"].includes(error.message)
        ? error.message : "VALIDATION_FAILURE"
      results.push({ playerId: candidate.playerId, providerId: candidate.providerId,
        status: persistenceStarted ? "INDETERMINATE_COMMIT" : "VALIDATION_FAILURE" })
    }
    try {
      const observed = await deps.loadState()
      after = observed.audit
      assertIdentityWriteAudit(before, after, matches, results)
      state = observed
    } catch { stopped = true; auditFailure = true; stopReason ??= "AUDIT_MISMATCH" }
    if (stopped) break
  }
  // An empty candidate list is a true no-op with a fresh summary, still audited.
  if (!summary.orderedAutoMatchCandidates.length) {
    const observed = await deps.loadState(); after = observed.audit
    if (!isDeepStrictEqual(state, observed)) { stopped = true; auditFailure = true; stopReason = "AUDIT_MISMATCH" }
  }
  return { results, skipped, stopped, stopReason, auditFailure, before, after, retries: 0,
    committedPlayerIds: results.filter(r => r.status === "MATCHED").map(r => r.playerId),
    indeterminatePlayerIds: results.filter(r => r.status === "INDETERMINATE_COMMIT").map(r => r.playerId),
    notExecutedPlayerIds: summary.orderedAutoMatchCandidates.filter(c => !results.some(r => r.playerId === c.playerId)).map(c => c.playerId) }
}

// Constructing these dependencies does not connect. DRY_RUN never imports this factory.
export function createPrismaClubIdentityWriteDependencies(db: PrismaClient, config: ClubIdentityConfig,
  git: () => ClubIdentityGitState, clock: () => Date = () => new Date()): ClubIdentityWriteDependencies {
  return { clock, git,
    loadState: () => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const setting = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only")
      if (setting[0]?.transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED")
      return { evidence: await loadClubIdentityEvidence(tx, config, clock()), audit: await readIdentityWriteAudit(tx) }
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 }),
    persist: (match, expected, revalidate, validUntil) => {
      const policy: AtomicIdentityPolicy = { clubId: config.clubId, apiTeamId: config.apiFootballTeamId,
        cacheId: expected.cache!.id, cacheRowHash: expected.cacheRowHash!, snapshotId: expected.snapshot?.id ?? null,
        snapshotHash: expected.snapshot?.contentHash ?? null, targets: [{ playerId: match.identity.id, providerId: match.providerId }],
        validUntil, allowSingleCandidate: match.margin === null,
        revalidate: async (tx, _m, now) => revalidate(await loadClubIdentityEvidence(tx, config, now), clock()),
      }
      return persistPlayerIdentityWithPolicy(db, match, policy, clock)
    },
  }
}
