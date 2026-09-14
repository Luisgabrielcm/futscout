import assert from "node:assert/strict"
import test from "node:test"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { runMultiClubIdentityReadOnly } from "../../../services/multiClubIdentityReadRepository"
import { clubIdentityFixture } from "../../fixtures/clubIdentity"

function fixture(size = 2, cachePresent = true) {
  const f = clubIdentityFixture(42, "arsenal", size), now = new Date()
  f.evidence.cache!.fetchedAt = new Date(now.getTime() - 60000)
  f.evidence.cache!.expiresAt = new Date(now.getTime() + 86400000)
  const calls: string[] = [], faults = { readOnly: true, changed: false, expire: false }
  let auditPasses = 0
  const tx = {
    $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); calls.push("readonly") },
    $queryRawUnsafe: async (sql: string) => {
      calls.push("sql")
      if (sql === "SHOW transaction_read_only") return [{ transaction_read_only: faults.readOnly ? "on" : "off" }]
      if (sql.startsWith("SELECT count(*)::text")) {
        auditPasses++
        return [{ count: String(size), hash: faults.changed && auditPasses > 9 ? "changed" : "stable" }]
      }
      if (sql.includes('GROUP BY p."clubId"')) return [{ clubId: f.config.clubId, players: size, associated: 0, attributes: size }]
      if (sql.includes('ORDER BY "apiTeamId",season')) return cachePresent ? [{ apiTeamId: 42, season: 2026,
        playerCount: size, fetchedAt: f.evidence.cache!.fetchedAt, expiresAt: faults.expire ? new Date(0) : f.evidence.cache!.expiresAt,
        hash: f.evidence.cacheRowHash }] : []
      if (sql.startsWith("SELECT md5")) return [{ hash: f.evidence.cacheRowHash }]
      assert.fail(`Unexpected SQL shape: ${sql}`)
    },
    club: { findMany: async () => { calls.push("club"); return [{ ...f.evidence.club, name: "Arsenal", league: { name: "Premier League" } }] } },
    apiFootballTeamRosterCache: { findUnique: async () => { calls.push("roster"); return f.evidence.cache } },
    clubOfficialLineupSnapshot: { findMany: async () => { calls.push("snapshot"); return [] } },
    player: {
      count: async () => { calls.push("count"); return 0 },
      findMany: async (query: { where: { slug?: unknown }; select: Record<string, unknown> }) => {
        if (query.where.slug) { calls.push("regression"); return [] }
        calls.push("bulkPlayers")
        assert.ok(query.select.apiFootballMatchAttempt)
        return f.players.map(({ attempt, ...p }) => ({ ...p, apiFootballMatchAttempt: attempt }))
      },
    },
  }
  const db = { $transaction: async <T>(body: (tx: unknown) => Promise<T>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "RepeatableRead", timeout: 60000, maxWait: 5000 })
    calls.push("transaction"); return body(tx)
  } } as unknown as PrismaClient
  return { calls, faults, run: () => runMultiClubIdentityReadOnly(db, ["arsenal"], () => calls.length) }
}
test("real read boundary bulk-loads once for 2 and 20 players, no N+1", async () => {
  const totals: number[] = []
  for (const size of [2, 20]) {
    const f = fixture(size), r = await f.run()
    assert.equal(r.stopped, false); assert.equal(r.clubs[0].report!.counts.AUTO_MATCH, size)
    assert.equal(r.selectedCount, Math.min(size, 5)); assert.equal(r.writes, 0)
    assert.deepEqual(r.before, r.after)
    assert.equal(f.calls.filter(c => c === "bulkPlayers").length, 1)
    assert.equal(f.calls.filter(c => c === "roster").length, 1)
    totals.push(r.totalQueries)
  }
  assert.equal(totals[0], totals[1])
})
test("absent and expired 2026 caches never load roster candidates", async () => {
  for (const present of [false, true]) {
    const f = fixture(2, present); f.faults.expire = present
    const r = await f.run()
    assert.equal(r.clubs[0].status, "NEEDS_FRESH_ROSTER"); assert.equal(r.clubs[0].report, null)
    assert.equal(f.calls.filter(c => ["bulkPlayers", "roster"].includes(c)).length, 0)
    assert.equal(r.refreshPlan[0].executed, false)
  }
})
test("missing READ ONLY setting aborts database adapter", async () => {
  const f = fixture(); f.faults.readOnly = false
  await assert.rejects(f.run(), /READ_ONLY_REQUIRED/)
  assert.equal(f.calls.includes("bulkPlayers"), false)
})
test("independent after transaction detects global table changes", async () => {
  const f = fixture(); f.faults.changed = true
  await assert.rejects(f.run(), /GLOBAL_AUDIT_MISMATCH/)
})
