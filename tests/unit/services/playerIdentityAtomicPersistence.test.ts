import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import * as coverage from "../../../services/playerIdentityCoverage"
import * as policyModule from "../../../services/barcelonaIdentityWritePolicy"
import * as atomic from "../../../services/playerIdentityAtomicPersistence"
import * as pilotModule from "../../../services/playerIdentityWritePilot"
import * as runnerModule from "../../../services/barcelonaIdentityWriteRunner"
import * as util from "node:util"
import type { OfficialLineup } from "../../../types/officialLineup"
import type { ApiFootballTeamPlayer } from "../../../services/getApiFootballTeamPlayers"

const { BARCELONA_WRITE_TARGETS: targets, BARCELONA_WRITE_EVIDENCE: pins } = policyModule
const now = new Date("2026-09-12T12:00:00Z")
type Player = policyModule.IdentityWriteEvidence["players"][number]
type Attempt = { id: string; playerId: string; status: string; lastApiFootballId: number; [key: string]: unknown }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")

// Real policy and orchestration source, real matcher. Only the snapshot decoder is a fake boundary:
// cryptographic snapshot parsing has its own tests; no production hash/payload is forged here.
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const compiledModule = { exports: {} }
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText
  runInNewContext(js, { module: compiledModule, exports: compiledModule.exports, Date, Error, Object, Array, Map, Set, Number, JSON,
    structuredClone, require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`UNMOCKED_IMPORT: ${name}`)
      return dependencies[name]
    } })
  return compiledModule.exports as T
}

function fixture() {
  const players: Player[] = targets.map((t, i) => ({ id: t.playerId, slug: `synthetic-person-${i}`, externalId: `synthetic-ea-${i}`, name: `Synthetic Person${i}`,
    apiFootballId: null, dateOfBirth: new Date(`200${i}-01-01T00:00:00Z`), nationality: "Spain", position: "MC",
    secondaryPositions: [], clubId: pins.clubId, club: { name: "FC Barcelona", apiFootballId: 529 },
    updatedAt: new Date("2026-09-10T00:00:00Z"), attempt: null }))
  const roster: ApiFootballTeamPlayer[] = players.map((p, i) => ({
    player: { id: targets[i].providerId, name: p.name, firstname: "Synthetic", lastname: `Person${i}`, age: 25,
      birth: { date: p.dateOfBirth!.toISOString().slice(0, 10), country: null, place: null }, nationality: "Spain",
      height: null, weight: null, injured: false, photo: null },
    statistics: [{ team: { id: 529, name: "Barcelona", logo: null }, league: {
      id: 140, name: "LaLiga", country: "Spain", logo: null, flag: null, season: 2026 }, games: { position: "Midfielder" } }],
  }))
  const lineup: OfficialLineup = { provider: "api-football", apiTeamId: 529, formation: "4-3-3",
    fetchedAt: "2026-09-11T20:00:00Z", fixture: { id: 100, date: "2026-09-10T19:00:00Z", status: "FT",
      home: { id: 529, name: "Barcelona" }, away: { id: 999, name: "Synthetic opposition" }, competition: { id: 140, name: "LaLiga" } },
    startXI: roster.map(r => ({ apiFootballId: r.player.id, name: r.player.name, position: "M", number: null, grid: null })), substitutes: [] }
  const evidence: policyModule.IdentityWriteEvidence = { players, cache: { id: pins.cacheId, apiTeamId: 529, season: 2026,
    playerCount: roster.length, players: roster, fetchedAt: new Date("2026-09-11T21:31:43.387Z"), expiresAt: new Date("2026-09-18T21:31:43.387Z") },
    cacheRowHash: pins.cacheRowHash, snapshot: { id: pins.snapshotId, clubId: pins.clubId, provider: "api-football", teamExternalId: 529,
      fixtureExternalId: 100, fixtureDate: new Date(lineup.fixture.date), formation: "4-3-3", revision: 1, payloadVersion: 1,
      payload: {}, contentHash: pins.snapshotHash, fetchedAt: new Date(lineup.fetchedAt) } }
  const policy = load<typeof policyModule>("services/barcelonaIdentityWritePolicy.ts", {
    "../lib/officialLineupSnapshot": { decodeLineupSnapshot: () => lineup }, "./playerIdentityCoverage": coverage,
  })
  const pilot = load<typeof pilotModule>("services/playerIdentityWritePilot.ts", {
    "node:util": util, "node:crypto": { createHash }, "./barcelonaIdentityWritePolicy": policy, "./playerIdentityAtomicPersistence": atomic,
  })
  const prepared = targets.map(t => policy.prepareBarcelonaIdentityMatch(evidence, t.playerId, now))
  return { evidence, policy, pilot, prepared, lineup }
}

