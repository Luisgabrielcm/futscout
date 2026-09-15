import { isDeepStrictEqual } from "node:util"
import { requireSameMultiClubPreparation, type MultiClubPreparation, type MultiClubPreparedCandidate } from "./multiClubIdentityAuthorization"

export const MULTI_CLUB_AUDIT_AREAS = ["Player", "ApiFootballPlayerMatchAttempt", "Club", "League", "PlayerAttributes",
  "ApiFootballTeamRosterCache", "SyncState", "SyncError", "ClubOfficialLineupSnapshot"] as const
type Row = { id: string; [key: string]: unknown }
export type MultiClubAuditSnapshot = Record<typeof MULTI_CLUB_AUDIT_AREAS[number], Row[]>
const unchanged = (a: Row, b: Row, ignored: string[] = []) => isDeepStrictEqual(
  Object.fromEntries(Object.entries(a).filter(([k]) => !ignored.includes(k))),
  Object.fromEntries(Object.entries(b).filter(([k]) => !ignored.includes(k))))
// Pure BEFORE/AFTER policy. Every pre-existing row survives, including attempts.
// Only confirmed commits may differ, not the whole authorized allow-list.
export function requireMultiClubWriteAudit(before: MultiClubAuditSnapshot, after: MultiClubAuditSnapshot, committed: MultiClubPreparedCandidate[]) {
  const fail = () => { throw new Error("AUDIT_MISMATCH") }
  if (new Set(committed.map(p => p.playerId)).size !== committed.length ||
      new Set(committed.map(p => p.providerId)).size !== committed.length) fail()
  for (const table of MULTI_CLUB_AUDIT_AREAS) {
    const old = before[table], fresh = after[table]
    if (!Array.isArray(old) || !Array.isArray(fresh) || new Set(old.map(r => r.id)).size !== old.length ||
        new Set(fresh.map(r => r.id)).size !== fresh.length) fail()
    const rows = new Map(fresh.map(r => [r.id, r]))
    for (const row of old) {
      const next = rows.get(row.id)
      if (!next) fail()
      const selected = table === "Player" ? committed.find(p => p.playerId === row.id) : undefined
      if (selected) {
        if (row.apiFootballId !== null || row.updatedAt !== selected.expectedUpdatedAt || row.clubId !== selected.clubId ||
            next!.apiFootballId !== selected.providerId || !Number.isFinite(Date.parse(String(next!.updatedAt))) ||
            !unchanged(row, next!, ["apiFootballId", "updatedAt"])) fail()
      } else if (!unchanged(row, next!)) fail()
    }
    const added = fresh.filter(r => !old.some(v => v.id === r.id))
    if (table === "ApiFootballPlayerMatchAttempt") {
      if (added.length !== committed.length || committed.some(p =>
        old.some(a => a.playerId === p.playerId) ||
        added.filter(a => a.playerId === p.playerId && a.status === "matched" && a.lastApiFootballId === p.providerId).length !== 1)) fail()
    } else if (added.length) fail()
  }
  if (committed.some(p => !before.Player.some(r => r.id === p.playerId))) fail()
}

type Failure = { position: number; outcome: "FAILURE" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH" |
  "CONFLICT" | "AUTHORIZATION_MISMATCH" | "CACHE_MISMATCH" | "CANDIDATE_SET_MISMATCH" | "PROVIDER_OWNERSHIP_MISMATCH" }
// Closed in-memory model: no DB/writer/callback can be supplied. This is NOT an executable write adapter.
export function simulatePreparedMultiClubBatch(prepared: MultiClubPreparation, failure?: Failure) {
  requireSameMultiClubPreparation(prepared, prepared)
  const plan = prepared.summary.executionOrder
  if (failure && (!Number.isInteger(failure.position) || failure.position < 1 || failure.position > plan.length ||
      !["FAILURE", "INDETERMINATE_COMMIT", "AUDIT_MISMATCH", "CONFLICT", "AUTHORIZATION_MISMATCH", "CACHE_MISMATCH",
        "CANDIDATE_SET_MISMATCH", "PROVIDER_OWNERSHIP_MISMATCH"].includes(failure.outcome))) throw new Error("INVALID_SIMULATED_FAILURE")
  const before = Object.fromEntries(MULTI_CLUB_AUDIT_AREAS.map(t => [t, []])) as unknown as MultiClubAuditSnapshot
  before.Player = prepared.summary.clubs.flatMap(c => c.orderedLocalAutoCandidates).map(p =>
    ({ id: p.playerId, clubId: p.clubId, slug: p.slug, apiFootballId: null, updatedAt: p.expectedUpdatedAt, untouched: "sentinel" }))
  let state = structuredClone(before)
  const committed: string[] = [], attempted: string[] = [], rolledBack: string[] = [], indeterminate: string[] = []
  const events: { event: string; clubId: string; playerId?: string; isolation?: "Serializable" }[] = []
  let stopReason: string | null = null
  outer: for (const club of prepared.summary.clubs) {
    if (!club.selectedCandidates.length) continue
    events.push({ event: "CLUB_START", clubId: club.clubId })
    for (const p of club.selectedCandidates) {
      attempted.push(p.playerId)
      events.push({ event: "TRANSACTION_BEGIN", clubId: club.clubId, playerId: p.playerId, isolation: "Serializable" })
      const draft = structuredClone(state) // One isolated fake transaction per player, never a batch transaction.
      const row = draft.Player.find(r => r.id === p.playerId)!
      row.apiFootballId = p.providerId
      row.updatedAt = new Date(Date.parse(p.expectedUpdatedAt) + 1000).toISOString()
      draft.ApiFootballPlayerMatchAttempt.push({ id: `fake-attempt-${p.playerId}`, playerId: p.playerId, status: "matched", lastApiFootballId: p.providerId })
      if (failure?.position === attempted.length && failure.outcome !== "AUDIT_MISMATCH") {
        stopReason = failure.outcome
        if (failure.outcome === "INDETERMINATE_COMMIT") {
          // Unknown outcome is NOT asserted to have rolled back and is NOT retried.
          indeterminate.push(p.playerId)
        } else {
          rolledBack.push(p.playerId)
          events.push({ event: "ROLLBACK", clubId: club.clubId, playerId: p.playerId })
        }
        events.push({ event: stopReason, clubId: club.clubId, playerId: p.playerId })
        break outer
      }
      state = draft; committed.push(p.playerId)
      events.push({ event: "COMMIT", clubId: club.clubId, playerId: p.playerId })
      if (failure?.position === attempted.length) { stopReason = failure.outcome; break outer }
      requireMultiClubWriteAudit(before, state, plan.filter(p => committed.includes(p.playerId)))
    }
    requireMultiClubWriteAudit(before, state, plan.filter(p => committed.includes(p.playerId)))
    events.push({ event: "CLUB_AUDIT", clubId: club.clubId })
  }
  return { simulation: true, realWrites: 0, retries: 0, committed, attempted, rolledBack, indeterminate, events,
    stopped: stopReason !== null, stopReason, before, afterKnownCommits: state,
    // Deliberately not a claimed actual AFTER snapshot when commit outcome is unknown.
    actualAfterKnown: indeterminate.length === 0 }
}
