import assert from "node:assert/strict"
import test from "node:test"
import { auditedObservation, auditedPlayers, auditedTransfers } from "../../fixtures/auditedTransfers"
import { evaluateTransferHistory, runTransferHistoryBatch, type TransferBatchConfig } from "../../../services/transferHistoryBatch"
import { ApiFootballRateLimitError } from "../../../services/apiFootballErrors"
import { TransferObservationError } from "../../../lib/transferObservations"

const now = new Date(auditedTransfers.now)
const context = { clubs: auditedTransfers.clubs, rosters: auditedTransfers.rosters, lineups: auditedTransfers.lineups }
const config: TransferBatchConfig = { mode: "DRY_RUN", maxPlayers: 6, maxRequests: 6, remainingQuota: 6, zeroRetry: true }
const cache = { cached: async (id: number) => auditedObservation(id) }

test("all six audited observations yield 5 candidates + unresolved Salah, zero API/zero writes", async () => {
  const r = await runTransferHistoryBatch({ ...config, maxRequests: 0, remainingQuota: 0 }, auditedPlayers, context, now, cache)
  assert.equal(r.completed.length, 6); assert.equal(r.requestsUsed, 0); assert.equal(r.writes, 0)
  assert.equal(r.completed.filter(r => r.proposedUpdate).length, 5)
  assert.equal(r.completed[0].decision.decision, "TEAM_IDENTITY_UNRESOLVED")
  assert.equal(r.stopReason, null); assert.deepEqual(r.notStarted, [])
  assert.ok(r.completed.every(r => r.writes === 0 && !r.decision.writable))
})

test("quota stop resumes only remaining players, preserving bounded cumulative request usage", async () => {
  const calls: number[] = []
  const source = { cached: async () => null, request: async (id: number) => { calls.push(id); return auditedObservation(id) } }
  const first = await runTransferHistoryBatch({ ...config, remainingQuota: 2 }, auditedPlayers, context, now, source)
  assert.equal(first.completed.length, 2); assert.equal(first.requestsUsed, 2); assert.equal(first.notStarted.length, 4)
  const next = await runTransferHistoryBatch({ ...config, remainingQuota: 4 }, auditedPlayers, context, now, source, first.checkpoint)
  assert.equal(next.completed.length, 6); assert.equal(next.requestsUsed, 6); assert.equal(next.requestsThisRun, 4)
  assert.deepEqual(calls, auditedPlayers.map(p => p.providerPlayerId)); assert.equal(next.writes, 0)
})

for (const error of [new ApiFootballRateLimitError(), new TransferObservationError("MALFORMED_TRANSFER_JSON"), new Error("SECRET should not leak")]) {
  test(`fail-stop after partial progress: ${error.name}/${error instanceof ApiFootballRateLimitError ? "quota" : "error"}`, async () => {
    const calls: number[] = []
    const r = await runTransferHistoryBatch(config, auditedPlayers, context, now, { cached: async () => null,
      request: async id => { calls.push(id); if (calls.length === 2) throw error; return auditedObservation(id) } })
    assert.equal(r.completed.length, 1); assert.equal(r.failedPlayerId, auditedPlayers[1].playerId)
    assert.equal(r.notStarted.length, 4); assert.equal(r.requestsUsed, 2); assert.equal(r.retries, 0)
    assert.equal(r.writes, 0); assert.equal(calls.length, 2)
    assert.ok(!JSON.stringify(r).includes("SECRET"))
    if (error instanceof ApiFootballRateLimitError) assert.equal(r.stopReason, "API_FOOTBALL_RATE_LIMIT")
    await assert.rejects(runTransferHistoryBatch(config, auditedPlayers, context, now, cache, r.checkpoint), /RESUME_REQUIRES_REVIEW/)
  })
}

test("invalid identity in cache fails before request fallback or subsequent player", async () => {
  let calls = 0, requests = 0
  const r = await runTransferHistoryBatch(config, auditedPlayers, context, now, { cached: async () => { calls++; return auditedObservation(44) },
    request: async () => { requests++; throw new Error("forbidden") } })
  assert.equal(calls, 1); assert.equal(requests, 0); assert.equal(r.completed.length, 0)
  assert.equal(r.stopReason, "INVALID_PROVIDER_IDENTITY"); assert.equal(r.notStarted.length, 5)
})

