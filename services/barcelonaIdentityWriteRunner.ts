import { isDeepStrictEqual } from "node:util"
import { getBarcelonaIdentityBatch,
  prepareBarcelonaIdentityMatch, requireCurrentBarcelonaEvidence,
  type BarcelonaIdentityBatchId, type IdentityWriteEvidence } from "./barcelonaIdentityWritePolicy"
import { planBarcelonaIdentityCoverage } from "./playerIdentityCoverage"
import { identityPreWriteSummary, identityWriteAuthorization, requireIdentityWriteAuthorization,
  runPreparedBarcelonaIdentityWrites, IdentityWritePreconditionError,
  type IdentityAuthorizationMatch, type IdentityWriteAudit, type IdentityWriteDependencies } from "./playerIdentityWritePilot"

type Emit = (report: unknown) => void

function evidenceGate(evidence: IdentityWriteEvidence, now: Date, batchId: BarcelonaIdentityBatchId) {
  const { targets, slugs, evidence: pin } = getBarcelonaIdentityBatch(batchId)
  const decoded = requireCurrentBarcelonaEvidence(evidence, now, batchId)
  if (evidence.cache?.playerCount !== 27 || decoded.roster.length !== 27) throw new Error("EXACT_27_PLAYER_ROSTER_REQUIRED")
  if (evidence.snapshot?.fixtureExternalId !== 1635628 || evidence.snapshot.payloadVersion !== 1 ||
      decoded.lineup.fixture.id !== 1635628) throw new Error("EXPECTED_BARCELONA_FIXTURE_REQUIRED")
  for (const [i, target] of targets.entries()) {
    const p = evidence.players.find(p => p.id === target.playerId)
    if (!p || p.clubId !== pin.clubId || p.club?.apiFootballId !== 529) throw new Error("PLAYER_BASELINE_CHANGED")
    if (p.slug !== slugs[i]) throw new IdentityWritePreconditionError("AUTHORIZATION_MISMATCH")
    if (evidence.players.some(p => p.apiFootballId === target.providerId && p.id !== target.playerId)) {
      throw new IdentityWritePreconditionError("CONFLICT_PROVIDER_ID_TAKEN")
    }
  }
  return decoded
}

function auditReport(audit: IdentityWriteAudit, batchId: BarcelonaIdentityBatchId) {
  const { targets } = getBarcelonaIdentityBatch(batchId)
  return { tables: audit.tables, associated: audit.players.filter(p => p.apiFootballId !== null).length,
    attempts: audit.attempts.length, targets: targets.map(t => ({ playerId: t.playerId,
      apiFootballId: audit.players.find(p => p.id === t.playerId)?.apiFootballId,
      attempt: audit.attempts.find(a => a.playerId === t.playerId)?.data ?? null })) }
}

function alreadyAssociatedSummary(evidence: IdentityWriteEvidence, audit: IdentityWriteAudit, now: Date,
  batchId: BarcelonaIdentityBatchId): IdentityAuthorizationMatch[] {
  const { targets } = getBarcelonaIdentityBatch(batchId)
  const { lineup } = evidenceGate(evidence, now, batchId)
  return targets.map(t => {
    const p = evidence.players.find(p => p.id === t.playerId)!
    const attempt = audit.attempts.find(a => a.playerId === p.id)?.data
    if (p.apiFootballId !== t.providerId || p.attempt?.status !== "matched" ||
        attempt?.status !== "matched" || attempt.lastApiFootballId !== t.providerId) throw new Error("PARTIAL_OR_INCONSISTENT_ASSOCIATION")
    // The real core explicitly reports ALREADY_ASSOCIATED_NO_WRITE; never erase IDs to manufacture AUTO_MATCH.
    const result = planBarcelonaIdentityCoverage({ players: evidence.players, cache: evidence.cache, lineup,
      playerIds: [p.id], season: 2026, now })
    const row = result.rows[0]
    if (result.failedFast || row?.reason !== "ALREADY_ASSOCIATED_NO_WRITE" || row.sourcePlayerId !== t.providerId ||
        row.score === null || row.margin === null) throw new Error("INCONSISTENT_ASSOCIATED_EVIDENCE")
    return { identity: p, providerId: t.providerId, confidence: row.score, margin: row.margin,
      cacheRowHash: evidence.cacheRowHash!, snapshotHash: evidence.snapshot!.contentHash }
  })
}

// Pure preflight for one closed batch: no persistence and no dependencies constructed.
export function prepareBarcelonaIdentityBatch(evidence: IdentityWriteEvidence, now: Date,
  batchId: BarcelonaIdentityBatchId = "first-five") {
  evidenceGate(evidence, now, batchId)
  return getBarcelonaIdentityBatch(batchId).targets.map(t => prepareBarcelonaIdentityMatch(evidence, t.playerId, now, batchId))
}

// No real client is constructed here. Tests inject fakes; the CLI supplies the approved atomic adapter.
export async function executeBarcelonaIdentityWrite(confirmation: string, deps: IdentityWriteDependencies, emit: Emit,
  batchId: BarcelonaIdentityBatchId = "first-five") {
  const { targets } = getBarcelonaIdentityBatch(batchId)
  const evidence = await deps.loadEvidence()
  evidenceGate(evidence, deps.clock(), batchId)
  const alreadyAssociated = targets.every(t => evidence.players.find(p => p.id === t.playerId)?.apiFootballId === t.providerId)
  if (alreadyAssociated) {
    const before = await deps.audit()
    const summary = alreadyAssociatedSummary(evidence, before, deps.clock(), batchId)
    emit({ phase: "PRE_WRITE_SUMMARY", ...identityPreWriteSummary(summary), confirmation: identityWriteAuthorization(summary) })
    requireIdentityWriteAuthorization(summary, confirmation)
    emit({ phase: "BEFORE", ...auditReport(before, batchId), updatedAt: summary.map(m => ({ playerId: m.identity.id, updatedAt: m.identity.updatedAt })) })
    const results = []
    for (const t of targets) {
      const current = await deps.loadEvidence(), after = await deps.audit()
      requireIdentityWriteAuthorization(alreadyAssociatedSummary(current, after, deps.clock(), batchId), confirmation)
      if (!isDeepStrictEqual(before, after)) throw new Error("IDENTITY_WRITE_AUDIT_FAILED")
      const result = { playerId: t.playerId, providerId: t.providerId, status: "ALREADY_MATCHED_SAME_ID" as const }
      results.push(result); emit({ phase: "AFTER", result, ...auditReport(after, batchId) })
    }
    return { results, stopped: false, auditFailure: false, committedPlayerIds: [], untouchedPlayerIds: [] }
  }
  // Mixed/partial states are not resumed automatically. Every new write needs a pristine reviewed target.
  const prepared = prepareBarcelonaIdentityBatch(evidence, deps.clock(), batchId)
  emit({ phase: "PRE_WRITE_SUMMARY", ...identityPreWriteSummary(prepared), confirmation: identityWriteAuthorization(prepared) })
  requireIdentityWriteAuthorization(prepared, confirmation)
  return runPreparedBarcelonaIdentityWrites(prepared, { ...deps, requirePristine: true,
    loadEvidence: async () => { const fresh = await deps.loadEvidence(); evidenceGate(fresh, deps.clock(), batchId); return fresh },
    onAudit: (phase, audit, result) => emit({ phase, result, ...auditReport(audit, batchId),
      ...(phase === "BEFORE" ? { updatedAt: prepared.map(m => ({ playerId: m.identity.id, updatedAt: m.identity.updatedAt })) } : {}) }),
  }, confirmation, batchId)
}
