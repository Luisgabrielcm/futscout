import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { clubIdentityHash, type ClubIdentityReport } from "./clubPlayerIdentityPipeline"
import { rankClubIdentityAutoMatches } from "./clubIdentityBatchSelection"
import type { MultiClubIdentityReport } from "./multiClubIdentityPipeline"

export type MultiClubPreparedCandidate = {
  playerId: string; slug: string; providerId: number; confidence: number; margin: number | null
  expectedUpdatedAt: string; clubId: string; snapshotPresent: boolean
}
type Club = {
  clubId: string; clubSlug: string; teamId: number; season: number; cacheRowHash: string
  cacheExpiresAt: string; snapshotHash: string | null; clubDryRunHash: string
  orderedLocalAutoCandidates: MultiClubPreparedCandidate[]
  orderedLocalTopCandidates: MultiClubPreparedCandidate[]
  selectedCandidates: MultiClubPreparedCandidate[]
  deferredCandidates: MultiClubPreparedCandidate[]
  deferredGlobalCandidates: MultiClubPreparedCandidate[]
}
export type MultiClubIdentityAuthorizationSummary = {
  summaryVersion: 1; scope: "MULTI_CLUB_IDENTITY_PREPARATION"; writeEnabled: false
  maxClubs: 5; maxAutoWritesPerClub: 5; maxAutoWritesGlobal: 20; globalSelectionRuleVersion: 1
  batchDryRunHash: string
  orderedClubList: { clubId: string; clubSlug: string; teamId: number; season: number }[]
  clubs: Club[]
  globalPoolOrder: MultiClubPreparedCandidate[]
  initialSelectedCandidates: MultiClubPreparedCandidate[]
  selectionOrder: MultiClubPreparedCandidate[]
  executionOrder: MultiClubPreparedCandidate[]
  deferredGlobalLimit: MultiClubPreparedCandidate[]
  revalidationDeferred: { playerId: string; reason: string }[]
}
export type MultiClubPreparation = { summary: MultiClubIdentityAuthorizationSummary; summaryHash: string; writeEnabled: false }

// Object keys are canonical; ARRAY ORDER is meaningful and never normalized away.
function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]))
  }
  throw new Error("INVALID_CANONICAL_VALUE")
}
export const multiClubPreparationHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
const ensure = (condition: unknown, code: string) => { if (!condition) throw new Error(code) }
const equal = (a: unknown, b: unknown) => isDeepStrictEqual(a, b)
const validHash = (v: string) => /^[a-f0-9]{64}$/.test(v)
const localCompare = (a: MultiClubPreparedCandidate, b: MultiClubPreparedCandidate) =>
  b.confidence - a.confidence || Number(b.snapshotPresent) - Number(a.snapshotPresent) ||
  (b.margin ?? -1) - (a.margin ?? -1) || a.providerId - b.providerId
const globalCompare = (clubs: Club[]) => (a: MultiClubPreparedCandidate, b: MultiClubPreparedCandidate) =>
  b.confidence - a.confidence || (b.margin ?? -1) - (a.margin ?? -1) ||
  clubs.findIndex(c => c.clubId === a.clubId) - clubs.findIndex(c => c.clubId === b.clubId) || a.providerId - b.providerId
const candidate = (r: ClubIdentityReport["rows"][number], clubId: string): MultiClubPreparedCandidate => ({
  playerId: r.localCandidate!.playerId, slug: r.localCandidate!.slug, providerId: r.providerPlayerId,
  confidence: r.confidence!, margin: r.margin, expectedUpdatedAt: r.localCandidate!.expectedUpdatedAt, clubId,
  snapshotPresent: r.lineupEvidence.present,
})