test("cache miss with zero quota or no request capability is safe stop, no fake completion", async () => {
  for (const c of [{ ...config, remainingQuota: 0 }, { ...config, maxRequests: 0 }]) {
    let requested = 0
    const r = await runTransferHistoryBatch(c, auditedPlayers, context, now, { cached: async () => null,
      request: async id => { requested++; return auditedObservation(id) } })
    assert.equal(requested, 0); assert.equal(r.completed.length, 0); assert.equal(r.notStarted.length, 6)
  }
  const r = await runTransferHistoryBatch(config, auditedPlayers, context, now, { cached: async () => null })
  assert.equal(r.requestsUsed, 0); assert.equal(r.checkpoint.failure, false)
})

test("invalid mode/budgets/duplicate identity reject before invoking capabilities", async () => {
  const forbidden = { cached: async () => { throw new Error("capability must not run") } }
  for (const c of [{ ...config, mode: "WRITE" }, { ...config, maxPlayers: 5 }, { ...config, maxRequests: 51 }, { ...config, remainingQuota: -1 }, { ...config, zeroRetry: false }]) {
    await assert.rejects(runTransferHistoryBatch(c as TransferBatchConfig, auditedPlayers, context, now, forbidden), /INVALID_TRANSFER_BATCH_BUDGET/)
  }
  await assert.rejects(runTransferHistoryBatch(config, [auditedPlayers[0], auditedPlayers[0]], context, now, forbidden), /DUPLICATE/)
})

test("resume rejects changed inputs, budget expansion, corruption and stale observations before any I/O", async () => {
  const first = await runTransferHistoryBatch({ ...config, remainingQuota: 0 }, auditedPlayers, context, now,
    { cached: async id => id === 306 ? auditedObservation(id) : null })
  const forbidden = { cached: async () => { throw new Error("capability must not run") } }
  await assert.rejects(runTransferHistoryBatch(config, auditedPlayers, { ...context, lineups: [] }, now, forbidden, first.checkpoint), /RESUME_REQUIRES_REVIEW/)
  await assert.rejects(runTransferHistoryBatch({ ...config, maxRequests: 7 }, auditedPlayers, context, now, forbidden, first.checkpoint), /RESUME_REQUIRES_REVIEW/)
  const corrupted = structuredClone(first.checkpoint); corrupted.observations[0].transfers[0].typeRaw = "changed"
  await assert.rejects(runTransferHistoryBatch(config, auditedPlayers, context, now, forbidden, corrupted), /RESUME_REQUIRES_REVIEW/)
  await assert.rejects(runTransferHistoryBatch(config, auditedPlayers, context, new Date("2026-09-24"), forbidden, first.checkpoint), /EXPIRED/)
})

test("empty valid observation is not fabricated identity or transfer; expired response is rejected", () => {
  const empty = auditedObservation(306)
  empty.transfers = []; empty.chronologicalAsc = []; empty.chronologicalDesc = []; empty.returnedPlayerIdentity = null; empty.validation = "EMPTY_NO_EVIDENCE"
  const r = evaluateTransferHistory(auditedPlayers[0], empty, context, now)
  assert.equal(r.proposedUpdate, null); assert.equal(r.events.length, 0)
  assert.throws(() => evaluateTransferHistory(auditedPlayers[0], empty, context, new Date("2026-09-24")), /EXPIRED/)
})

for (const [raw, decision] of [["Loan", "LOAN_CANDIDATE"], ["Return from loan", "RETURN_FROM_LOAN_CANDIDATE"], ["Free agent", "TRANSFER_CANDIDATE"], [null, "TRANSFER_CANDIDATE"]] as const) {
  test(`typeRaw ${raw} is preserved and never becomes marketValue`, () => {
    const observation = auditedObservation(44); observation.transfers.at(-1)!.typeRaw = raw
    const r = evaluateTransferHistory(auditedPlayers[1], observation, context, now)
    assert.equal(r.decision.decision, decision); assert.equal(r.events.at(-1)!.typeRaw, raw)
    assert.equal("marketValue" in r.proposedUpdate!, false)
  })
}
