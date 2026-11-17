import test from "node:test"
import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { canonicalJson } from "../../../lib/clubContexts"
import { jointHash, jointReadConfiguration, verifyJointReadIndex, extendJointReadIndex, type JointReadIndex } from "../../../lib/jointTransferContexts"
import { assessRealGameProjection, realGamePolicyHash } from "../../../lib/realGameProjection"
import { projectionFixture } from "../../fixtures/realGameProjection"
import { city, benfica } from "../../fixtures/jointTransfer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const date = "2026-11-17"
function fixture(count = 361) {
  const rows = Array.from({ length: count }, (_, i) => {
    const f = projectionFixture(String(800001 + i))
    if (i >= 34) {
      f.candidate.jointTransfer.real!.loan = null; f.candidate.jointTransfer.real!.parentClub = null
      f.movement.kind = "CURRENT_CLUB_CONFIRMED"; f.movement.evidenceHash = f.candidate.real!.evidenceHash
      f.eligibility.originClubId = null; f.eligibility.originAvailable = false
    }
    f.candidate.jointTransfer.futscoutProjection = assessRealGameProjection(f.candidate, f.eligibility, f.movement, date)
    const payload = f.candidate, contentHash = jointHash(payload), revisionId = `joint-transfer:${payload.eaPlayerId}:${contentHash}`
    return { eaPlayerId: payload.eaPlayerId, revisionId, version: 1, decisionReference: i < 10 ? "protected-ten" : `new-batch-${Math.floor((i - 10) / 100)}`,
      revision: { eaPlayerId: payload.eaPlayerId, payload, contentHash, rosterReferenceId: payload.game.snapshot.id,
        rosterReference: { id: payload.game.snapshot.id, contentHash: payload.game.snapshot.contentHash, metadata: structuredClone(payload.game.snapshot) } } }
  })
  const index: JointReadIndex = { version: 2, policyHash: realGamePolicyHash, entries: rows.map(r => ({ eaId: r.eaPlayerId,
    revisionId: r.revisionId, selectionVersion: r.version, decisionReference: r.decisionReference,
    payloadHash: r.revision.contentHash, snapshotId: r.revision.rosterReferenceId, snapshotHash: r.revision.rosterReference.contentHash })) }
  const env: Record<string, string | undefined> = { VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1", JOINT_TRANSFER_READ_ENABLED: "1",
    JOINT_REAL_GAME_PROJECTION_READ_ENABLED: "1", JOINT_REAL_GAME_POLICY_SHA256: realGamePolicyHash,
    JOINT_TRANSFER_READ_MANIFEST_SOURCE: "DATABASE_INDEX", JOINT_TRANSFER_READ_EA_IDS: index.entries.map(e => e.eaId).join(","),
    JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(index) }
  const queries: { kind: string; ids: string[]; bytes: number; query: unknown }[] = []
  let afterHeaders: (() => void) | undefined
  const clubRows = [city, benfica].map(c => ({ ...c, externalId: c.eaId }))
  const db = { playerClubContextSelection: { findMany: async (query: { where: { eaPlayerId: { in: string[] } }; select?: unknown }) => {
    const selected = rows.filter(r => query.where.eaPlayerId.in.includes(r.eaPlayerId))
    const result = query.select ? selected.map(r => ({ eaPlayerId: r.eaPlayerId, revisionId: r.revisionId, version: r.version,
      decisionReference: r.decisionReference, revision: { eaPlayerId: r.revision.eaPlayerId, contentHash: r.revision.contentHash,
        rosterReferenceId: r.revision.rosterReferenceId, rosterReference: { id: r.revision.rosterReference.id, contentHash: r.revision.rosterReference.contentHash } } })) : structuredClone(selected)
    queries.push({ kind: query.select ? "headers" : "payloads", ids: query.where.eaPlayerId.in, query, bytes: Buffer.byteLength(JSON.stringify(result)) })
    if (query.select) afterHeaders?.()
    return result
  } }, club: { findMany: async (query: unknown) => { queries.push({ kind: "clubs", ids: [], query, bytes: 0 }); return clubRows } } }
  const reader = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: db }, "../lib/clubContexts": { canonicalJson },
  })
  return { rows, index, env, queries, clubRows, reader, setAfterHeaders: (fn: () => void) => { afterHeaders = fn },
    db: db as unknown as Parameters<typeof reader.readJointTransferSelections>[1] }
}

