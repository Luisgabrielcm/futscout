import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import type { EaCatalogBatchProvenance } from "../../../lib/eaCatalogSemanticSync"
import { eaGoalkeeperPayloadHash } from "../../../services/eaGoalkeeperAttributes"
import {
  EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY,
  EA_GOALKEEPER_HISTORICAL_SYNC_KEY,
  eaGoalkeeperOperationalStateHash,
  persistEaGoalkeeperBatchAtomically,
  planEaGoalkeeperAttributesWrite,
  type EaGoalkeeperAudit,
  type EaGoalkeeperCursor,
  type EaGoalkeeperOperationalState,
  type EaGoalkeeperWritePlan,
  type EaGoalkeeperWriteRequest,
  type EaGoalkeeperWriteStore,
  type EaGoalkeeperWriteTransaction,
} from "../../../services/eaGoalkeeperAttributesSync"
import { parseEaGoalkeeperSyncMode } from "../../../sync/eaGoalkeeperAttributesSyncRunnerOptions"
import type { GoalkeeperAttributeValues } from "../../../types/goalkeeperAttributes"

const attributes: GoalkeeperAttributeValues = {
  diving: 88, handling: 86, kicking: 84, positioning: 89, reflexes: 90,
}

const player = (stored: GoalkeeperAttributeValues | null = null): EaGoalkeeperOperationalState => ({
  playerId: "player-1", externalId: "1", name: "Keeper", position: "GOL",
  playerUpdatedAt: "2026-09-20T00:00:00.000Z",
  attributes: stored ? { id: "gk-1", ...stored, payloadHash: "old-hash",
    updatedAt: "2026-09-20T00:00:00.000Z" } : null,
})

const provenance: EaCatalogBatchProvenance = {
  provider: "ea-ratings", endpoint: "https://example.test/ratings", eaGameVersion: "FC27",
  gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT", gameVersionEvidenceUrl: "https://example.test/fc27",
  catalogVersion: null, sourceUpdatedAt: null, observedAt: new Date("2026-09-21T00:00:00.000Z"),
  responseDate: null, etag: null, lastModified: null, locale: "en", gender: 0,
  requestOffset: 0, requestLimit: 100, totalItems: 16228,
}

function plan(current = player(null), incoming = attributes): EaGoalkeeperWritePlan {
  return planEaGoalkeeperAttributesWrite({ sourceIndex: 10, sourcePage: 0,
    player: { externalId: "1", name: "Keeper", position: "GOL", goalkeeperAttributes: incoming }, current })
}

function request(current = player(null), plans = [plan(current)]): EaGoalkeeperWriteRequest {
  return {
    key: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY,
    historicalKey: EA_GOALKEEPER_HISTORICAL_SYNC_KEY,
    expectedHistoricalCheckpoint: { offset: 16228, updatedAt: "2026-09-20T00:00:00.000Z" },
    expectedCursor: null,
    sourceOffset: 0,
    nextOffset: 11,
    totalItems: 16228,
    sourcePages: [{ pageIndex: 0, provenance, batchHash: "batch-hash", externalIds: ["1"] }],
    plans,
  }
}

type FakeOptions = { failMutation?: boolean; indeterminate?: boolean; corruptAudit?: boolean;
  current?: EaGoalkeeperOperationalState; cursor?: EaGoalkeeperCursor | null }

