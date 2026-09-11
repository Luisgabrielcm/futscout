import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { parseFixture, parseOfficialLineup } from "../../../lib/officialLineup"
import { decodeLineupSnapshot, officialLineupContentHash, type SnapshotData } from "../../../lib/officialLineupSnapshot"
import { resolveOfficialLineupPlayers } from "../../../lib/resolveOfficialLineupPlayers"
import { createOfficialLineupRepository } from "../../../services/officialLineupRepository"
import { createOfficialLineupReadStore } from "../../../services/officialLineupReadRepository"
import * as readRepository from "../../../services/officialLineupReadRepository"
import * as core from "../../../lib/officialLineup"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { fixturePayload, lineupPayload, lineupCatalog, lineupNow } from "../../fixtures/officialLineup"

function lineup() { return parseOfficialLineup(parseFixture(fixturePayload(), 1, lineupNow)!, lineupPayload(), 1, lineupNow.toISOString())! }
type Row = SnapshotData & { id: string }
function fakeDatabase() {
  const rows: Row[] = [], calls: { method: string; args: unknown }[] = []
  let apiFootballId: number | null = 1
  const db = {
    club: { findUnique: async (args: unknown) => { calls.push({ method: "club.findUnique", args }); return { apiFootballId } } },
    player: { findMany: async (args: unknown) => { calls.push({ method: "player.findMany", args }); return lineupCatalog } },
    clubOfficialLineupSnapshot: {
      findFirst: async (args: { where: { fixtureExternalId: number; teamExternalId: number } }) => { calls.push({ method: "snapshot.findFirst", args }); return [...rows].filter(r => r.fixtureExternalId === args.where.fixtureExternalId && r.teamExternalId === args.where.teamExternalId).sort((a, b) => b.revision - a.revision)[0] ?? null },
      create: async ({ data }: { data: SnapshotData }) => { calls.push({ method: "snapshot.create", args: data }); const row = { ...data, id: `snapshot-${rows.length}` }; rows.push(row); return row },
      findMany: async (args: unknown) => { calls.push({ method: "snapshot.findMany", args }); return [...rows].sort((a, b) => b.fixtureDate.getTime() - a.fixtureDate.getTime() || b.fetchedAt.getTime() - a.fetchedAt.getTime() || b.revision - a.revision) },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>, options: unknown) => { calls.push({ method: "transaction", args: options }); return fn(db) },
  }
  return { db: db as unknown as PrismaClient, rows, calls, changeTeam: (id: number | null) => { apiFootballId = id } }
}