class FakeDatabase {
  state: { players: Player[]; attempts: Attempt[] }
  version = 0
  transactions = 0
  events: string[] = []
  failAttemptFor = ""
  zeroUpdate = false
  updateError = ""
  commitError = ""
  cacheHash: string = pins.cacheRowHash
  snapshotHash: string = pins.snapshotHash
  afterOwnerRead?: () => Promise<void>
  constructor(players: Player[]) { this.state = { players: structuredClone(players), attempts: [] } }
  // This double executes the REAL Prisma transaction callback against a copy-on-write state.
  // Optimistic version checking simulates Serializable abort, not real PostgreSQL locking.
  client() { return { $transaction: this.transaction.bind(this) } as unknown as PrismaClient }
  async transaction<T>(body: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) {
    assert.equal(options.isolationLevel, "Serializable")
    this.transactions++
    this.events.push("BEGIN")
    const start = this.version, draft = structuredClone(this.state)
    let dirty = false
    const tx = {
      player: {
        findUnique: async ({ where }: { where: { id?: string; apiFootballId?: number } }) => {
          const p = draft.players.find(p => where.id ? p.id === where.id : p.apiFootballId === where.apiFootballId)
          if (!where.id) { this.events.push("owner"); await this.afterOwnerRead?.(); return p ? { id: p.id } : null }
          this.events.push("player")
          if (!p) return null
          const { attempt: _attempt, ...fields } = p
          void _attempt
          return fields
        },
        updateMany: async ({ where, data }: { where: { id: string; apiFootballId: null; clubId: string; updatedAt: Date }; data: { apiFootballId: number } }) => {
          this.events.push("update")
          assert.equal(where.apiFootballId, null); assert.equal(Object.keys(data).join(), "apiFootballId")
          assert.equal(where.clubId, pins.clubId)
          if (this.updateError) throw { code: this.updateError }
          if (this.zeroUpdate) return { count: 0 }
          const p = draft.players.find(p => p.id === where.id && p.apiFootballId === null && p.clubId === where.clubId && p.updatedAt.getTime() === where.updatedAt.getTime())
          if (!p) return { count: 0 }
          if (draft.players.some(p => p.apiFootballId === data.apiFootballId)) throw { code: "P2002" }
          p.apiFootballId = data.apiFootballId; p.updatedAt = now; dirty = true
          return { count: 1 }
        },
      },
      apiFootballPlayerMatchAttempt: {
        findUnique: async ({ where }: { where: { playerId: string } }) => { this.events.push("attempt-read"); return draft.attempts.find(a => a.playerId === where.playerId) ?? null },
        create: async ({ data }: { data: Omit<Attempt, "id"> & { playerId: string } }) => {
          this.events.push("attempt-create")
          if (data.playerId === this.failAttemptFor) throw new Error("Synthetic attempt failure")
          if (draft.attempts.some(a => a.playerId === data.playerId)) throw { code: "P2002" }
          const a = { ...data, id: `attempt-${data.playerId}` } as Attempt
          draft.attempts.push(a); dirty = true; return a
        },
      },
      $queryRawUnsafe: async (sql: string, id: string) => {
        assert.ok(sql.startsWith("SELECT md5(to_jsonb(t)::text)")); assert.equal(id, pins.cacheId)
        return [{ hash: this.cacheHash, expiresAt: new Date("2026-09-18T21:31:43.387Z") }]
      },
      clubOfficialLineupSnapshot: { findUnique: async () => ({ contentHash: this.snapshotHash, clubId: pins.clubId, teamExternalId: 529 }) },
    }
    try {
      const value = await body(tx)
      if (this.commitError) throw { code: this.commitError }
      if (dirty && start !== this.version) throw { code: "P2034" }
      if (dirty) { this.state = draft; this.version++ }
      this.events.push("COMMIT")
      return value
    } catch (e) { this.events.push("ROLLBACK"); throw e }
  }
  audit(): pilotModule.IdentityWriteAudit {
    const players = this.state.players.map(p => {
      const { apiFootballId, updatedAt: _updatedAt, ...protectedFields } = p
      void _updatedAt
      return { id: p.id, apiFootballId, protectedHash: hash(protectedFields), hash: hash(p) }
    })
    const attempts = this.state.attempts.map(a => ({ id: a.id, playerId: a.playerId, hash: hash(a), data: structuredClone(a) }))
    const tables = Object.fromEntries(pilotModule.IDENTITY_AUDIT_TABLES.map(table => [table, { count: "0", hash: "protected" }])) as pilotModule.IdentityWriteAudit["tables"]
    tables.Player = { count: String(players.length), hash: hash(players) }
    tables.ApiFootballPlayerMatchAttempt = { count: String(attempts.length), hash: hash(attempts) }
    return { tables, players, attempts }
  }
}
function setup() {
  const f = fixture(), db = new FakeDatabase(f.evidence.players)
  const run = (i = 0) => atomic.persistPlayerApiFootballMatchAtomically(db.client(), f.prepared[i], () => now)
  const deps = { clock: () => now, audit: async () => db.audit(),
    loadEvidence: async () => ({ ...structuredClone(f.evidence), players: db.state.players.map(p => ({ ...p,
      attempt: db.state.attempts.find(a => a.playerId === p.id) ? { status: "matched", nextRetryAt: null } : null })) }),
    persist: (m: policyModule.PreparedIdentityMatch) => atomic.persistPlayerApiFootballMatchAtomically(db.client(), m, () => now) }
  const batch = () => f.pilot.runPreparedBarcelonaIdentityWrites(f.prepared, deps, f.pilot.identityWriteAuthorization(f.prepared))
  return { ...f, db, run, deps, batch }
}