test("351 additions retain the ten protected entries, mixed decisions and immutable root", () => {
  const f = fixture(), prior: JointReadIndex = { ...f.index, entries: f.index.entries.slice(0, 10) }
  const combined = extendJointReadIndex(prior, jointHash(prior), f.index.entries.slice(10))
  assert.deepEqual(combined, f.index); assert.deepEqual(combined.entries.slice(0, 10), prior.entries)
  assert.throws(() => extendJointReadIndex(prior, jointHash(prior), [{ ...prior.entries[0], selectionVersion: 2 }]), /PROTECTED_SELECTION/)
  assert.throws(() => extendJointReadIndex(prior, "f".repeat(64), []), /INDEX_CHANGED/)
  verifyJointReadIndex(combined, combined.entries.map(e => e.eaId), f.env.JOINT_TRANSFER_READ_MANIFEST_SHA256!)
})

test("bounded index configuration remains default-off and rejects ambiguous transport/IDs", () => {
  const f = fixture(2)
  assert(jointReadConfiguration(f.env)); assert.equal(jointReadConfiguration({}), null)
  for (const patch of [
    { JOINT_TRANSFER_READ_ENABLED: "0" }, { VERCEL_ENV: "production" }, { CLUB_CONTEXTS_PREVIEW_READ_ONLY: "0" },
    { JOINT_REAL_GAME_POLICY_SHA256: "f".repeat(64) }, { JOINT_TRANSFER_READ_MANIFEST: "{}" }, { JOINT_TRANSFER_READ_SELECTION_VERSION: "1" },
    { JOINT_TRANSFER_READ_EA_IDS: "800001,800001" }, { JOINT_TRANSFER_READ_EA_IDS: "800001, 800002" },
    { JOINT_TRANSFER_READ_EA_IDS: "0" }, { JOINT_TRANSFER_READ_EA_IDS: "1".repeat(6656) },
    { JOINT_TRANSFER_READ_EA_IDS: Array.from({ length: 513 }, (_, i) => String(800001 + i)).join(",") },
  ]) assert.equal(jointReadConfiguration({ ...f.env, ...patch }), null)
  assert(jointReadConfiguration({ ...f.env, VERCEL_ENV: "production", JOINT_TRANSFER_READ_PRODUCTION_ENABLED: "1" }))
  verifyJointReadIndex({ ...f.index, entries: f.index.entries.map((e, i) => ({ ...e, selectionVersion: i + 1 })) },
    f.index.entries.map(e => e.eaId), jointHash({ ...f.index, entries: f.index.entries.map((e, i) => ({ ...e, selectionVersion: i + 1 })) }))
})

test("a profile verifies all 361 pins, fetches only its payload and batches clubs in three queries", async () => {
  const f = fixture(), baseline = jointHash(f.rows), start = performance.now()
  const result = await f.reader.readJointTransferSelections(["800011", "999999"], f.db, f.env, date)
  assert.deepEqual([...result.keys()], ["800011"])
  assert.deepEqual(f.queries.map(q => q.kind), ["headers", "payloads", "clubs"])
  assert.equal(f.queries[0].ids.length, 361); assert.deepEqual(f.queries[1].ids, ["800011"])
  assert.doesNotMatch(JSON.stringify(f.queries[0].query), /"payload"/)
  const oldFullPayloadBytes = Buffer.byteLength(JSON.stringify(f.rows))
  assert(f.queries[0].bytes + f.queries[1].bytes < oldFullPayloadBytes / 4)
  assert.equal(jointHash(f.rows), baseline)
  assert(performance.now() - start < 5000, "bounded local reader CPU regression")
  const selected = result.get("800011")!, player = { club: "legacy", wage: 123, contract: "keep", potential: 88, marketValue: 456, manual: "keep" }
  const shown = f.reader.applyJointPlayerPresentation(player, selected)
  for (const k of ["wage", "contract", "potential", "marketValue", "manual"] as const) assert.equal(shown[k], player[k])
  assert.equal(selected.views.game?.parentClub?.name, city.name); assert.equal(selected.views.real?.parentClub?.name, city.name)
  assert.equal(selected.views.snapshotGame?.clubLabel, city.name); assert.equal(selected.views.snapshotGame?.loanBadge, null)
})