function fakeStore(options: FakeOptions = {}) {
  let current = structuredClone(options.current ?? player(null))
  let cursor = structuredClone(options.cursor ?? null)
  let writes = 0
  let provenanceWrites = 0
  let transactionFinished = false
  const historical = { offset: 16228, updatedAt: "2026-09-20T00:00:00.000Z" }
  const baseAudit: EaGoalkeeperAudit = {
    protected: { Player: { count: "16228", hash: "players" }, PlayerAttributes: { count: "16228", hash: "attrs" } },
    historicalCheckpoint: historical,
    positionCursor: { offset: 16228, updatedAt: "2026-09-20T00:00:00.000Z" },
  }
  const store: EaGoalkeeperWriteStore = {
    async audit() {
      const value = structuredClone(baseAudit) as {
        protected: Record<string, { count: string; hash: string }>
        historicalCheckpoint: EaGoalkeeperAudit["historicalCheckpoint"]
        positionCursor: EaGoalkeeperAudit["positionCursor"]
      }
      if (transactionFinished && options.corruptAudit) {
        value.protected = { ...value.protected, Player: { ...value.protected.Player, hash: "changed" } }
      }
      return value
    },
    async transaction(work) {
      const before = structuredClone({ current, cursor, writes, provenanceWrites })
      const tx: EaGoalkeeperWriteTransaction = {
        async readHistoricalCheckpoint() { return historical },
        async readCursor() { return cursor },
        async readPlayer() { return structuredClone(current) },
        async createProvenance(page) { provenanceWrites++; return `obs-${page.pageIndex}` },
        async createAttributes(item, observationId, observedAt) {
          if (options.failMutation) throw new Error("database failure")
          current = { ...current, attributes: { id: "gk-created", ...item.after!, payloadHash: item.payloadHash,
            updatedAt: observedAt.toISOString() } }
          assert.equal(observationId, "obs-0")
          writes++
          return 1
        },
        async updateAttributes(item, observationId, observedAt) {
          if (options.failMutation) throw new Error("database failure")
          current = { ...current, attributes: { id: current.attributes?.id ?? "gk-1", ...item.after!,
            payloadHash: item.payloadHash, updatedAt: observedAt.toISOString() } }
          assert.equal(observationId, "obs-0")
          writes++
          return 1
        },
        async verify(items, observationIds) {
          return items.every(item => current.attributes && item.after &&
            item.payloadHash === current.attributes.payloadHash && observationIds.get(item.sourcePage) === "obs-0")
        },
        async advanceCursor(input) {
          cursor = { key: input.key, offset: input.offset, batchSize: input.batchSize,
            status: input.completed ? "completed" : "running", updatedAt: input.now.toISOString() }
          return 1
        },
      }
      try {
        const value = await work(tx)
        transactionFinished = true
        if (options.indeterminate) throw new Error("connection lost after commit")
        return value
      } catch (error) {
        if (!options.indeterminate) ({ current, cursor, writes, provenanceWrites } = before)
        throw error
      }
    },
  }
  return { store, state: () => ({ current, cursor, writes, provenanceWrites }) }
}

test("plans CREATE, UPDATE and NO_OP with exact EA identity and primary GOL", () => {
  assert.equal(plan(player(null)).action, "CREATE")
  assert.equal(plan(player(attributes)).action, "NO_OP")
  const update = plan(player(attributes), { ...attributes, reflexes: 91 })
  assert.equal(update.action, "UPDATE")
  assert.deepEqual(update.changedFields, ["reflexes"])
  assert.equal(update.expectedStateHash, eaGoalkeeperOperationalStateHash(player(attributes)))
})

test("missing fields preserve existing values and never clear", () => {
  const update = planEaGoalkeeperAttributesWrite({ sourceIndex: 1, sourcePage: 0,
    player: { externalId: "1", name: "Keeper", position: "GOL", goalkeeperAttributes: { diving: 91 } },
    current: player(attributes) })
  assert.equal(update.action, "UPDATE")
  assert.deepEqual(update.preservedFields, ["handling", "kicking", "positioning", "reflexes"])
  assert.deepEqual(update.after, { ...attributes, diving: 91 })
})

test("blocks missing identity, outfield players and invalid values", () => {
  assert.equal(planEaGoalkeeperAttributesWrite({ sourceIndex: 0, sourcePage: 0,
    player: { externalId: "404", name: "Missing", position: "GOL", goalkeeperAttributes: attributes },
    current: null }).action, "CONFLICT")
  assert.equal(planEaGoalkeeperAttributesWrite({ sourceIndex: 0, sourcePage: 0,
    player: { externalId: "1", name: "Outfield", position: "MC", goalkeeperAttributes: attributes },
    current: { ...player(null), position: "MC" } }).action, "INVALID")
  assert.equal(plan(player(null), { ...attributes, reflexes: 100 }).action, "INVALID")
})

test("commits a scoped CREATE with provenance and isolated cursor", async () => {
  const fake = fakeStore()
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, request())
  assert.equal(output.status, "COMMITTED")
  assert.equal(output.written, 1)
  assert.equal(output.retries, 0)
  assert.equal(fake.state().writes, 1)
  assert.equal(fake.state().provenanceWrites, 1)
  assert.equal(fake.state().cursor?.key, EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY)
  assert.equal(fake.state().cursor?.offset, 11)
})

test("NO_OP records confirmed provenance but does not touch GK state", async () => {
  const base = player(attributes)
  const current = { ...base, attributes: { ...base.attributes!, payloadHash: eaGoalkeeperPayloadHash("1", attributes) } }
  const fake = fakeStore({ current })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, request(current, [plan(current)]))
  assert.equal(output.status, "COMMITTED")
  assert.equal(output.written, 0)
  assert.equal(fake.state().writes, 0)
  assert.equal(fake.state().provenanceWrites, 1)
  assert.deepEqual(fake.state().current, current)
})

