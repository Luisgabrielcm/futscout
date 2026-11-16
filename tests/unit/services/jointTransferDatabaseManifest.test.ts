import test from "node:test"
import assert from "node:assert/strict"
import { canonicalJson } from "../../../lib/clubContexts"
import { jointHash, jointReadConfiguration, type JointReadManifest } from "../../../lib/jointTransferContexts"
import { assessRealGameProjection, realGamePolicyHash } from "../../../lib/realGameProjection"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { city, benfica } from "../../fixtures/jointTransfer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as order from "../../../lib/playerCatalogOrder"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"

const date = "2026-11-16"
function fixture(count = 2) {
  const payloads = Array.from({ length: count }, (_, i) => {
    const f = projectionFixture(String(700001 + i))
    f.candidate.jointTransfer.futscoutProjection = assessRealGameProjection(f.candidate, f.eligibility, f.movement, date)
    return f.candidate
  })
  const manifest: JointReadManifest = { version: 1, decisionReference: "synthetic-only-decision", entries: payloads.map(p => ({
    eaId: p.eaPlayerId, payloadHash: jointHash(p), snapshotHash: p.game.snapshot.contentHash,
    contexts: ["REAL", "GAME"], gameView: "FUTSCOUT_PROJECTED",
  })) }
  const common = { VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1", JOINT_TRANSFER_READ_ENABLED: "1",
    JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "1", JOINT_REAL_GAME_POLICY_SHA256: realGamePolicyHash,
    JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(manifest) }
  const env: Record<string, string | undefined> = { ...common, JOINT_TRANSFER_READ_MANIFEST_SOURCE: "DATABASE",
    JOINT_TRANSFER_READ_EA_IDS: payloads.map(p => p.eaPlayerId).join(","), JOINT_TRANSFER_READ_SELECTION_VERSION: "1" }
  const inline = { ...common, JOINT_TRANSFER_READ_MANIFEST: JSON.stringify(manifest) }
  const rows = payloads.map(p => ({ eaPlayerId: p.eaPlayerId, version: 1, decisionReference: manifest.decisionReference, revision: {
    eaPlayerId: p.eaPlayerId, payload: p, contentHash: jointHash(p), rosterReferenceId: p.game.snapshot.id,
    rosterReference: { contentHash: p.game.snapshot.contentHash, metadata: structuredClone(p.game.snapshot) },
  } }))
  const queries: unknown[] = []
  const clubRows = [city, benfica].map(c => ({ ...c, externalId: c.eaId }))
  const db = { playerClubContextSelection: { findMany: async (query: unknown) => { queries.push(query); return rows } },
    club: { findMany: async () => clubRows } }
  const reader = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: db }, "../lib/clubContexts": { canonicalJson },
  })
  return { payloads, manifest, rows, env, inline, reader, queries, clubRows,
    db: db as unknown as Parameters<typeof reader.readJointTransferSelections>[1] }
}

test("database manifest is off by default, requires independent Production opt-in and Preview READ ONLY", () => {
  const f = fixture()
  assert.equal(jointReadConfiguration({}), null)
  assert(jointReadConfiguration(f.env))
  for (const patch of [
    { JOINT_TRANSFER_READ_ENABLED: "0" }, { VERCEL_ENV: "development" }, { CLUB_CONTEXTS_PREVIEW_READ_ONLY: "0" },
    { VERCEL_ENV: "production" }, { JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "0" },
    { JOINT_REAL_GAME_POLICY_SHA256: "f".repeat(64) }, { JOINT_TRANSFER_READ_MANIFEST_SHA256: "not-a-hash" },
  ]) assert.equal(jointReadConfiguration({ ...f.env, ...patch }), null)
  assert(jointReadConfiguration({ ...f.env, VERCEL_ENV: "production", JOINT_TRANSFER_READ_PRODUCTION_ENABLED: "1" }))
})

test("database transport rejects ambiguous modes, unbounded/duplicate IDs and invalid versions", () => {
  const f = fixture()
  for (const patch of [
    { JOINT_TRANSFER_READ_MANIFEST_SOURCE: "other" }, { JOINT_TRANSFER_READ_MANIFEST_SOURCE: undefined },
    { JOINT_TRANSFER_READ_MANIFEST: f.inline.JOINT_TRANSFER_READ_MANIFEST }, { JOINT_TRANSFER_READ_MANIFEST: "" },
    { JOINT_TRANSFER_READ_EA_IDS: "" }, { JOINT_TRANSFER_READ_EA_IDS: "700001,700001" },
    { JOINT_TRANSFER_READ_EA_IDS: "700001, 700002" }, { JOINT_TRANSFER_READ_EA_IDS: "700001,not-an-id" },
    { JOINT_TRANSFER_READ_EA_IDS: "0" }, { JOINT_TRANSFER_READ_EA_IDS: "0".repeat(201) },
    { JOINT_TRANSFER_READ_EA_IDS: Array.from({ length: 11 }, (_, i) => String(800001 + i)).join(",") },
    ...[undefined, "0", "-1", "1.5", "01", "Infinity", "99999999999999999"].map(v => ({ JOINT_TRANSFER_READ_SELECTION_VERSION: v })),
  ]) assert.equal(jointReadConfiguration({ ...f.env, ...patch }), null)
  assert.equal(jointReadConfiguration({ ...f.inline, JOINT_TRANSFER_READ_EA_IDS: "700001" }), null)
})