test("full catalog/filters load 351 plus ten in bounded bulk with no per-player query", async () => {
  const f = fixture(), result = await f.reader.readJointTransferSelections(undefined, f.db, f.env, date)
  assert.equal(result.size, 361); assert.equal(f.queries.length, 3); assert.equal(f.queries[1].ids.length, 361)
  assert.equal([...result.values()].filter(s => s.payload.jointTransfer.real?.loan).length, 34)
  assert.equal([...result.values()].filter(s => s.payload.jointTransfer.movements[0].kind === "CURRENT_CLUB_CONFIRMED").length, 327)
  for (const s of result.values()) {
    assert.deepEqual(s.views.game?.nationalTeams, s.views.snapshotGame?.nationalTeams)
    assert.equal(s.views.game?.isOfficialSquadClaimed, false)
  }
})

test("disabled/outside IDs do not query; an unrequested protected pointer/version/decision change fails before payload reads", async () => {
  const f = fixture(2)
  await f.reader.readJointTransferSelections(["999999"], f.db, f.env, date)
  await f.reader.readJointTransferSelections(undefined, f.db, {}, date)
  assert.equal(f.queries.length, 0)
  for (const field of ["version", "decisionReference", "revisionId"] as const) {
    const g = fixture(2)
    if (field === "version") g.rows[0].version = 2; else g.rows[0][field] = "unapproved"
    await assert.rejects(g.reader.readJointTransferSelections(["800002"], g.db, g.env, date), /INDEX_CHANGED/)
    assert.equal(g.queries.length, 1)
  }
})

test("missing, duplicate, changed order, root and policy pins fail closed", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rows.pop() },
    (f: ReturnType<typeof fixture>) => { f.rows.push(structuredClone(f.rows[0])) },
    (f: ReturnType<typeof fixture>) => { f.env.JOINT_TRANSFER_READ_EA_IDS = "800002,800001" },
    (f: ReturnType<typeof fixture>) => { f.env.JOINT_TRANSFER_READ_MANIFEST_SHA256 = "f".repeat(64) },
    (f: ReturnType<typeof fixture>) => { f.rows[1].revision.rosterReference.contentHash = "f".repeat(64) },
  ]) {
    const f = fixture(2); mutate(f)
    await assert.rejects(f.reader.readJointTransferSelections(["800001"], f.db, f.env, date), /INDEX_/)
  }
})

test("selected payload/snapshot tampering and changes between metadata and payload queries are rejected", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rows[0].revision.payload.real!.observedAt = "2026-11-15T00:00:00Z" },
    (f: ReturnType<typeof fixture>) => { f.rows[0].revision.rosterReference.metadata.gameBuild = "changed" },
    (f: ReturnType<typeof fixture>) => { f.setAfterHeaders(() => { f.rows[0].version++ }) },
    (f: ReturnType<typeof fixture>) => { f.setAfterHeaders(() => { f.rows[0].decisionReference = "changed" }) },
    (f: ReturnType<typeof fixture>) => { f.setAfterHeaders(() => { f.rows[0].revision.contentHash = "f".repeat(64) }) },
  ]) {
    const f = fixture(2); mutate(f)
    await assert.rejects(f.reader.readJointTransferSelections(["800001"], f.db, f.env, date), /JOINT_|REAL_GAME_/)
  }
  const f = fixture(2); f.clubRows.length = 0
  await assert.rejects(f.reader.readJointTransferSelections(["800001"], f.db, f.env, date), /READ_CLUB_IDENTITY/)
})