test("invalid or out-of-scope plans stop before transaction", async () => {
  const current = player(null)
  const invalid = { ...plan(current), action: "INVALID" as const, reason: "INVALID" }
  const fake = fakeStore({ current })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, request(current, [invalid]))
  assert.equal(output.status, "BLOCKED")
  assert.equal(output.transactionState, "NOT_STARTED")
  assert.equal(fake.state().provenanceWrites, 0)
  const scoped = plan(current)
  const withSpeed = { ...scoped, after: { ...scoped.after!, speed: 75 } } as unknown as EaGoalkeeperWritePlan
  assert.equal((await persistEaGoalkeeperBatchAtomically(fake.store, request(current, [withSpeed]))).status, "BLOCKED")
})

test("CAS mismatch, mutation failure and protected audit mismatch fail safely", async () => {
  const expected = player(null)
  const changed = { ...expected, playerUpdatedAt: "2026-09-21T01:00:00.000Z" }
  const concurrent = await persistEaGoalkeeperBatchAtomically(fakeStore({ current: changed }).store, request(expected))
  assert.equal(concurrent.status, "CONCURRENT_MODIFICATION")
  const failed = fakeStore({ failMutation: true })
  const rolledBack = await persistEaGoalkeeperBatchAtomically(failed.store, request())
  assert.equal(rolledBack.status, "ROLLED_BACK")
  assert.equal(failed.state().writes, 0)
  assert.equal(failed.state().provenanceWrites, 0)
  const audit = await persistEaGoalkeeperBatchAtomically(fakeStore({ corruptAudit: true }).store, request())
  assert.equal(audit.status, "AUDIT_MISMATCH")
})

test("unknown commit acknowledgement stops with COMMIT_INDETERMINATE and zero retry", async () => {
  const output = await persistEaGoalkeeperBatchAtomically(fakeStore({ indeterminate: true }).store, request())
  assert.equal(output.status, "INDETERMINATE_COMMIT")
  assert.equal(output.transactionState, "COMMIT_INDETERMINATE")
  assert.equal(output.retries, 0)
})

test("partial resume requires the exact persisted cursor", async () => {
  const cursor: EaGoalkeeperCursor = { key: EA_GOALKEEPER_ATTRIBUTES_SYNC_KEY, offset: 100, batchSize: 50,
    status: "running", updatedAt: "2026-09-21T00:00:00.000Z" }
  const current = player(null)
  const fake = fakeStore({ current, cursor })
  const stale = { ...request(current), sourceOffset: 0, nextOffset: 11, expectedCursor: null }
  assert.equal((await persistEaGoalkeeperBatchAtomically(fake.store, stale)).status, "CONCURRENT_MODIFICATION")
})

test("runner mode gate keeps dry-run read-only and write explicitly disabled", () => {
  assert.equal(parseEaGoalkeeperSyncMode(["--dry-run"], {}), "dry-run")
  assert.throws(() => parseEaGoalkeeperSyncMode(["--write"], {}), /WRITE_DISABLED/)
  assert.equal(parseEaGoalkeeperSyncMode(["--write"], { EA_GOALKEEPER_ATTRIBUTES_WRITE_ENABLED: "true" }), "write")
  assert.throws(() => parseEaGoalkeeperSyncMode(["--dry-run", "--write"], {}))
})

test("Prisma adapter is Serializable, field-scoped and protects Player/Current Club/Position cursor", () => {
  const adapter = readFileSync("services/prismaEaGoalkeeperAttributesSyncStore.ts", "utf8")
  assert.match(adapter, /isolationLevel:\s*"Serializable"/)
  assert.match(adapter, /"Player"/)
  assert.match(adapter, /PlayerCurrentClubProposal/)
  assert.match(adapter, /ea-ratings-players:fc27:position-write-v1/)
  assert.doesNotMatch(adapter, /tx\.player\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/)
  assert.doesNotMatch(adapter, /playerAttributes\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/)
})

test("dry-run runner never constructs the write store unless mode is write", () => {
  const source = readFileSync("sync/runEAGoalkeeperAttributesSync.ts", "utf8")
  assert.match(source, /if \(mode === "write"\)/)
  assert.match(source, /writesExecuted:\s*mode === "write"/)
  assert.match(source, /EA_GOALKEEPER_BATCH_SIZE/)
})