test("one, five and ten database-selected pairs equal the approved inline views without changing original EA/economics", async () => {
  for (const count of [1, 5, 10]) {
    const f = fixture(count), before = structuredClone(f.rows)
    const compact = await f.reader.readJointTransferSelections(undefined, f.db, f.env, date)
    const inline = await f.reader.readJointTransferSelections(undefined, f.db, f.inline, date)
    assert.equal(compact.size, count)
    assert.equal(JSON.stringify([...compact]), JSON.stringify([...inline]))
    assert.deepEqual(f.rows, before)
    const selected = compact.get(f.payloads[0].eaPlayerId)!
    assert.equal(selected.views.game?.clubLabel, "Benfica")
    assert.equal(selected.views.real?.parentClub?.name, "Manchester City")
    assert.equal(selected.views.snapshotGame?.clubLabel, "Manchester City")
    assert.equal(selected.views.snapshotGame?.loanBadge, null)
    const player = { club: "Legacy", salary: 120, contract: "unchanged", marketValue: 456, potential: 82, manual: "keep" }
    const shown = f.reader.applyJointPlayerPresentation(player, selected)
    for (const key of ["salary", "contract", "marketValue", "potential", "manual"] as const) assert.equal(shown[key], player[key])
    assert.equal(f.reader.applyJointPlayerPresentation(player, undefined), player)
  }
})

test("out-of-scope/disabled requests make no query; selected profiles verify the entire bounded set but return only requested IDs", async () => {
  const f = fixture()
  assert.equal((await f.reader.readJointTransferSelections(undefined, f.db, {})).size, 0)
  assert.equal((await f.reader.readJointTransferSelections(["999999"], f.db, f.env)).size, 0)
  assert.equal(f.queries.length, 0)
  const selected = await f.reader.readJointTransferSelections(["700001", "999999"], f.db, f.env, date)
  assert.deepEqual([...selected.keys()], ["700001"])
  assert.equal(JSON.stringify(f.queries[0]), JSON.stringify({ where: { eaPlayerId: { in: ["700001", "700002"] },
    player: { eaImportVisibility: "PUBLIC" } }, include: { revision: { include: { rosterReference: true } } } }))
})

test("database order is irrelevant but changing the externally pinned manifest order or root is rejected", async () => {
  const f = fixture(); f.rows.reverse()
  assert.equal((await f.reader.readJointTransferSelections(undefined, f.db, f.env, date)).size, 2)
  for (const patch of [{ JOINT_TRANSFER_READ_EA_IDS: "700002,700001" }, { JOINT_TRANSFER_READ_MANIFEST_SHA256: "0".repeat(64) }])
    await assert.rejects(f.reader.readJointTransferSelections(undefined, f.db, { ...f.env, ...patch }, date), /APPROVED_MANIFEST_CHANGED/)
})

test("missing, extra, duplicate and stale-version selections fail closed before any projection", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rows.pop() },
    (f: ReturnType<typeof fixture>) => { f.rows.push(structuredClone(f.rows[0])) },
    (f: ReturnType<typeof fixture>) => { f.rows[1] = structuredClone(f.rows[0]) },
    (f: ReturnType<typeof fixture>) => { f.rows[1].eaPlayerId = "999999" },
    (f: ReturnType<typeof fixture>) => { f.rows[1].version = 2 },
  ]) {
    const f = fixture(); mutate(f)
    await assert.rejects(f.reader.readJointTransferSelections(["700001"], f.db, f.env, date), /APPROVED_SELECTION_SET_OR_VERSION_CHANGED/)
  }
})

test("payload, snapshot, decision and club identity tampering is rejected, including an unrequested member", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.contentHash = "f".repeat(64) },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.payload.real!.observedAt = "2026-11-15T00:00:00.000Z" },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.rosterReference.contentHash = "f".repeat(64) },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.rosterReference.metadata.rosterVersion = "tampered" },
    (f: ReturnType<typeof fixture>) => { f.rows[1].decisionReference = "unapproved" },
    (f: ReturnType<typeof fixture>) => { f.rows[0].decisionReference = "unapproved" },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.rosterReferenceId = "another-snapshot" },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.eaPlayerId = "999999" },
  ]) {
    const f = fixture(); mutate(f)
    await assert.rejects(f.reader.readJointTransferSelections(["700001"], f.db, f.env, date), /JOINT_|REAL_GAME_PROJECTION_INVALID_OR_STALE/)
  }
  const f = fixture(); f.clubRows.length = 0
  await assert.rejects(f.reader.readJointTransferSelections(undefined, f.db, f.env, date), /READ_CLUB_IDENTITY_CHANGED/)
})

test("catalog routing accepts the database transport and applies the verified projection to filters and cards", async () => {
  const f = fixture(1), row = catalogPlayer({ externalId: "700001", officialOverall: 74 })
  const where: unknown[] = []
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: {
      count: async (args: { where: unknown }) => { where.push(args.where); return 1 },
      findMany: async (args: { where: unknown }) => { where.push(args.where); return [row] },
    } } },
    "../mappers/mapDatabasePlayer": mapper, "../lib/playerCatalogOrder": order,
    "./jointTransferRead.server": { applyJointPlayerPresentation: f.reader.applyJointPlayerPresentation,
      readJointTransferSelections: (ids?: string[]) => f.reader.readJointTransferSelections(ids, f.db, f.env, date) },
    "../lib/jointTransferCatalog": { jointCatalogFilter },
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  }, { process: { env: f.env } })
  const before = structuredClone(row)
  const output = await service.getPlayers({ membershipContext: "GAME", parentClub: city.id, currentClub: benfica.id })
  assert.equal(output.players[0].club?.name, "Benfica")
  assert.equal(output.players[0].transferContexts?.game?.parentClub?.name, "Manchester City")
  assert.equal(JSON.stringify(where[0]), JSON.stringify(where[1]))
  assert.match(JSON.stringify(where[0]), /700001/)
  assert.equal(f.queries.length, 1)
  assert.deepEqual(row, before)
})
