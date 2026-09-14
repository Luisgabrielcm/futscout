import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { clubIdentityFixture, addIdentitySnapshot, identityNow } from "../../fixtures/clubIdentity"
import { clubIdentityHash } from "../../../services/clubPlayerIdentityPipeline"
import { runMultiClubIdentityPipeline, requireSameMultiClubDryRun, simulateMultiClubIdentityPlan,
  type MultiClubIdentityOptions } from "../../../services/multiClubIdentityPipeline"
import { parseMultiClubIdentityArgs, runMultiClubIdentityReadOnly } from "../../../services/multiClubIdentityReadRepository"
import type { PrismaClient } from "../../../app/generated/prisma/client"

function fixture(count = 5, size = 4) {
  const clubs = Array.from({ length: count }, (_, index) => {
    const f = clubIdentityFixture(100 + index, `synthetic-${index}`, size)
    f.players.forEach((p, i) => { p.id = `club-${index}-local-${i}`; p.slug = `club-${index}-person-${i}` })
    f.roster.forEach((p, i) => { p.player.id = 10000 + index * 100 + i })
    return f
  })
  const loaded: string[] = [], audited: string[] = []
  const missing = new Set<string>(), auditFailures = new Set<string>()
  const options: MultiClubIdentityOptions = { clubs: clubs.map(c => c.config), mode: "DRY_RUN" }
  const deps = {
    load: async (config: typeof clubs[number]["config"]) => {
      loaded.push(config.clubSlug)
      if (missing.has(config.clubSlug)) return { status: "NEEDS_FRESH_ROSTER" as const, reason: "ABSENT" }
      return { status: "READY" as const, evidence: clubs.find(c => c.config.clubId === config.clubId)!.evidence }
    },
    audit: async (config: typeof clubs[number]["config"]) => { audited.push(config.clubSlug); return !auditFailures.has(config.clubSlug) },
  }
  const run = () => runMultiClubIdentityPipeline(options, deps, identityNow)
  return { clubs, loaded, audited, options, deps, missing, auditFailures, run }
}

