import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import type { Prisma } from "../../../app/generated/prisma/client"
import type { NormalizedPlayer } from "../../../types/normalizedPlayer"
import type { EaCatalogBatchProvenance } from "../../../lib/eaCatalogSemanticSync"
import { assertAcceptedRating, eaRatingSnapshot } from "../../../lib/eaRatingSnapshot"
import { persistEaRatingSnapshots } from "../../../services/eaRatingSnapshotPersistence"

const player: NormalizedPlayer = { externalId: "ea-1", source: "ea-ratings", name: "Fixture",
  dateOfBirth: new Date("2000-01-01Z"), position: "MC", secondaryPositions: [], officialOverall: 85,
  attributes: { pace: 80, shooting: 82 }, playStyles: [] }
const source: EaCatalogBatchProvenance = { provider: "ea-ratings", endpoint: "official",
  eaGameVersion: "FC27", catalogVersion: null, gameVersionEvidence: "PAYLOAD", gameVersionEvidenceUrl: null,
  sourceUpdatedAt: null, observedAt: new Date(0), responseDate: null, etag: null, lastModified: null,
  locale: "en", gender: 0, requestOffset: 0, requestLimit: 1, totalItems: 1 }
const accepted = (p = player) => ({ id: "p1", externalId: p.externalId, dateOfBirth: p.dateOfBirth ?? null,
  position: p.position, officialOverall: p.officialOverall, attributes: p.attributes,
  goalkeeperAttributes: p.goalkeeperAttributes ?? null })
function fake(p = player) {
  const snapshots = new Map<string, { id: string; playerId: string; externalId: string }>()
  const tx = { player: { findMany: async () => [accepted(p)] }, eaPlayerRatingSnapshot: {
    findMany: async ({ where }: { where: { OR: object[] } }) => where.OR.flatMap(key => {
      const row = snapshots.get(JSON.stringify(key)); return row ? [row] : []
    }),
    createMany: async ({ data }: { data: (ReturnType<typeof eaRatingSnapshot> & { playerId: string })[] }) => {
      for (const item of data) {
        const key = JSON.stringify({ externalId: item.externalId, sourceContext: item.sourceContext,
          snapshotVersion: item.snapshotVersion, contentHash: item.contentHash })
        if (!snapshots.has(key)) snapshots.set(key, { id: `snapshot-${snapshots.size + 1}`,
          playerId: item.playerId, externalId: item.externalId })
      }
      return { count: data.length }
    },
  } }
  return { tx: tx as unknown as Prisma.TransactionClient, snapshots }
}
const capture = (tx: Prisma.TransactionClient, p = player) => persistEaRatingSnapshots(tx, [p], source,
  [{ playerId: "p1", externalId: p.externalId }])