test("atomic success: conditional Player update and matched attempt commit together with existing metadata", async () => {
  const f = setup(), r = await f.run()
  assert.equal(r.status, "MATCHED"); assert.equal(f.db.state.players[0].apiFootballId, targets[0].providerId)
  assert.equal(f.db.state.attempts.length, 1)
  assert.deepEqual(f.db.events, ["BEGIN", "player", "owner", "attempt-read", "update", "attempt-create", "COMMIT"])
  const a = f.db.state.attempts[0]
  assert.equal(a.status, "matched"); assert.equal(a.attempts, 1); assert.equal(a.nextRetryAt, null)
  assert.equal(a.lastConfidence, f.prepared[0].confidence); assert.equal(a.lastApiFootballId, targets[0].providerId)
})
test("attempt failure rolls back the Player update, without retry", async () => {
  const f = setup(), before = structuredClone(f.db.state); f.db.failAttemptFor = targets[0].playerId
  assert.equal((await f.run()).status, "ATTEMPT_FAILURE"); assert.deepEqual(f.db.state, before)
  assert.equal(f.db.transactions, 1); assert.equal(f.db.events.at(-1), "ROLLBACK")
})
test("different existing Player ID is a conflict with zero writes", async () => {
  const f = setup(); f.db.state.players[0].apiFootballId = 999
  assert.equal((await f.run()).status, "CONFLICT_PLAYER_ALREADY_HAS_OTHER_ID")
  assert.equal(f.db.state.players[0].apiFootballId, 999); assert.ok(!f.db.events.includes("update"))
})
test("same ID and coherent matched attempt are idempotent without incrementing attempts", async () => {
  const f = setup(); await f.run(); const before = structuredClone(f.db.state)
  assert.equal((await f.run()).status, "ALREADY_MATCHED_SAME_ID"); assert.deepEqual(f.db.state, before)
})
test("same ID without a coherent matched attempt is not silently repaired", async () => {
  const f = setup(); f.db.state.players[0].apiFootballId = targets[0].providerId
  assert.equal((await f.run()).status, "VALIDATION_FAILURE"); assert.equal(f.db.state.attempts.length, 0)
})
test("provider ID already owned elsewhere fails before update", async () => {
  const f = setup(); f.db.state.players[1].apiFootballId = targets[0].providerId
  assert.equal((await f.run()).status, "CONFLICT_PROVIDER_ID_TAKEN"); assert.ok(!f.db.events.includes("update"))
})
test("conditional count zero aborts the transaction and creates no attempt", async () => {
  const f = setup(); f.db.zeroUpdate = true
  assert.equal((await f.run()).status, "CONCURRENT_MODIFICATION"); assert.equal(f.db.state.attempts.length, 0)
  assert.equal(f.db.events.at(-1), "ROLLBACK")
})
test("UNIQUE race at update is a conflict and rolls back", async () => {
  const f = setup(); f.db.updateError = "P2002"
  assert.equal((await f.run()).status, "CONFLICT_PROVIDER_ID_TAKEN"); assert.equal(f.db.state.players[0].apiFootballId, null)
})
test("two overlapping attempts for the same approved identity: one commits, one serializable aborts", async () => {
  const f = setup(); let arrivals = 0, release!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  f.db.afterOwnerRead = async () => { if (++arrivals === 2) release(); await barrier }
  const results = await Promise.all([f.run(), f.run()])
  assert.deepEqual(results.map(r => r.status).sort(), ["CONCURRENT_MODIFICATION", "MATCHED"])
  assert.equal(f.db.state.attempts.length, 1); assert.equal(f.db.transactions, 2)
})
test("a second local player cannot claim the same provider ID even before opening a transaction", async () => {
  const f = setup(); f.prepared[1].providerId = targets[0].providerId
  assert.equal((await f.run(1)).status, "VALIDATION_FAILURE"); assert.equal(f.db.transactions, 0)
})
test("competing process assigns this provider to a DIFFERENT player after SELECT: only its commit survives", async () => {
  const f = setup()
  f.db.afterOwnerRead = async () => {
    // Simulated independent writer commits while our snapshot still sees the ID as free.
    f.db.state.players[1].apiFootballId = targets[0].providerId
    f.db.state.attempts.push({ id: "other-process", playerId: targets[1].playerId, status: "matched", lastApiFootballId: targets[0].providerId })
    f.db.version++
  }
  assert.equal((await f.run()).status, "CONCURRENT_MODIFICATION")
  assert.equal(f.db.state.players.filter(p => p.apiFootballId === targets[0].providerId).length, 1)
  assert.equal(f.db.state.players[0].apiFootballId, null)
  assert.equal(f.db.state.attempts.length, 1); assert.equal(f.db.state.attempts[0].id, "other-process")
})
test("unexpected preexisting attempt fails safe even if retry is due", async () => {
  const f = setup(); f.db.state.attempts.push({ id: "old", playerId: targets[0].playerId, status: "weak", lastApiFootballId: 99 })
  assert.equal((await f.run()).status, "VALIDATION_FAILURE"); assert.ok(!f.db.events.includes("update"))
})
test("identity or optimistic version drift rejects the stale plan", async () => {
  const f = setup(); f.db.state.players[0].name = "Changed identity"
  assert.equal((await f.run()).status, "VALIDATION_FAILURE")
  const g = setup(); g.db.state.players[0].updatedAt = now
  assert.equal((await g.run()).status, "CONCURRENT_MODIFICATION")
})
for (const kind of ["cache", "snapshot"] as const) test(`transaction rechecks ${kind} pin after preflight`, async () => {
  const f = setup(); if (kind === "cache") f.db.cacheHash = "changed"; else f.db.snapshotHash = "changed"
  assert.equal((await f.run()).status, "VALIDATION_FAILURE"); assert.ok(!f.db.events.includes("update"))
})
test("expiration while waiting inside the transaction cannot renew authorization", async () => {
  const f = setup(); let calls = 0
  const r = await atomic.persistPlayerApiFootballMatchAtomically(f.db.client(), f.prepared[0], () => ++calls === 1 ? now : f.prepared[0].cacheExpiresAt)
  assert.equal(r.status, "VALIDATION_FAILURE"); assert.ok(!f.db.events.includes("update"))
})
test("serializable conflict at commit rolls back both records and never retries", async () => {
  const f = setup(); f.db.commitError = "P2034"
  assert.equal((await f.run()).status, "CONCURRENT_MODIFICATION")
  assert.equal(f.db.state.attempts.length, 0); assert.equal(f.db.state.players[0].apiFootballId, null); assert.equal(f.db.transactions, 1)
})
test("unknown commit acknowledgement is reported indeterminate, never assumed rolled back", async () => {
  const f = setup(); f.db.commitError = "ECONNRESET"
  assert.equal((await f.run()).status, "INDETERMINATE_COMMIT"); assert.equal(f.db.transactions, 1)
})
test("cache expiry after attempt create rolls back both records", async () => {
  const f = setup(); let calls = 0
  const r = await atomic.persistPlayerApiFootballMatchAtomically(f.db.client(), f.prepared[0], () => ++calls < 4 ? now : f.prepared[0].cacheExpiresAt)
  assert.equal(r.status, "VALIDATION_FAILURE"); assert.equal(f.db.state.players[0].apiFootballId, null)
  assert.equal(f.db.state.attempts.length, 0); assert.equal(f.db.events.at(-1), "ROLLBACK")
})
test("caller cannot extend cache expiration independently of the actual cache row", async () => {
  const f = setup(); f.prepared[0].cacheExpiresAt = new Date("2027-01-01")
  assert.equal((await f.run()).status, "VALIDATION_FAILURE"); assert.ok(!f.db.events.includes("update"))
})
test("a fabricated decision, unsafe score or margin cannot open an atomic transaction", async () => {
  for (const change of [{ decision: "REVIEW" }, { margin: 9 }, { nameScore: 79 }, { confidence: 101 }, { birthMatches: false }]) {
    const f = setup(); Object.assign(f.prepared[0], change)
    assert.equal((await f.run()).status, "VALIDATION_FAILURE"); assert.equal(f.db.transactions, 0)
  }
})