export function requireMultiClubSummary(s: MultiClubIdentityAuthorizationSummary) {
  ensure(s.summaryVersion === 1 && s.scope === "MULTI_CLUB_IDENTITY_PREPARATION" && s.writeEnabled === false &&
    s.globalSelectionRuleVersion === 1 && s.maxClubs === 5 && s.maxAutoWritesPerClub === 5 && s.maxAutoWritesGlobal === 20,
  "INVALID_PREPARATION_POLICY")
  ensure(s.clubs.length > 0 && s.clubs.length <= 5, "CLUB_LIMIT")
  for (const key of ["clubId", "clubSlug", "teamId"] as const)
    ensure(new Set(s.clubs.map(c => c[key])).size === s.clubs.length, "DUPLICATE_CLUB")
  ensure(equal(s.orderedClubList, s.clubs.map(({ clubId, clubSlug, teamId, season }) => ({ clubId, clubSlug, teamId, season }))),
    "CLUB_ORDER_MISMATCH")
  ensure(validHash(s.batchDryRunHash), "INVALID_BATCH_HASH")
  const all: MultiClubPreparedCandidate[] = []
  for (const c of s.clubs) {
    ensure(c.clubId && c.clubSlug && Number.isSafeInteger(c.teamId) && c.teamId > 0 && c.season === 2026 &&
      /^[a-f0-9]{32}$/.test(c.cacheRowHash) && validHash(c.clubDryRunHash) &&
      Number.isFinite(Date.parse(c.cacheExpiresAt)) && (c.snapshotHash === null || validHash(c.snapshotHash)), "INVALID_CLUB_EVIDENCE")
    for (const p of c.orderedLocalAutoCandidates) {
      ensure(p.clubId === c.clubId && p.playerId && p.slug && Number.isSafeInteger(p.providerId) && p.providerId > 0 &&
        Number.isInteger(p.confidence) && p.confidence >= 90 && p.confidence <= 100 &&
        (p.margin === null || Number.isFinite(p.margin) && p.margin >= 10 && p.margin <= 100) &&
        Number.isFinite(Date.parse(p.expectedUpdatedAt)) && typeof p.snapshotPresent === "boolean" &&
        (!p.snapshotPresent || c.snapshotHash !== null), "INVALID_CANDIDATE")
    }
    ensure(equal(c.orderedLocalAutoCandidates, [...c.orderedLocalAutoCandidates].sort(localCompare)), "LOCAL_ORDER_MISMATCH")
    ensure(c.orderedLocalTopCandidates.length <= 5 && c.selectedCandidates.length <= 5, "PER_CLUB_LIMIT")
    ensure(equal(c.orderedLocalTopCandidates, c.orderedLocalAutoCandidates.slice(0, 5)) &&
      equal(c.deferredCandidates, c.orderedLocalAutoCandidates.slice(5)), "LOCAL_TOP_SET_MISMATCH")
    all.push(...c.orderedLocalAutoCandidates)
  }
  ensure(new Set(all.map(p => p.playerId)).size === all.length &&
    new Set(all.map(p => p.providerId)).size === all.length, "GLOBAL_OWNERSHIP_CONFLICT")
  const pool = s.clubs.flatMap(c => c.orderedLocalTopCandidates).sort(globalCompare(s.clubs))
  ensure(equal(s.globalPoolOrder, pool), "GLOBAL_POOL_ORDER_MISMATCH")
  ensure(s.selectionOrder.length <= 20 && s.initialSelectedCandidates.length <= 20, "GLOBAL_LIMIT")
  ensure(equal(s.initialSelectedCandidates, pool.slice(0, 20)) && equal(s.deferredGlobalLimit, pool.slice(20)), "GLOBAL_SELECTION_MISMATCH")
  const removed = s.revalidationDeferred.map(r => r.playerId)
  ensure(new Set(removed).size === removed.length && s.revalidationDeferred.every(r => r.reason &&
    s.initialSelectedCandidates.some(p => p.playerId === r.playerId)), "INVALID_REVALIDATION_DEFERRED")
  ensure(equal(s.selectionOrder, s.initialSelectedCandidates.filter(p => !removed.includes(p.playerId))), "SELECTION_ORDER_MISMATCH")
  for (const c of s.clubs) {
    ensure(equal(c.selectedCandidates, c.orderedLocalTopCandidates.filter(p => s.selectionOrder.some(v => v.playerId === p.playerId))),
      "CLUB_SELECTED_MISMATCH")
    ensure(equal(c.deferredGlobalCandidates, c.orderedLocalTopCandidates.filter(p => s.deferredGlobalLimit.some(v => v.playerId === p.playerId))),
      "CLUB_DEFERRED_MISMATCH")
  }
  ensure(equal(s.executionOrder, s.clubs.flatMap(c => c.selectedCandidates)), "EXECUTION_ORDER_MISMATCH")
  ensure(equal([...s.executionOrder.map(p => p.playerId)].sort(), [...s.selectionOrder.map(p => p.playerId)].sort()),
    "EXECUTION_SET_MISMATCH")
}