test("first snapshot and NO_OP reuse one immutable state", async () => {
  const { tx, snapshots } = fake()
  const first = await capture(tx)
  assert.equal((await capture(tx)).get("ea-1"), first.get("ea-1"))
  assert.equal(snapshots.size, 1)
})
test("OVR change creates a distinct content hash", () => {
  assert.notEqual(eaRatingSnapshot(player, source).contentHash,
    eaRatingSnapshot({ ...player, officialOverall: 86 }, source).contentHash)
})
test("accepted OVR and attribute changes persist new snapshots, never update the previous one", async () => {
  const p = { ...player, attributes: { ...player.attributes } }
  const { tx, snapshots } = fake(p)
  const original = (await capture(tx, p)).get(p.externalId)
  p.officialOverall++
  assert.notEqual((await capture(tx, p)).get(p.externalId), original)
  p.attributes.pace = 81
  await capture(tx, p)
  assert.equal(snapshots.size, 3)
})
test("attribute change creates a distinct content hash", () => {
  assert.notEqual(eaRatingSnapshot(player, source).contentHash,
    eaRatingSnapshot({ ...player, attributes: { pace: 81, shooting: 82 } }, source).contentHash)
})
test("club/image/name/time/locale changes do not change rating identity", () => {
  const a = eaRatingSnapshot(player, source)
  const b = eaRatingSnapshot({ ...player, name: "Renamed", imageUrl: "new", club: { name: "Moved" } },
    { ...source, observedAt: new Date(), locale: "pt", requestOffset: 50 })
  assert.equal(a.contentHash, b.contentHash)
  assert.equal(a.sourceContext, b.sourceContext)
})
test("edition is a separate deduplication namespace", () => {
  assert.notEqual(eaRatingSnapshot(player, source).sourceContext,
    eaRatingSnapshot(player, { ...source, eaGameVersion: "FC28" }).sourceContext)
})
test("GK fields are captured and verified", async () => {
  const gk: NormalizedPlayer = { ...player, position: "GOL", attributes: {},
    goalkeeperAttributes: { diving: 80, handling: 82 } }
  assert.deepEqual(eaRatingSnapshot(gk, source).attributes.goalkeeper, { diving: 80, handling: 82 })
  const { tx } = fake(gk)
  assert.equal((await capture(tx, gk)).size, 1)
})
test("missing/undefined/null/value remain distinct without invented values", () => {
  const missing = eaRatingSnapshot({ ...player, attributes: {} }, source)
  const undef = eaRatingSnapshot({ ...player, attributes: { pace: undefined } }, source)
  const explicit = eaRatingSnapshot({ ...player, attributes: { pace: null } as unknown as NormalizedPlayer["attributes"] }, source)
  assert.equal(missing.contentHash, undef.contentHash)
  assert.notEqual(missing.contentHash, explicit.contentHash)
  assert.deepEqual(missing.attributes.outfield, {})
  assert.deepEqual(explicit.attributes.outfield, { pace: null })
  assert.equal("goalkeeper" in missing.attributes, false)
})
test("hash is deterministic across object key order", () => {
  assert.equal(eaRatingSnapshot(player, source).contentHash,
    eaRatingSnapshot({ ...player, attributes: { shooting: 82, pace: 80 } }, source).contentHash)
})
test("unaccepted rating/attributes/identity fail before creating history", async () => {
  const { tx, snapshots } = fake()
  await assert.rejects(capture(tx, { ...player, officialOverall: 86 }), /STATE_MISMATCH/)
  await assert.rejects(capture(tx, { ...player, attributes: { pace: 81 } }), /ATTRIBUTE_NOT_ACCEPTED/)
  await assert.rejects(persistEaRatingSnapshots(tx, [player], source,
    [{ playerId: "other", externalId: player.externalId }]), /IDENTITY_MISMATCH/)
  assert.equal(snapshots.size, 0)
})
test("provenance failure rolls back snapshots in the same transaction", async () => {
  const { tx, snapshots } = fake()
  const transaction = async () => {
    const before = new Map(snapshots)
    try { await capture(tx); throw new Error("PROVENANCE_FAILED") }
    catch (error) { snapshots.clear(); for (const [k, v] of before) snapshots.set(k, v); throw error }
  }
  await assert.rejects(transaction(), /PROVENANCE_FAILED/)
  assert.equal(snapshots.size, 0)
})
test("removal has no cascading history delete and DB rejects snapshot mutations", () => {
  const sql = readFileSync("prisma/migrations/20261004000000_ea_rating_snapshots_v1/migration.sql", "utf8")
  assert.match(sql, /REFERENCES "Player"\("id"\) ON DELETE RESTRICT/)
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "EaPlayerRatingSnapshot"/)
  assert.doesNotMatch(sql, /CASCADE/)
})
test("pipeline captures only successful batches inside Serializable provenance transaction", () => {
  const code = readFileSync("services/syncPlayers.ts", "utf8")
  assert.match(code, /!options.dryRun && options.provenance && result.failed === 0/)
  assert.match(code, /persistEaRatingSnapshots\(tx,/)
  assert.match(code, /ratingSnapshotId: ratingSnapshots.get\(item.externalId\)/)
  assert.match(code, /isolationLevel: "Serializable"/)
})
test("GK snapshots link only after verified read-back, in the existing write transaction", () => {
  const code = readFileSync("services/prismaEaGoalkeeperAttributesSyncStore.ts", "utf8")
  assert.ok(code.indexOf("if (!result.ok) return result") < code.indexOf("const snapshots = await persistEaRatingSnapshots"))
  assert.match(code, /ratingSnapshotId: null/)
  assert.match(code, /linked.count !== 1/)
})
test("DOB disagreement is rejected, absent DOB does not fabricate a date", () => {
  assert.throws(() => assertAcceptedRating(player, { ...accepted(), dateOfBirth: new Date(0) }), /MISMATCH/)
  assert.equal(eaRatingSnapshot({ ...player, dateOfBirth: undefined }, source).dateOfBirth, null)
})