const invalidEvidence: [string, (f: ReturnType<typeof setup>) => void][] = [
  ["expired cache", f => { f.evidence.cache!.expiresAt = now }],
  ["changed cache hash", f => { f.evidence.cacheRowHash = "changed" }],
  ["changed snapshot hash", f => { f.evidence.snapshot!.contentHash = "changed" }],
  ["non-AUTO_MATCH", f => { f.db.state.players[0].dateOfBirth = null }],
  ["provider ID changed in roster", f => { (f.evidence.cache!.players as ApiFootballTeamPlayer[])[0].player.id = 999 }],
]
for (const [label, change] of invalidEvidence) test(`${label} stops before any transaction`, async () => {
  const f = setup(); change(f)
  const r = await f.batch()
  assert.equal(r.stopped, true); assert.equal(r.results[0].status, "VALIDATION_FAILURE"); assert.equal(f.db.transactions, 0)
})
test("five fake writes succeed; newly reviewed versions allow five idempotent results without duplicate attempts", async () => {
  const f = setup()
  const first = await f.batch()
  assert.equal(first.stopped, false); assert.equal(first.auditFailure, false)
  assert.equal(first.results.filter(r => r.status === "MATCHED").length, 5)
  const before = structuredClone(f.db.state)
  const stale = await f.batch()
  assert.equal(stale.results[0].status, "AUTHORIZATION_MISMATCH")
  assert.equal(f.db.transactions, 5)
  // The writes changed updatedAt; a new explicit confirmation is required even for a no-op.
  for (const m of f.prepared) m.identity.updatedAt = f.db.state.players.find(p => p.id === m.identity.id)!.updatedAt
  const second = await f.batch()
  assert.equal(second.stopped, false); assert.equal(second.auditFailure, false)
  assert.equal(second.results.filter(r => r.status === "ALREADY_MATCHED_SAME_ID").length, 5)
  assert.deepEqual(f.db.state, before); assert.equal(f.db.state.attempts.length, 5)
})
test("third attempt failure preserves commits 1/2, rolls back 3 and never processes 4/5", async () => {
  const f = setup(); f.db.failAttemptFor = targets[2].playerId
  const r = await f.batch()
  assert.equal(r.stopped, true); assert.equal(r.auditFailure, false)
  assert.deepEqual([...r.results.map(r => r.status)], ["MATCHED", "MATCHED", "ATTEMPT_FAILURE"])
  assert.deepEqual([...r.untouchedPlayerIds], targets.slice(3).map(t => t.playerId)); assert.equal(f.db.transactions, 3)
  assert.equal(f.db.state.attempts.length, 2); assert.ok(f.db.state.players.slice(2).every(p => p.apiFootballId === null))
})
test("audit drift stops before the next player even after a successful commit", async () => {
  const f = setup(); let audits = 0
  f.deps.audit = async () => { const a = f.db.audit(); if (++audits > 1) a.tables.Club.hash = "changed"; return a }
  const r = await f.batch()
  assert.equal(r.auditFailure, true); assert.equal(r.stopped, true); assert.equal(f.db.transactions, 1)
})
test("audit rejects changed unrelated player, old attempt or unauthorized metadata", async () => {
  const f = setup(), before = f.db.audit(); const result = await f.run(), after = f.db.audit()
  f.pilot.assertIdentityWriteAudit(before, after, f.prepared, [result])
  const unrelated = structuredClone(after); unrelated.players[1].hash = "changed"
  assert.throws(() => f.pilot.assertIdentityWriteAudit(before, unrelated, f.prepared, [result]), /AUDIT_FAILED/)
  const metadata = structuredClone(after); metadata.attempts[0].data.lastConfidence = -1
  assert.throws(() => f.pilot.assertIdentityWriteAudit(before, metadata, f.prepared, [result]), /AUDIT_FAILED/)
  const old = structuredClone(after); old.attempts[0].hash = "changed"
  assert.throws(() => f.pilot.assertIdentityWriteAudit(after, old, f.prepared, []), /AUDIT_FAILED/)
})
test("explicit authorization is bound to the exact summary before any DB dependency", async () => {
  const f = setup(); let calls = 0; f.deps.audit = async () => { calls++; return f.db.audit() }
  const token = f.pilot.identityWriteAuthorization(f.prepared)
  await assert.rejects(f.pilot.runPreparedBarcelonaIdentityWrites(f.prepared, f.deps, ""), /AUTHORIZATION_MISMATCH/)
  f.prepared[0].confidence--
  await assert.rejects(f.pilot.runPreparedBarcelonaIdentityWrites(f.prepared, f.deps, token), /AUTHORIZATION_MISMATCH/)
  assert.equal(calls, 0); assert.equal(f.db.transactions, 0)
})
test("authorization v2 has exactly the ordered reviewed fields and deterministic UTF-8 SHA-256", () => {
  const { prepared } = fixture()
  const summary = pilotModule.identityPreWriteSummary(prepared)
  assert.equal(summary.authorizationSummaryVersion, 2)
  assert.deepEqual(Object.keys(summary.players[0]), ["playerId", "slug", "providerId", "confidence", "margin",
    "cacheRowHash", "snapshotHash", "expectedUpdatedAt"])
  assert.equal(summary.players[0].expectedUpdatedAt, "2026-09-10T00:00:00.000Z")
  assert.equal(pilotModule.identityWriteAuthorization(prepared), "AUTHORIZE_BARCELONA_IDENTITY_V2:" + hash(summary))
  assert.equal(pilotModule.identityWriteAuthorization(prepared), pilotModule.identityWriteAuthorization(structuredClone(prepared)))
  const reorderedProperties = prepared.map(m => ({ ...m, identity: Object.fromEntries(Object.entries(m.identity).reverse()) as typeof m.identity }))
  assert.equal(pilotModule.identityWriteAuthorization(prepared), pilotModule.identityWriteAuthorization(reorderedProperties))
})