test("content hash is stable across fetch times/property order, changes for relevant content", () => {
  const a = lineup(), b = { ...a, fetchedAt: "2026-09-11T12:01:00Z" }
  assert.equal(officialLineupContentHash(a), officialLineupContentHash(b))
  assert.equal(officialLineupContentHash(a), officialLineupContentHash({ ...a, fixture: { ...a.fixture, home: { name: a.fixture.home.name, id: a.fixture.home.id } } }))
  b.startXI = b.startXI.map((p, i) => i ? p : { ...p, grid: "1:2" })
  assert.notEqual(officialLineupContentHash(a), officialLineupContentHash(b))
})
test("new snapshot validates club, saves payload v1, and duplicate does not insert/update", async () => {
  const f = fakeDatabase(), repo = createOfficialLineupRepository(f.db)
  assert.equal((await repo.saveOfficialLineupSnapshot("club", lineup(), lineupNow)).status, "created")
  assert.equal((await repo.saveOfficialLineupSnapshot("club", { ...lineup(), fetchedAt: "2026-09-11T12:01:00Z" }, new Date("2026-09-11T12:02:00Z"))).status, "duplicate")
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].payloadVersion, 1); assert.equal(f.rows[0].revision, 1)
  assert.deepEqual(f.calls.find(c => c.method === "transaction")?.args, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 })
  assert.ok(f.calls.every(c => ["transaction", "club.findUnique", "snapshot.findFirst", "snapshot.create"].includes(c.method)))
})
test("A to B to A preserves ordered revisions, rather than resurrecting stale B", async () => {
  const f = fakeDatabase(), repo = createOfficialLineupRepository(f.db)
  const a = lineup(), b = lineup(); b.formation = "3-4-3"; b.fetchedAt = "2026-09-11T12:01:00Z"
  const returnedA = { ...a, fetchedAt: "2026-09-11T12:02:00Z" }, now = new Date("2026-09-11T12:03:00Z")
  await repo.saveOfficialLineupSnapshot("club", a, now); await repo.saveOfficialLineupSnapshot("club", b, now); await repo.saveOfficialLineupSnapshot("club", returnedA, now)
  assert.deepEqual(f.rows.map(r => r.revision), [1, 2, 3]); assert.equal(f.rows[0].contentHash, f.rows[2].contentHash)
  const read = await createOfficialLineupReadStore(f.db, now).readSnapshots("club")
  assert.equal(read.length, 1); assert.equal(read[0].fetchedAt, returnedA.fetchedAt.replace("Z", ".000Z"))
})
test("wrong club, invalid payload and stale capture cause zero inserts", async () => {
  const f = fakeDatabase(), repo = createOfficialLineupRepository(f.db)
  f.changeTeam(2)
  await assert.rejects(repo.saveOfficialLineupSnapshot("club", lineup(), lineupNow), /identity mismatch/)
  f.changeTeam(1)
  await assert.rejects(repo.saveOfficialLineupSnapshot("club", { ...lineup(), startXI: [] }, lineupNow), /Invalid/)
  assert.equal(f.rows.length, 0)
  await repo.saveOfficialLineupSnapshot("club", lineup(), lineupNow)
  await assert.rejects(repo.saveOfficialLineupSnapshot("club", { ...lineup(), formation: "3-4-3" }, lineupNow), /stale capture/)
  assert.equal(f.rows.length, 1)
})
test("concurrency conflict propagates without retry", async () => {
  const f = fakeDatabase(); let attempts = 0
  f.db.$transaction = (async () => { attempts++; throw Object.assign(new Error("fake race"), { code: "P2034" }) }) as typeof f.db.$transaction
  await assert.rejects(createOfficialLineupRepository(f.db).saveOfficialLineupSnapshot("club", lineup(), lineupNow))
  assert.equal(attempts, 1); assert.equal(f.rows.length, 0)
})
test("decoder rejects future version, hash mismatch and inconsistent scalar/payload identity", async () => {
  const f = fakeDatabase(); await createOfficialLineupRepository(f.db).saveOfficialLineupSnapshot("club", lineup(), lineupNow)
  const row = f.rows[0]
  assert.ok(decodeLineupSnapshot(row, lineupNow))
  for (const change of [{ payloadVersion: 2 }, { contentHash: "bad" }, { fixtureExternalId: 999 }, { teamExternalId: 999 }, { payload: {} }]) assert.equal(decodeLineupSnapshot({ ...row, ...change }, lineupNow), null)
})
test("latest read queries one club/window, skips unsupported latest revision, never fetches API", async () => {
  const f = fakeDatabase(); await createOfficialLineupRepository(f.db).saveOfficialLineupSnapshot("club", lineup(), lineupNow)
  const store = createOfficialLineupReadStore(f.db, lineupNow)
  assert.equal((await store.readSnapshots("club")).length, 1)
  const query = f.calls.find(c => c.method === "snapshot.findMany")?.args as { where: { teamExternalId: number }; take: number; orderBy: unknown[] }
  assert.equal(query.take, 20); assert.equal(query.where.teamExternalId, 1); assert.equal(query.orderBy.length, 4)
  f.rows.push({ ...f.rows[0], id: "future", payloadVersion: 2, revision: 2 })
  assert.equal((await store.readSnapshots("club")).length, 0)
})
test("player resolution explicitly reports resolved, unresolved and conflict with no fuzzy names", () => {
  const players = lineup().startXI
  const result = resolveOfficialLineupPlayers(players, [lineupCatalog[0], lineupCatalog[1], { ...lineupCatalog[1], id: "collision" }])
  assert.equal(result[0].resolution, "resolved"); assert.equal(result[1].resolution, "conflict"); assert.equal(result[1].catalog, null); assert.equal(result[2].resolution, "unresolved")
})
test("capability off never loads DB; explicit true creates real read adapter", async () => {
  const capability = loadCatalogModule<typeof import("../../../services/officialLineupCapability")>("services/officialLineupCapability.ts", { "server-only": {}, "./officialLineupReadRepository": readRepository })
  let loads = 0; const f = fakeDatabase(); const load = async () => { loads++; return f.db }
  for (const value of ["false", "", "TRUE", "1"]) assert.equal(await capability.getOfficialLineupReadStore(lineupNow, value, load), null)
  assert.equal(loads, 0); assert.ok(await capability.getOfficialLineupReadStore(lineupNow, "true", load)); assert.equal(loads, 1)
})
test("read service obtains repository from capability and only missing-table failure falls back", async () => {
  const f = fakeDatabase(); await createOfficialLineupRepository(f.db).saveOfficialLineupSnapshot("club", lineup(), lineupNow)
  const store = createOfficialLineupReadStore(f.db, lineupNow)
  const service = loadCatalogModule<typeof import("../../../services/officialLineupService")>("services/officialLineupService.ts", { "server-only": {}, "../lib/officialLineup": core, "./officialLineupCapability": { getOfficialLineupReadStore: async () => store } })
  assert.equal((await service.getLatestOfficialClubLineup("club", undefined, lineupNow))?.startXI.length, 11)
  store.readSnapshots = async () => { throw { code: "P2021" } }
  assert.equal(await service.getLatestOfficialClubLineup("club", store, lineupNow), null)
  store.readSnapshots = async () => { throw { code: "P1001" } }
  await assert.rejects(service.getLatestOfficialClubLineup("club", store, lineupNow))
})
test("migration is additive and indexes/restrict relation match schema contract", () => {
  const sql = readFileSync("prisma/migrations/20260911000000_add_official_lineup_snapshots/migration.sql", "utf8").replace(/--[^\n]*/g, "")
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|INSERT)\b|\bDELETE\s+FROM\b|\bUPDATE\b(?! CASCADE)/i)
  for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) assert.match(statement, /^(CREATE (TABLE|UNIQUE INDEX|INDEX)|ALTER TABLE "ClubOfficialLineupSnapshot" ADD CONSTRAINT) /)
  assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 1); assert.match(sql, /ON DELETE RESTRICT/)
  assert.match(sql, /official_lineup_revision_key/); assert.match(sql, /official_lineup_club_latest_idx/)
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /officialLineupSnapshots ClubOfficialLineupSnapshot\[\]/)
})