export function prepareMultiClubIdentitySummary(report: MultiClubIdentityReport): MultiClubPreparation {
  ensure(report.apiCalls === 0 && report.writes === 0 && report.notExecutedClubs.length === 0 &&
    report.stopped === (report.stopReason !== null) && report.envelope.stopReason === report.stopReason &&
    report.selectedCount === report.clubs.reduce((n, c) => n + c.summary.candidateCount, 0) &&
    (!report.stopped || report.stopReason === "GLOBAL_AUTO_WRITE_LIMIT_EXCEEDED") &&
    report.envelope.mode === "DRY_RUN" && report.envelope.writeEnabled === false &&
    report.batchHash === clubIdentityHash(report.envelope), "BATCH_NOT_PREPARABLE")
  ensure(report.envelope.maxClubs === 5 && report.envelope.maxAutoWritesPerClub === 5 && report.envelope.maxAutoWritesGlobal === 20 &&
    report.clubs.length === report.envelope.orderedClubList.length &&
    equal(report.envelope.clubs, report.clubs.map(c => ({ ...c.summary, status: c.status, reason: c.reason, dryRunHash: c.dryRunHash }))),
  "BATCH_EVIDENCE_MISMATCH")
  const clubs: Club[] = report.clubs.map((c, index) => {
    const r = c.report
    ensure(c.status === "READY" && c.reason === null && r && ![...r!.rows, ...r!.localAssociations].some(r => r.decision === "CONFLICT"),
      "CLUB_NOT_READY")
    ensure(equal(report.envelope.orderedClubList[index], { clubId: c.clubId, clubSlug: c.clubSlug, teamId: c.teamId, season: c.season }) &&
      r!.config.clubId === c.clubId && r!.config.clubSlug === c.clubSlug && r!.config.apiFootballTeamId === c.teamId &&
      r!.config.season === c.season && c.cacheRowHash === r!.cache.rowHash && c.snapshotHash === r!.snapshotHash &&
      c.dryRunHash === clubIdentityHash({ config: r!.config, status: c.status, reason: c.reason, summary: c.summary,
        deferred: c.deferred, inputHash: r!.inputHash, rows: r!.rows, localAssociations: r!.localAssociations }), "CLUB_EVIDENCE_MISMATCH")
    const ranked = rankClubIdentityAutoMatches(r!)
    for (const row of ranked) ensure(row.localCandidate?.apiFootballId === null &&
      row.localCandidate.clubId === c.clubId && row.birth.matches && row.position.matches && row.rosterEvidence.teamMatches,
    "AUTO_CANDIDATE_NOT_ELIGIBLE")
    const all = ranked.map(row => candidate(row, c.clubId))
    return { clubId: c.clubId, clubSlug: c.clubSlug, teamId: c.teamId, season: c.season, cacheRowHash: c.cacheRowHash!,
      cacheExpiresAt: r!.cache.expiresAt, snapshotHash: c.snapshotHash, clubDryRunHash: c.dryRunHash,
      orderedLocalAutoCandidates: all, orderedLocalTopCandidates: all.slice(0, 5),
      selectedCandidates: [], deferredCandidates: all.slice(5), deferredGlobalCandidates: [] }
  })
  const pool = clubs.flatMap(c => c.orderedLocalTopCandidates).sort(globalCompare(clubs))
  const selectionOrder = pool.slice(0, 20), deferredGlobalLimit = pool.slice(20)
  for (const c of clubs) {
    c.selectedCandidates = c.orderedLocalTopCandidates.filter(p => selectionOrder.some(v => v.playerId === p.playerId))
    c.deferredGlobalCandidates = c.orderedLocalTopCandidates.filter(p => deferredGlobalLimit.some(v => v.playerId === p.playerId))
  }
  const summary: MultiClubIdentityAuthorizationSummary = { summaryVersion: 1, scope: "MULTI_CLUB_IDENTITY_PREPARATION", writeEnabled: false,
    maxClubs: 5, maxAutoWritesPerClub: 5, maxAutoWritesGlobal: 20, globalSelectionRuleVersion: 1,
    batchDryRunHash: report.batchHash, orderedClubList: report.envelope.orderedClubList, clubs, globalPoolOrder: pool,
    initialSelectedCandidates: selectionOrder, selectionOrder, executionOrder: clubs.flatMap(c => c.selectedCandidates),
    deferredGlobalLimit, revalidationDeferred: [] }
  return seal(summary)
}
function seal(summary: MultiClubIdentityAuthorizationSummary): MultiClubPreparation {
  requireMultiClubSummary(summary)
  return { summary: structuredClone(summary), summaryHash: multiClubPreparationHash(summary), writeEnabled: false }
}
export function requireSameMultiClubPreparation(expected: MultiClubPreparation, actual: MultiClubPreparation) {
  for (const p of [expected, actual]) {
    requireMultiClubSummary(p.summary)
    ensure(p.writeEnabled === false && p.summaryHash === multiClubPreparationHash(p.summary), "PREPARATION_HASH_MISMATCH")
  }
  ensure(expected.summaryHash === actual.summaryHash, "AUTHORIZATION_MISMATCH")
}