const authorizationChanges: [string, (matches: policyModule.PreparedIdentityMatch[]) => void][] = [
  ["slug", m => { m[0].identity.slug += "-changed" }],
  ["updatedAt +1ms", m => { m[0].identity.updatedAt = new Date(m[0].identity.updatedAt.getTime() + 1) }],
  ["providerId", m => { m[0].providerId++ }],
  ["confidence", m => { m[0].confidence-- }],
  ["margin", m => { m[0].margin-- }],
  ["cache hash", m => { m[0].cacheRowHash += "changed" }],
  ["snapshot hash", m => { m[0].snapshotHash += "changed" }],
  ["player order", m => { m.reverse() }],
  ["playerId", m => { m[0].identity.id += "changed" }],
]
for (const [label, change] of authorizationChanges) test(`authorization changes with ${label} and rejects before any dependency`, async () => {
  const f = setup(), token = f.pilot.identityWriteAuthorization(f.prepared)
  change(f.prepared)
  assert.notEqual(f.pilot.identityWriteAuthorization(f.prepared), token)
  let calls = 0
  const loadEvidence = f.deps.loadEvidence
  f.deps.audit = async () => { calls++; return f.db.audit() }
  f.deps.loadEvidence = async () => { calls++; return loadEvidence() }
  await assert.rejects(f.pilot.runPreparedBarcelonaIdentityWrites(f.prepared, f.deps, token), /AUTHORIZATION_MISMATCH/)
  assert.equal(calls, 0); assert.equal(f.db.transactions, 0)
})

test("equivalent timezone offsets serialize to identical UTC authorization", () => {
  const { prepared } = fixture(), equivalent = structuredClone(prepared)
  equivalent[0].identity.updatedAt = new Date("2026-09-09T20:00:00.000-04:00")
  assert.equal(pilotModule.identityWriteAuthorization(prepared), pilotModule.identityWriteAuthorization(equivalent))
})

