import assert from "node:assert/strict"
import test from "node:test"
import { selectTransferObservationQueue, transferSignalsFromIdentityReports, type TransferQueueSignal } from "../../../services/transferObservationQueue"

const now = new Date("2026-09-15T23:10:00Z")
const signal = (i: number, reason: TransferQueueSignal["reason"] = "REVIEW_STALE_CLUB"): TransferQueueSignal => ({
  playerId: `p-${i}`, providerPlayerId: i + 1, ownershipUnique: true, reason, evidenceHash: `evidence-${i}`, observedAt: now.toISOString(),
})

test("54 stale signals feed incremental queue: only 5 confirmed identities, 49 remain identity review", () => {
  const rows = Array.from({ length: 54 }, (_, i) => ({
    reason: "REVIEW_STALE_CLUB", decision: "REVIEW" as const, providerPlayerId: i + 1,
    localCandidate: { playerId: `p-${i}`, slug: `p-${i}`, name: "Synthetic fixture", clubId: "ea-club", club: "EA Club",
      apiFootballId: i < 5 ? i + 1 : null, expectedUpdatedAt: now.toISOString() },
    rosterEvidence: { cacheId: "fixture-cache", cacheRowHash: "fixture-hash", teamMatches: false },
    lineupEvidence: { available: true, present: true, name: "Fixture", nameScore: 100, snapshotHash: "fixture-lineup" },
  }))
  const signals = transferSignalsFromIdentityReports([{ rows, inputHash: "fixture-report", generatedAt: now.toISOString() }])
  const r = selectTransferObservationQueue(signals, now, 3)
  assert.equal(signals.length, 54); assert.equal(r.selected.length, 3)
  assert.equal(r.identityReview.length, 49); assert.equal(r.deferred.length, 2)
  assert.equal(r.apiCalls, 0); assert.equal(r.writes, 0)
  assert.ok(r.selected.every(s => s.providerPlayerId !== null && s.ownershipUnique))
})

test("selection respects priority, cooldown, evidence idempotency and bounded remainder", () => {
  const signals = [signal(0, "BACKGROUND_INCREMENTAL"), signal(1, "MANUAL_PRIORITY"), signal(2, "RECENT_TRANSFER_WINDOW_CHANGE"),
    signal(3, "ABSENT_WITH_EXTERNAL_EVIDENCE"), signal(4), { ...signal(5), nextEligibleAt: "2026-09-16" }]
  const r = selectTransferObservationQueue(signals, now, 2)
  assert.deepEqual(r.selected.map(s => s.playerId), ["p-4", "p-3"])
  assert.equal(r.deferred.length, 4)
  const next = selectTransferObservationQueue(signals, now, 2, new Set(r.selected.map(s => s.key)))
  assert.deepEqual(next.selected.map(s => s.playerId), ["p-2", "p-1"])
  const changed = { ...signals[4], evidenceHash: "new-independent-evidence" }
  assert.equal(selectTransferObservationQueue([changed], now, 1, new Set(r.selected.map(s => s.key))).selected.length, 1)
})

test("duplicate signal dedupes; contradictory provider ownership blocks both, not guessed by priority", () => {
  assert.equal(selectTransferObservationQueue([signal(1), signal(1)], now, 10).selected.length, 1)
  const r = selectTransferObservationQueue([signal(1), { ...signal(1), playerId: "other", nextEligibleAt: "2026-09-20" }], now, 10)
  assert.equal(r.selected.length, 0); assert.equal(r.identityReview.length, 1); assert.equal(r.deferred.length, 1)
})

test("queue rejects unbounded/future/invalid signals, does not promote unconfirmed identity", () => {
  assert.throws(() => selectTransferObservationQueue([signal(1)], now, 16228), /BUDGET/)
  assert.throws(() => selectTransferObservationQueue([{ ...signal(1), observedAt: "2099-01-01" }], now, 1), /SIGNAL/)
  const r = selectTransferObservationQueue([{ ...signal(1), ownershipUnique: false }], now, 1)
  assert.equal(r.selected.length, 0); assert.equal(r.identityReview.length, 1)
})
