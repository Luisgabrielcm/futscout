import assert from "node:assert/strict"
import test from "node:test"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { evaluateLeagueAuditQuota, leagueReconciliationAction, readLeagueReconciliationPreflight } from "../../../services/leagueReconciliationPreflight"
import { withPrismaReadOnly } from "../../../lib/prismaReadOnly"

test("daily quota drop is concurrent-use evidence, never the auditor call count", () => {
  const result = evaluateLeagueAuditQuota({localCalls: 1, maxLocalCalls: 8, dailyRemaining: 7441, previousDailyRemaining: 7451, minuteRemaining: 299})
  assert.deepEqual(result, {status: "CONTINUE", dailyDrop: 10, possibleConcurrentUse: true})
})

test("local budget, minute quota, daily quota and HTTP 429 have independent stops", () => {
  const base = {localCalls: 8, maxLocalCalls: 8, dailyRemaining: 7400, previousDailyRemaining: 7401, minuteRemaining: 299}
  assert.equal(evaluateLeagueAuditQuota(base).status, "CONTINUE")
  assert.equal(evaluateLeagueAuditQuota({...base, localCalls: 9}).status, "STOP_LOCAL_BUDGET")
  assert.equal(evaluateLeagueAuditQuota({...base, dailyRemaining: 100}).status, "STOP_LOW_QUOTA")
  assert.equal(evaluateLeagueAuditQuota({...base, minuteRemaining: 10}).status, "STOP_LOW_QUOTA")
  assert.equal(evaluateLeagueAuditQuota({...base, httpStatus: 429}).status, "STOP_HTTP_429")
  assert.equal(evaluateLeagueAuditQuota({...base, dailyRemaining: null, minuteRemaining: null}).possibleConcurrentUse, false)
})

test("explicit unknown-destination authorization permits only the guarded read path", () => {
  const authorized = { destinationVerified: false, unknownDestinationReadOnlyAuthorized: true, readOnlyConfirmed: true }
  assert.equal(leagueReconciliationAction(authorized), "CONTINUE")
  assert.equal(leagueReconciliationAction({ ...authorized, readOnlyConfirmed: false }), "STOP_READ_ONLY_UNCONFIRMED")
  assert.equal(leagueReconciliationAction({ ...authorized, httpStatus: 429 }), "STOP_HTTP_429")
  assert.equal(leagueReconciliationAction({ ...authorized, systemFailure: true }), "STOP_SYSTEM_FAILURE")
})

test("participant divergence or missing evidence enters review without stopping the next league", () => {
  const safe = { destinationVerified: true, readOnlyConfirmed: true }
  assert.equal(leagueReconciliationAction({ ...safe, participantDivergence: true }), "REVIEW_CONTINUE")
  assert.equal(leagueReconciliationAction({ ...safe, evidenceMissing: true }), "REVIEW_CONTINUE")
  assert.equal(leagueReconciliationAction(safe), "CONTINUE")
})

test("global safety gates override participant review", () => {
  const safe = { destinationVerified: true, readOnlyConfirmed: true, participantDivergence: true }
  assert.equal(leagueReconciliationAction({ ...safe, destinationVerified: false }), "STOP_DESTINATION_UNVERIFIED")
  assert.equal(leagueReconciliationAction({ ...safe, readOnlyConfirmed: false }), "STOP_READ_ONLY_UNCONFIRMED")
  assert.equal(leagueReconciliationAction({ ...safe, httpStatus: 429 }), "STOP_HTTP_429")
  assert.equal(leagueReconciliationAction({ ...safe, systemFailure: true }), "STOP_SYSTEM_FAILURE")
})

test("failed read-only assertion prevents every catalog query", async () => {
  let reads = 0
  const model = { async findMany() { reads++; return [] } }
  const db = { async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    return fn({ $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async () => [{ transaction_read_only: "off" }],
      league: model, club: model, brandAssetIdentity: model, player: model })
  } } as unknown as PrismaClient
  assert.equal((await readLeagueReconciliationPreflight(db)).status, "STOP_OPERATIONAL")
  assert.equal(reads, 0)
})

test("all preflight reads use the protected transaction, which rolls back", async () => {
  const events: string[] = []
  const db = { async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    let protectedRead = false
    const model = { async findMany() { assert.equal(protectedRead, true); events.push("READ"); return [] } }
    try { return await fn({
      async $executeRawUnsafe(sql: string) { assert.equal(sql, "SET TRANSACTION READ ONLY"); protectedRead = true },
      async $queryRawUnsafe() { return [{ transaction_read_only: "on" }] },
      league: model, club: model, brandAssetIdentity: model, player: model,
    }) } catch (e) { events.push("ROLLBACK"); throw e }
  } } as unknown as PrismaClient
  assert.equal((await readLeagueReconciliationPreflight(db)).status, "READ_CONFIRMED")
  assert.deepEqual(events, ["READ", "READ", "READ", "READ", "ROLLBACK"])
})

for (const phase of ["connect", "query", "rollback"] as const) test(`${phase} failure stops once without identity classification`, async () => {
  let attempts = 0
  const db = { async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    attempts++
    if (phase === "connect") throw new Error("connection failure")
    const model = { async findMany() { if (phase === "query") throw new Error("query failure"); return [] } }
    try { return await fn({ $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async () => [{ transaction_read_only: "on" }],
      league: model, club: model, brandAssetIdentity: model, player: model,
    }) } catch (e) { if (phase === "rollback") throw new Error("rollback failure"); throw e }
  } } as unknown as PrismaClient
  assert.deepEqual(await readLeagueReconciliationPreflight(db), { status: "STOP_OPERATIONAL", classification: "NOT_EVALUATED_ACCESS_FAILURE" })
  assert.equal(attempts, 1)
})

test("write rejection propagates through the read-only guard and rolls back", async () => {
  let rolledBack = false
  const denied = Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" })
  const db = { async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    let readOnly = false
    try { return await fn({
      async $executeRawUnsafe(sql: string) { if (sql === "SET TRANSACTION READ ONLY") { readOnly = true; return 0 }
        assert.equal(readOnly, true); throw denied },
      async $queryRawUnsafe() { return [{ transaction_read_only: "on" }] },
    }) } catch (e) { rolledBack = true; throw e }
  } } as unknown as PrismaClient
  await assert.rejects(withPrismaReadOnly(db, tx => tx.$executeRawUnsafe('INSERT INTO "Probe" DEFAULT VALUES')), e => e === denied)
  assert.equal(rolledBack, true)
})