test("legacy authorization format has no fallback, even for the same reviewed evidence", async () => {
  const f = setup()
  const oldSummary = f.prepared.map(m => ({ player: m.identity.name, playerId: m.identity.id, providerId: m.providerId,
    decision: m.decision, confidence: m.confidence, margin: m.margin, cacheRowHash: m.cacheRowHash,
    cacheExpiresAt: m.cacheExpiresAt.toISOString(), snapshotHash: m.snapshotHash }))
  let audits = 0; f.deps.audit = async () => { audits++; return f.db.audit() }
  await assert.rejects(f.pilot.runPreparedBarcelonaIdentityWrites(f.prepared, f.deps,
    "AUTHORIZE_BARCELONA_IDENTITY:" + hash(oldSummary)), /AUTHORIZATION_MISMATCH/)
  assert.equal(audits, 0); assert.equal(f.db.transactions, 0)
})

test("correct v2 authorization reaches the pre-write boundary using a non-writing fake", async () => {
  const f = setup(), before = structuredClone(f.db.state), reached: string[] = []
  f.deps.persist = async m => {
    reached.push(m.identity.id)
    return { status: "VALIDATION_FAILURE", playerId: m.identity.id, providerId: m.providerId }
  }
  const result = await f.batch()
  assert.deepEqual(reached, [targets[0].playerId]); assert.equal(result.stopped, true)
  assert.equal(f.db.transactions, 0); assert.deepEqual(f.db.state, before)
})

for (const field of ["slug", "updatedAt"] as const) test(`refreshed ${field} drift aborts with AUTHORIZATION_MISMATCH before the write transaction`, async () => {
  const f = setup()
  if (field === "slug") f.db.state.players[0].slug += "-changed"
  else f.db.state.players[0].updatedAt = new Date(f.db.state.players[0].updatedAt.getTime() + 1)
  const before = structuredClone(f.db.state), result = await f.batch()
  assert.equal(result.results[0].status, "AUTHORIZATION_MISMATCH")
  assert.equal(result.stopped, true); assert.equal(result.auditFailure, false)
  assert.equal(result.results.length, 1); assert.equal(f.db.transactions, 0)
  assert.deepEqual(f.db.state, before)
})

