import assert from "node:assert/strict"
import test from "node:test"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { runClubIdentityReadOnly } from "../../../services/clubPlayerIdentityReadRepository"
import { clubIdentityFixture, identityNow } from "../../fixtures/clubIdentity"

function fake(size = 2) {
  const f = clubIdentityFixture(50, "manchester-city", size), events: { name: string; input?: unknown }[] = []
  let hashes = 0
  const options = { auditMismatch: false, writable: false }
  const db = { $transaction: async <T>(body: (tx: unknown) => Promise<T>, input: unknown) => {
    events.push({ name: "transaction", input })
    return body({
      $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); events.push({ name: "readOnly" }) },
      $queryRawUnsafe: async (sql: string) => {
        if (sql === "SHOW transaction_read_only") return [{ transaction_read_only: options.writable ? "off" : "on" }]
        if (sql.startsWith("SELECT count")) return [{ count: "2", hash: options.auditMismatch && hashes++ >= 9 ? "different" : "same" }]
        assert.match(sql, /SELECT md5/); return [{ hash: f.evidence.cacheRowHash }]
      },
      club: { findMany: async (input: unknown) => { events.push({ name: "clubs", input }); return [f.evidence.club] } },
      apiFootballTeamRosterCache: { findUnique: async (input: unknown) => { events.push({ name: "cache", input }); return f.evidence.cache } },
      player: {
        findMany: async (input: unknown) => { events.push({ name: "players", input }); return f.players.map(({ attempt, ...p }) => ({ ...p, apiFootballMatchAttempt: attempt })) },
        count: async () => { events.push({ name: "count" }); return 0 },
      },
      clubOfficialLineupSnapshot: { findMany: async (input: unknown) => { events.push({ name: "snapshot", input }); return [] } },
    })
  } } as unknown as PrismaClient
  return { ...f, db, events, options }
}
test("generic read adapter executes one RepeatableRead/READ ONLY transaction and invariant audit", async () => {
  const f = fake(), result = await runClubIdentityReadOnly(f.db, f.config, identityNow)
  assert.equal(result.report.counts.AUTO_MATCH, 2); assert.equal(result.readOnly, true); assert.deepEqual(result.before, result.after)
  assert.equal(result.futureWritePlan.writeEnabled, false)
  assert.deepEqual(f.events[0], { name: "transaction", input: { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 } })
  assert.equal(f.events[1].name, "readOnly")
})
test("bulk candidate/attempt/ownership reads stay constant for two vs twenty provider rows", async () => {
  for (const size of [2, 20]) {
    const f = fake(size); await runClubIdentityReadOnly(f.db, f.config, identityNow)
    for (const name of ["players", "clubs", "cache", "snapshot", "count"]) assert.equal(f.events.filter(e => e.name === name).length, 1)
    const query = f.events.find(e => e.name === "players")!.input as { where: { OR: unknown[] }; select: Record<string, unknown>; take: number }
    assert.equal(query.where.OR.length, size + 2); assert.ok(query.select.apiFootballMatchAttempt)
    assert.equal(query.take, f.config.budget.maxRelevantPlayers + 1)
    assert.deepEqual(query.where.OR[2], { dateOfBirth: { gte: new Date("2000-01-01"), lt: new Date("2000-01-02") } })
  }
})
test("AUTO_WRITE fails before any DB transaction is opened", async () => {
  const f = fake(); f.config.mode = "AUTO_WRITE"
  await assert.rejects(runClubIdentityReadOnly(f.db, f.config, identityNow), /AUTO_WRITE_DISABLED/)
  assert.equal(f.events.length, 0)
})
test("readonly setting and audit mismatch fail closed", async () => {
  const f = fake(); f.options.writable = true
  await assert.rejects(runClubIdentityReadOnly(f.db, f.config, identityNow), /READ_ONLY_REQUIRED/)
  const g = fake(); g.options.auditMismatch = true
  await assert.rejects(runClubIdentityReadOnly(g.db, g.config, identityNow), /READ_ONLY_AUDIT_MISMATCH/)
})
test("expired cache blocks before loading any candidates and never refreshes", async () => {
  const f = fake(); f.evidence.cache!.expiresAt = identityNow
  await assert.rejects(runClubIdentityReadOnly(f.db, f.config, identityNow), /VALID_ROSTER/)
  assert.equal(f.events.filter(e => e.name === "players").length, 0)
})