// Preparation only: a failed original member is removed; the 21st is NEVER promoted.
// A reduced summary still requires a NEW fresh preflight and future explicit authorization.
export function deferMultiClubCandidates(prepared: MultiClubPreparation, failures: { playerId: string; reason: string }[]) {
  requireSameMultiClubPreparation(prepared, prepared)
  const s = structuredClone(prepared.summary)
  ensure(failures.every(f => s.selectionOrder.some(p => p.playerId === f.playerId)), "NOT_A_SELECTED_CANDIDATE")
  s.revalidationDeferred.push(...failures)
  s.selectionOrder = s.initialSelectedCandidates.filter(p => !s.revalidationDeferred.some(f => f.playerId === p.playerId))
  for (const c of s.clubs) c.selectedCandidates = c.orderedLocalTopCandidates.filter(p => s.selectionOrder.some(v => v.playerId === p.playerId))
  s.executionOrder = s.clubs.flatMap(c => c.selectedCandidates)
  return seal(s)
}

export type MultiClubIdentityAuthorizationEnvelope = {
  envelopeVersion: 1; authorizationPrefix: "MULTI_CLUB_PREPARATION_ONLY_V1"; writeEnabled: false
  createdAt: string; expiresAt: string; expectedHead: string
  summary: MultiClubIdentityAuthorizationSummary; summaryHash: string
}
export function prepareMultiClubEnvelope(p: MultiClubPreparation, expectedHead: string, now: Date): MultiClubIdentityAuthorizationEnvelope {
  requireSameMultiClubPreparation(p, p)
  ensure(/^[a-f0-9]{40}$/.test(expectedHead) && Number.isFinite(now.getTime()), "INVALID_ENVELOPE_CONTEXT")
  const expires = Math.min(now.getTime() + 15 * 60000, ...p.summary.clubs.map(c => Date.parse(c.cacheExpiresAt)))
  ensure(expires > now.getTime(), "EXPIRED_CACHE")
  return { envelopeVersion: 1, authorizationPrefix: "MULTI_CLUB_PREPARATION_ONLY_V1", writeEnabled: false,
    createdAt: now.toISOString(), expiresAt: new Date(expires).toISOString(), expectedHead,
    summary: structuredClone(p.summary), summaryHash: p.summaryHash }
}
export function requirePreparationEnvelope(e: MultiClubIdentityAuthorizationEnvelope, current: MultiClubPreparation, head: string, now: Date) {
  ensure(e.envelopeVersion === 1 && e.authorizationPrefix === "MULTI_CLUB_PREPARATION_ONLY_V1" && e.writeEnabled === false &&
    e.expectedHead === head && /^[a-f0-9]{40}$/.test(head) && Number.isFinite(now.getTime()) &&
    Date.parse(e.createdAt) <= now.getTime() && Date.parse(e.expiresAt) > now.getTime() &&
    Date.parse(e.expiresAt) - Date.parse(e.createdAt) <= 15 * 60000 &&
    e.summary.clubs.every(c => Date.parse(c.cacheExpiresAt) >= Date.parse(e.expiresAt)), "ENVELOPE_MISMATCH_OR_EXPIRED")
  requireSameMultiClubPreparation({ summary: e.summary, summaryHash: e.summaryHash, writeEnabled: false }, current)
}