for (const size of [1, 2, 5]) test(`${size} clubs preserve isolated summaries, order and zero writes`, async () => {
  const f = fixture(size), result = await f.run()
  assert.equal(result.stopped, false); assert.equal(result.clubs.length, size)
  assert.equal(result.selectedCount, size * 4); assert.equal(result.writes, 0); assert.equal(result.apiCalls, 0)
  assert.deepEqual(f.loaded, f.clubs.map(c => c.config.clubSlug)); assert.deepEqual(f.audited, f.loaded)
  for (const [i, plan] of result.clubs.entries()) {
    assert.equal(plan.summary.clubId, f.clubs[i].config.clubId)
    assert.ok(plan.summary.orderedAutoMatchCandidates.every(p => p.playerId.startsWith(`club-${i}-`)))
    assert.equal(plan.summary.writeEnabled, false)
  }
})
test("six clubs rejected before load, never silently truncated", async () => {
  const f = fixture(6); await assert.rejects(f.run(), /CLUB_LIMIT_EXCEEDED/); assert.deepEqual(f.loaded, [])
})
test("duplicate clubs rejected independently by local ID, slug and provider team", async () => {
  for (const key of ["clubId", "clubSlug", "apiFootballTeamId"] as const) {
    const f = fixture(2)
    Object.assign(f.options.clubs[1], { [key]: f.options.clubs[0][key] })
    await assert.rejects(f.run(), /DUPLICATE_CLUB/); assert.equal(f.loaded.length, 0)
  }
})
test("invalid hard limits and AUTO_WRITE fail before any evidence load", async () => {
  for (const [key, value] of [["maxClubs", 6], ["maxAutoWritesPerClub", 6], ["maxAutoWritesGlobal", 21],
    ["maxClubs", 0], ["maxAutoWritesGlobal", 1.5], ["mode", "AUTO_WRITE"]] as const) {
    const f = fixture(1); Object.assign(f.options, { [key]: value })
    await assert.rejects(f.run(), /INVALID_MULTI_CLUB_LIMIT|MULTI_CLUB_WRITE_DISABLED/); assert.equal(f.loaded.length, 0)
  }
})
test("club two without cache is skipped; no matcher evidence needed and club three runs", async () => {
  const f = fixture(3); f.missing.add("synthetic-1")
  const r = await f.run()
  assert.equal(r.clubs[1].status, "NEEDS_FRESH_ROSTER"); assert.equal(r.clubs[1].report, null)
  assert.equal(r.clubs[1].summary.counts, null); assert.equal(r.clubs[1].summary.reviewStaleClub, null)
  assert.equal(r.clubs[2].status, "READY")
  assert.equal(r.selectedCount, 8); assert.equal(r.stopped, false)
})
test("club three structural conflict stops globally before clubs four/five", async () => {
  const f = fixture(); f.clubs[2].players[0].attempt = { status: "matched", lastApiFootballId: 5, nextRetryAt: null }
  const r = await f.run()
  assert.equal(r.stopReason, "STRUCTURAL_CONFLICT"); assert.equal(f.loaded.length, 3)
  assert.deepEqual(r.notExecutedClubs, ["synthetic-3", "synthetic-4"])
})
test("club four audit mismatch stops before club five and preserves earlier reports", async () => {
  const f = fixture(); f.auditFailures.add("synthetic-3")
  const r = await f.run(); assert.equal(r.stopReason, "AUDIT_MISMATCH"); assert.equal(f.loaded.length, 4)
  assert.equal(r.clubs[0].summary.candidateCount, 4); assert.equal(r.clubs[3].summary.candidateCount, 0)
})
test("25 selected candidates exceed global 20 without truncation or simulation", async () => {
  const r = await fixture(5, 5).run()
  assert.equal(r.selectedCount, 25); assert.equal(r.stopReason, "GLOBAL_AUTO_WRITE_LIMIT_EXCEEDED")
  assert.throws(() => simulateMultiClubIdentityPlan(r), /BATCH_NOT_SIMULATABLE/)
})
test("more than five AUTO_MATCH rows rank snapshot first and explicitly defer rest", async () => {
  const f = fixture(1, 7)
  f.clubs[0].roster.reverse(); addIdentitySnapshot(f.clubs[0]); f.clubs[0].roster.reverse()
  const r = await f.run()
  assert.equal(r.clubs[0].report!.counts.AUTO_MATCH, 7); assert.equal(r.selectedCount, 5)
  assert.equal(r.clubs[0].deferred.length, 2)
  assert.deepEqual(r.clubs[0].summary.orderedAutoMatchCandidates.map(p => p.providerId), [10006, 10000, 10001, 10002, 10003])
})
test("batch hash is deterministic, independent of dry-run generation timestamp", async () => {
  const f = fixture(2), before = await f.run()
  const after = await runMultiClubIdentityPipeline(f.options, f.deps, new Date(identityNow.getTime() + 1000))
  requireSameMultiClubDryRun(before, after); assert.equal(before.batchHash, after.batchHash)
})
for (const mutation of ["clubOrder", "candidate", "updatedAt", "cache", "snapshot", "limit"] as const) {
  test(`${mutation} changes batch hash and fails comparison`, async () => {
    const f = fixture(2), before = await f.run()
    if (mutation === "clubOrder") f.options.clubs.reverse()
    if (mutation === "candidate") f.clubs[0].players[0].slug += "-changed"
    if (mutation === "updatedAt") f.clubs[0].players[0].updatedAt = new Date("2026-09-10T01:00:00Z")
    if (mutation === "cache") { f.clubs[0].config.cache.expectedRowHash = "new"; f.clubs[0].evidence.cacheRowHash = "new" }
    if (mutation === "snapshot") addIdentitySnapshot(f.clubs[0])
    if (mutation === "limit") f.options.maxAutoWritesGlobal = 19
    const after = await f.run(); assert.throws(() => requireSameMultiClubDryRun(before, after), /BATCH_DRY_RUN_CHANGED/)
  })
}
test("pinned cache changing or invalid snapshot stops later clubs", async () => {
  const f = fixture(3); f.clubs[1].evidence.cacheRowHash = "changed"
  const r = await f.run(); assert.equal(r.stopReason, "CACHE_HASH_CHANGED"); assert.equal(f.loaded.length, 2)
  const g = fixture(3); addIdentitySnapshot(g.clubs[1]); g.clubs[1].evidence.snapshot!.contentHash = "bad"
  const s = await g.run(); assert.equal(s.stopReason, "INVALID_SNAPSHOT"); assert.equal(g.loaded.length, 2)
})
test("generic dependency errors are sanitized and stop, never skipped", async () => {
  const f = fixture(2); f.deps.load = async () => { throw new Error("secret connection details") }
  const r = await f.run(); assert.equal(r.stopReason, "EVIDENCE_READ_OR_VALIDATION_FAILED")
  assert.ok(!JSON.stringify(r).includes("secret"))
})
test("cross-club provider claims stop even if both local reports individually match", async () => {
  const f = fixture(2); f.clubs[1].roster[0].player.id = f.clubs[0].roster[0].player.id
  assert.equal((await f.run()).stopReason, "CROSS_CLUB_CLAIM")
})
test("five-club fake simulation preserves club/player order, audits and replay determinism", async () => {
  const r = await fixture().run(), sim = simulateMultiClubIdentityPlan(r)
  assert.equal(sim.committed.length, 20); assert.equal(sim.realWrites, 0); assert.equal(sim.retries, 0)
  assert.equal(sim.events.filter(e => e.event === "CLUB_AUDIT").length, 5)
  assert.deepEqual(sim.committed, r.envelope.clubs.flatMap(c => c.orderedAutoMatchCandidates.map(p => p.playerId)))
  assert.deepEqual(simulateMultiClubIdentityPlan(r), sim)
})
test("partial success simulation preserves two clubs and first player of third, stops rest", async () => {
  const r = await fixture().run(), c = r.envelope.clubs[2]
  const sim = simulateMultiClubIdentityPlan(r, { clubId: c.clubId, playerId: c.orderedAutoMatchCandidates[1].playerId, outcome: "FAILURE" })
  assert.equal(sim.committed.length, 9); assert.equal(sim.stopped, true); assert.equal(sim.retries, 0)
  assert.ok(sim.events.every(e => ![r.envelope.clubs[3].clubId, r.envelope.clubs[4].clubId].includes(e.clubId)))
})
test("indeterminate commit simulation is not counted as committed and stops globally", async () => {
  const r = await fixture().run(), c = r.envelope.clubs[2], id = c.orderedAutoMatchCandidates[1].playerId
  const sim = simulateMultiClubIdentityPlan(r, { clubId: c.clubId, playerId: id, outcome: "INDETERMINATE_COMMIT" })
  assert.equal(sim.committed.length, 9); assert.deepEqual(sim.indeterminate, [id]); assert.equal(sim.stopped, true)
  assert.equal(sim.events.at(-1)!.event, "INDETERMINATE_COMMIT")
})
test("post-commit audit failure simulation preserves known commit but never proceeds", async () => {
  const r = await fixture().run(), c = r.envelope.clubs[2]
  const sim = simulateMultiClubIdentityPlan(r, { clubId: c.clubId, playerId: c.orderedAutoMatchCandidates[1].playerId, outcome: "AUDIT_MISMATCH" })
  assert.equal(sim.committed.length, 10); assert.equal(sim.stopped, true); assert.equal(sim.realWrites, 0)
})
test("selected player becoming ineligible invalidates old plan, never silently refills it", async () => {
  const f = fixture(1, 6), old = await f.run()
  f.clubs[0].players[0].attempt = { status: "review", lastApiFootballId: null, nextRetryAt: null }
  const fresh = await f.run()
  assert.throws(() => requireSameMultiClubDryRun(old, fresh), /BATCH_DRY_RUN_CHANGED/)
  assert.equal(old.clubs[0].summary.orderedAutoMatchCandidates[0].playerId, "club-0-local-0")
})
test("already associated identities become NO-OP on fresh dry-run", async () => {
  const f = fixture(2)
  f.clubs.forEach(c => c.players.forEach((p, i) => { p.apiFootballId = c.roster[i].player.id; p.attempt = { status: "matched", lastApiFootballId: p.apiFootballId, nextRetryAt: null } }))
  const r = await f.run(); assert.equal(r.selectedCount, 0)
  assert.ok(r.clubs.every(c => c.report!.counts.ALREADY_MATCHED === 4))
})
test("simulation independently rejects over-budget envelope and tampered hash", async () => {
  const r = await fixture(1).run(); r.envelope.maxAutoWritesPerClub = 3; r.batchHash = clubIdentityHash(r.envelope)
  assert.throws(() => simulateMultiClubIdentityPlan(r), /SIMULATION_LIMIT_EXCEEDED/)
  r.batchHash = "bad"; assert.throws(() => simulateMultiClubIdentityPlan(r), /BATCH_NOT_SIMULATABLE/)
})
test("CLI rejects write, sixth club, duplicate, regression clubs and old season", () => {
  assert.deepEqual(parseMultiClubIdentityArgs(["--dry-run", "--clubs", "arsenal,chelsea", "--season", "2026"]), ["arsenal", "chelsea"])
  for (const args of [["--write", "--clubs", "arsenal", "--season", "2026"],
    ["--dry-run", "--clubs", "a,b,c,d,e,f", "--season", "2026"], ["--dry-run", "--clubs", "a,a", "--season", "2026"],
    ["--dry-run", "--clubs", "real-madrid", "--season", "2026"], ["--dry-run", "--clubs", "a", "--season", "2024"]]) {
    assert.throws(() => parseMultiClubIdentityArgs(args))
  }
})
test("database boundary rejects bad scope before opening transaction", async () => {
  const db = { $transaction: () => { assert.fail("must not connect") } } as unknown as PrismaClient
  await assert.rejects(runMultiClubIdentityReadOnly(db, ["real-madrid"]), /INVALID_NEW_CLUB_BATCH/)
})
test("CLI source has no write dispatch/token and blocks HTTP; repository enforces READ ONLY", () => {
  const cli = readFileSync("scripts/runMultiClubPlayerIdentityPipeline.ts", "utf8")
  assert.match(cli, /globalThis.fetch = async/)
  assert.doesNotMatch(cli, /clubIdentityAutoWrite|clubIdentityWriteToken|loadWrite|executeClubIdentityAutoWrite/)
  const repo = readFileSync("services/multiClubIdentityReadRepository.ts", "utf8")
  assert.match(repo, /SET TRANSACTION READ ONLY/); assert.match(repo, /GLOBAL_AUDIT_MISMATCH/)
  assert.doesNotMatch(repo, /\.update\(|\.upsert\(|\.create\(|getApiFootballTeamPlayers/)
})