test("real snapshot decoder rejects forged payload even with the expected declared content hash", () => {
  const f = setup()
  assert.throws(() => policyModule.requireCurrentBarcelonaEvidence(f.evidence, now), /INVALID_SNAPSHOT/)
})
test("Prisma dependency factory is lazy, and read paths explicitly use read-only transactions", async () => {
  const f = fixture(), calls: string[] = []
  const client = { $transaction: async (body: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "RepeatableRead")
    let readonly = false
    const tx = {
      $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); readonly = true; calls.push("READ ONLY") },
      $queryRawUnsafe: async (sql: string, id?: string) => { assert.ok(readonly); calls.push("SELECT"); assert.match(sql, /^SELECT/)
        if (id) { assert.equal(id, pins.cacheId); return [{ hash: pins.cacheRowHash }] }
        if (sql.includes("count(*)")) return [{ count: "0", hash: "empty" }]
        return []
      },
      apiFootballTeamRosterCache: { findUnique: async () => { assert.ok(readonly); return f.evidence.cache } },
      clubOfficialLineupSnapshot: { findUnique: async () => { assert.ok(readonly); return f.evidence.snapshot } },
      player: { findMany: async () => { assert.ok(readonly); return f.evidence.players.map(p => ({ ...p, apiFootballMatchAttempt: null })) } },
    }
    return body(tx)
  } } as unknown as PrismaClient
  const deps = pilotModule.createPrismaIdentityWriteDependencies(client, () => now)
  assert.deepEqual(calls, [])
  const evidence = await deps.loadEvidence()
  assert.equal(evidence.cacheRowHash, pins.cacheRowHash); assert.equal(evidence.players.length, 5)
  const audit = await deps.audit()
  assert.equal(Object.keys(audit.tables).length, 9); assert.equal(calls.filter(c => c === "READ ONLY").length, 2)
})
test("runner rejects unconfirmed write and missing/extra/reordered/non-allowlisted IDs without env or DB", () => {
  const args = ["--dry-run", "--season", "2026", "--player-ids", targets.map(t => t.playerId).join(",")]
  policyModule.guardBarcelonaIdentityRunnerArgs(args)
  for (const ids of [targets.slice(1).map(t => t.playerId), [...targets.map(t => t.playerId), "sixth"],
    ["cmt9an38y000m2kucc9izxn4h", ...targets.slice(1).map(t => t.playerId)],
    ["city", ...targets.slice(1).map(t => t.playerId)], ["real", ...targets.slice(1).map(t => t.playerId)],
    [...targets].reverse().map(t => t.playerId)]) {
    assert.throws(() => policyModule.guardBarcelonaIdentityRunnerArgs([...args.slice(0, 4), ids.join(",")]))
  }
  assert.throws(() => policyModule.guardBarcelonaIdentityRunnerArgs(["--write", ...args.slice(1)]), /EXPLICIT_V2_CONFIRMATION_REQUIRED/)
  const source = readFileSync("scripts/runBarcelonaPlayerIdentityPilot.ts", "utf8")
  assert.ok(source.indexOf("dispatchBarcelonaIdentityRunner(process.argv") < source.indexOf('import("dotenv/config")'))
  assert.match(source, /loadWriteFlow: async/)
  assert.doesNotMatch(source, /\.(?:create|update|upsert|delete|updateMany|deleteMany)\s*\(/)
})
function runnerSetup() {
  const f = setup()
  const approvedSlugs = ["pau-cubarsi", "andreas-christensen", "wojciech-szczesny", "gerard-martin", "gavi"]
  for (let i = 0; i < 5; i++) { f.evidence.players[i].slug = approvedSlugs[i]; f.db.state.players[i].slug = approvedSlugs[i] }
  const roster = f.evidence.cache!.players as ApiFootballTeamPlayer[]
  for (let i = 0; i < 22; i++) {
    const extra = structuredClone(roster[0])
    extra.player.id = 900000 + i; extra.player.name = `Unrelated Reserve${i}`
    extra.player.firstname = "Unrelated"; extra.player.lastname = `Reserve${i}`; extra.player.birth.date = "1990-05-05"
    roster.push(extra)
  }
  f.evidence.cache!.playerCount = 27
  f.evidence.snapshot!.fixtureExternalId = 1635628; f.lineup.fixture.id = 1635628
  const runner = load<typeof runnerModule>("services/barcelonaIdentityWriteRunner.ts", {
    "node:util": util, "./barcelonaIdentityWritePolicy": f.policy, "./playerIdentityCoverage": coverage,
    "./playerIdentityWritePilot": f.pilot,
  })
  const prepared = targets.map(t => f.policy.prepareBarcelonaIdentityMatch(f.evidence, t.playerId, now))
  const token = f.pilot.identityWriteAuthorization(prepared), reports: unknown[] = []
  const execute = (confirmation = token) => runner.executeBarcelonaIdentityWrite(confirmation, f.deps, r => reports.push(r))
  return { ...f, runner, token, reports, execute }
}

const writeArgs = (token: string) => ["--write", "--season", "2026", "--player-ids", targets.map(t => t.playerId).join(","), "--confirmation", token]
const syntaxToken = "AUTHORIZE_BARCELONA_IDENTITY_V2:" + "a".repeat(64)

for (const [label, args, branch, status] of [
  ["missing confirmation", writeArgs(syntaxToken).slice(0, 5), "beta-next", ""],
  ["old token", writeArgs("AUTHORIZE_BARCELONA_IDENTITY:" + "a".repeat(64)), "beta-next", ""],
  ["master", writeArgs(syntaxToken), "master", ""],
  ["another branch", writeArgs(syntaxToken), "feature", ""],
  ["dirty tracked file", writeArgs(syntaxToken), "beta-next", " M service.ts"],
  ["untracked file", writeArgs(syntaxToken), "beta-next", "?? temporary.ts"],
  ["sixth player", [...writeArgs(syntaxToken).slice(0, 4), targets.map(t => t.playerId).join(",") + ",sixth", "--confirmation", syntaxToken], "beta-next", ""],
  ["reordered players", [...writeArgs(syntaxToken).slice(0, 4), [...targets].reverse().map(t => t.playerId).join(","), "--confirmation", syntaxToken], "beta-next", ""],
  ["Joan Garcia", [...writeArgs(syntaxToken).slice(0, 4), ["cmt9an38y000m2kucc9izxn4h", ...targets.slice(1).map(t => t.playerId)].join(","), "--confirmation", syntaxToken], "beta-next", ""],
] as const) test(`write dispatch blocks ${label} before loading flow/env/DB`, async () => {
  let loads = 0, dryRuns = 0
  await assert.rejects(policyModule.dispatchBarcelonaIdentityRunner([...args], {
    git: command => command === "branch" ? branch : command === "status" ? status : "fake-head",
    blockHttp: () => {}, runDryRun: async () => { dryRuns++ },
    loadWriteFlow: async () => { loads++; return async () => {} },
  }))
  assert.equal(loads, 0); assert.equal(dryRuns, 0)
})

test("valid dispatch blocks HTTP before loading write flow; dry-run never loads write flow", async () => {
  const events: string[] = []
  const runtime = { git: (c: string) => c === "branch" ? "beta-next" : c === "status" ? "" : "fake-head",
    blockHttp: () => { events.push("HTTP_BLOCKED") }, runDryRun: async () => { events.push("DRY_RUN") },
    loadWriteFlow: async () => { events.push("LOAD_WRITE"); return async () => { events.push("WRITE_FAKE") } } }
  await policyModule.dispatchBarcelonaIdentityRunner(writeArgs(syntaxToken), runtime)
  assert.deepEqual(events, ["HTTP_BLOCKED", "LOAD_WRITE", "WRITE_FAKE"])
  events.length = 0
  await policyModule.dispatchBarcelonaIdentityRunner(["--dry-run", ...writeArgs(syntaxToken).slice(1, 5)], runtime)
  assert.deepEqual(events, ["HTTP_BLOCKED", "DRY_RUN"])
})

const runnerFailures: [string, (f: ReturnType<typeof runnerSetup>) => void][] = [
  ["cache expired", f => { f.evidence.cache!.expiresAt = now }],
  ["cache hash changed", f => { f.evidence.cacheRowHash = "changed" }],
  ["cache missing", f => { f.evidence.cache = null }],
  ["cache wrong count", f => { f.evidence.cache!.playerCount = 26 }],
  ["snapshot hash changed", f => { f.evidence.snapshot!.contentHash = "changed" }],
  ["snapshot fixture changed", f => { f.evidence.snapshot!.fixtureExternalId = 9 }],
  ["snapshot version changed", f => { f.evidence.snapshot!.payloadVersion = 2 }],
  ["updatedAt changed", f => { f.db.state.players[0].updatedAt = new Date(f.db.state.players[0].updatedAt.getTime() + 1) }],
  ["slug changed", f => { f.db.state.players[0].slug += "-changed" }],
  ["provider occupied", f => { f.db.state.players[1].apiFootballId = targets[0].providerId }],
  ["matcher REVIEW", f => { f.db.state.players[0].dateOfBirth = null }],
  ["matcher CONFLICT", f => { f.db.state.players[0].apiFootballId = targets[1].providerId }],
]
for (const [label, change] of runnerFailures) test(`write runner blocks ${label} with zero fake write transactions`, async () => {
  const f = runnerSetup(); change(f)
  const before = structuredClone(f.db.state)
  await assert.rejects(f.execute())
  assert.equal(f.db.transactions, 0); assert.deepEqual(f.db.state, before)
})

test("wrong well-formed confirmation prints the summary then blocks before persistence", async () => {
  const f = runnerSetup()
  await assert.rejects(f.execute(syntaxToken), /AUTHORIZATION_MISMATCH/)
  assert.equal((f.reports[0] as { phase: string }).phase, "PRE_WRITE_SUMMARY")
  assert.equal(f.db.transactions, 0)
})

test("runner fake success: five sequential atomic matches and before/after reports", async () => {
  const f = runnerSetup(), result = await f.execute()
  assert.deepEqual([...result.results.map(r => r.status)], Array(5).fill("MATCHED"))
  assert.equal(result.stopped, false); assert.equal(result.auditFailure, false)
  assert.equal(f.db.transactions, 5); assert.equal(f.db.state.attempts.length, 5)
  const phases = f.reports.map(r => (r as { phase: string }).phase)
  assert.deepEqual(phases, ["PRE_WRITE_SUMMARY", "BEFORE", ...Array(5).fill("AFTER")])
})

test("runner fake failure at player three preserves 1/2, rolls back 3, never writes 4/5", async () => {
  const f = runnerSetup(); f.db.failAttemptFor = targets[2].playerId
  const result = await f.execute()
  assert.deepEqual([...result.results.map(r => r.status)], ["MATCHED", "MATCHED", "ATTEMPT_FAILURE"])
  assert.equal(result.stopped, true); assert.equal(f.db.transactions, 3); assert.equal(f.db.state.attempts.length, 2)
  assert.ok(f.db.state.players.slice(2).every(p => p.apiFootballId === null))
})

test("runner fake second execution requires current confirmation, returns five no-ops without transactions or attempts", async () => {
  const f = runnerSetup(); await f.execute(); const before = structuredClone(f.db.state)
  f.reports.length = 0
  await assert.rejects(f.execute(), /AUTHORIZATION_MISMATCH/)
  const currentToken = (f.reports[0] as { confirmation: string }).confirmation
  assert.notEqual(currentToken, f.token)
  const result = await f.execute(currentToken)
  assert.deepEqual([...result.results.map(r => r.status)], Array(5).fill("ALREADY_MATCHED_SAME_ID"))
  assert.deepEqual(f.db.state, before); assert.equal(f.db.transactions, 5); assert.equal(f.db.state.attempts.length, 5)
})

test("runner indeterminate commit stops immediately without retry or next player", async () => {
  const f = runnerSetup(); f.db.commitError = "ECONNRESET"
  const result = await f.execute()
  assert.equal(result.results[0].status, "INDETERMINATE_COMMIT"); assert.equal(result.stopped, true)
  assert.equal(result.results.length, 1); assert.equal(f.db.transactions, 1)
})

test("runner rechecks provider ownership immediately before the next transaction", async () => {
  const f = runnerSetup(), originalLoad = f.deps.loadEvidence; let reads = 0
  f.deps.loadEvidence = async () => {
    const evidence = await originalLoad()
    if (++reads > 1) evidence.players[1].apiFootballId = targets[0].providerId
    return evidence
  }
  const result = await f.execute()
  assert.equal(result.results[0].status, "CONFLICT_PROVIDER_ID_TAKEN")
  assert.equal(result.stopped, true); assert.equal(f.db.transactions, 0)
})

test("schema and checked-in migrations retain both required UNIQUE defenses", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  assert.match(schema.slice(schema.indexOf("model Player {")), /apiFootballId Int\? @unique/)
  assert.match(schema.slice(schema.indexOf("model ApiFootballPlayerMatchAttempt {")), /playerId String @unique/)
  assert.match(readFileSync("prisma/migrations/20260829214241_add_real_life_player_data/migration.sql", "utf8"), /CREATE UNIQUE INDEX "Player_apiFootballId_key"/)
  assert.match(readFileSync("prisma/migrations/20260831152310_add_api_football_match_attempt/migration.sql", "utf8"), /CREATE UNIQUE INDEX "ApiFootballPlayerMatchAttempt_playerId_key"/)
})
