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
  runEaGoalkeeperReadBackQuery,
  verifyEaGoalkeeperReadBack,
  type EaGoalkeeperAudit,
  type EaGoalkeeperCursor,
  type EaGoalkeeperOperationalState,
  type EaGoalkeeperReadBackCategory,
  type EaGoalkeeperWritePlan,
  type EaGoalkeeperWriteRequest,
  type EaGoalkeeperWriteStore,
  type EaGoalkeeperWriteTransaction,
} from "../../../services/eaGoalkeeperAttributesSync"
import { parseEaGoalkeeperSyncMode } from "../../../sync/eaGoalkeeperAttributesSyncRunnerOptions"
import { createPrismaEaGoalkeeperWriteStore } from "../../../services/prismaEaGoalkeeperAttributesSyncStore"
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

function request50(): { request: EaGoalkeeperWriteRequest; players: EaGoalkeeperOperationalState[] } {
  const players = Array.from({ length: 50 }, (_, index) => ({ ...player(null), playerId: `player-${index + 1}`,
    externalId: String(index + 1), name: `Keeper ${index + 1}` }))
  const plans = players.map((current, index) => planEaGoalkeeperAttributesWrite({ sourceIndex: index,
    sourcePage: 0, player: { externalId: current.externalId, name: current.name, position: "GOL",
      goalkeeperAttributes: attributes }, current }))
  return { players, request: { ...request(players[0]!, plans), nextOffset: 414,
    sourcePages: [{ pageIndex: 0, provenance, batchHash: "batch-hash", externalIds: plans.map(item => item.externalId) }] } }
}

type FakeOptions = { failMutation?: boolean; indeterminate?: boolean; corruptAudit?: boolean;
  postAuditError?: Error; shortCreateCount?: boolean;
  onAudit?: (afterCommit: boolean) => void; onTransaction?: () => void;
  failMutationCode?: string;
  players?: EaGoalkeeperOperationalState[]
  readBackFailure?: { ok: false; category: EaGoalkeeperReadBackCategory; externalId: string }
  readBackError?: Error & { code?: string }
  readBackErrorStep?: "PLAYER_STATE_READ" | "SOURCE_OBSERVATION_READ"
  current?: EaGoalkeeperOperationalState; cursor?: EaGoalkeeperCursor | null }

function fakeStore(options: FakeOptions = {}) {
  let currents = new Map((options.players ?? [options.current ?? player(null)]).map(item =>
    [item.externalId, structuredClone(item)] as const))
  let cursor = structuredClone(options.cursor ?? null)
  let writes = 0
  let provenanceWrites = 0
  let readPlayersCalls = 0
  let createAttributesBatchCalls = 0
  let verifyCalls = 0
  let updateAttributesCalls = 0
  let transactionFinished = false
  let transactionCalls = 0
  const historical = { offset: 16228, updatedAt: "2026-09-20T00:00:00.000Z" }
  const baseAudit: EaGoalkeeperAudit = {
    protected: { Player: { count: "16228", hash: "players" }, PlayerAttributes: { count: "16228", hash: "attrs" } },
    historicalCheckpoint: historical,
    positionCursor: { offset: 16228, updatedAt: "2026-09-20T00:00:00.000Z" },
  }
  const store: EaGoalkeeperWriteStore = {
    async audit() {
      options.onAudit?.(transactionFinished)
      if (transactionFinished && options.postAuditError) throw options.postAuditError
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
      transactionCalls++
      options.onTransaction?.()
      const before = structuredClone({ currents, cursor, writes, provenanceWrites })
      const tx: EaGoalkeeperWriteTransaction = {
        async readHistoricalCheckpoint() { return historical },
        async readCursor() { return cursor },
        async readPlayers(externalIds) {
          readPlayersCalls++
          return new Map(externalIds.flatMap(id => {
            const value = currents.get(id)
            return value ? [[id, structuredClone(value)] as const] : []
          }))
        },
        async createProvenance(page) { provenanceWrites++; return `obs-${page.pageIndex}` },
        async createAttributesBatch(items) {
          createAttributesBatchCalls++
          if (options.failMutation) {
            const error = new Error("database failure with secret-query-param") as Error & { cause?: unknown }
            if (options.failMutationCode) {
              error.cause = Object.assign(new Error("nested private adapter detail"), { code: options.failMutationCode })
            }
            throw error
          }
          for (const { plan: item, observationId, observedAt } of items) {
            const current = currents.get(item.externalId)!
            currents.set(item.externalId, { ...current, attributes: { id: `gk-${item.externalId}`, ...item.after!,
              payloadHash: item.payloadHash, updatedAt: observedAt.toISOString() } })
            assert.equal(observationId, `obs-${item.sourcePage}`)
            writes++
          }
          return options.shortCreateCount ? items.length - 1 : items.length
        },
        async updateAttributes(item, expected, observationId, observedAt) {
          updateAttributesCalls++
          if (options.failMutation) {
            const error = new Error("database failure with secret-query-param") as Error & { cause?: unknown }
            if (options.failMutationCode) {
              error.cause = Object.assign(new Error("nested private adapter detail"), { code: options.failMutationCode })
            }
            throw error
          }
          const current = currents.get(item.externalId)!
          assert.deepEqual(current, expected)
          currents.set(item.externalId, { ...current, attributes: { id: current.attributes?.id ?? "gk-1", ...item.after!,
            payloadHash: item.payloadHash, updatedAt: observedAt.toISOString() } })
          assert.equal(observationId, `obs-${item.sourcePage}`)
          writes++
          return 1
        },
        async verify(items, observationIds) {
          verifyCalls++
          if (options.readBackError) {
            return runEaGoalkeeperReadBackQuery({ step: options.readBackErrorStep ?? "PLAYER_STATE_READ",
              externalId: items[0]!.externalId,
              query: async () => { throw options.readBackError } })
          }
          if (options.readBackFailure) return options.readBackFailure
          for (const item of items) {
            const persisted = currents.get(item.externalId) ?? null
            const result = verifyEaGoalkeeperReadBack({ plan: item, current: persisted,
              expectedSourceObservationId: observationIds.get(item.sourcePage),
              persistedSourceObservationId: item.action === "NO_OP" ? undefined : `obs-${item.sourcePage}` })
            if (!result.ok) return result
          }
          return { ok: true }
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
        if (!options.indeterminate) ({ currents, cursor, writes, provenanceWrites } = before)
        throw error
      }
    },
  }
  return { store, state: () => ({ current: [...currents.values()][0], players: [...currents.values()],
    cursor, writes, provenanceWrites, transactionCalls,
    readPlayersCalls, createAttributesBatchCalls, verifyCalls, updateAttributesCalls }) }
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

test("read-back reports the first safe divergence by identity, row, individual GK value, hash, or provenance link", () => {
  const targetPlan = plan()
  const expected = {
    plan: targetPlan,
    current: { ...player(attributes), attributes: { id: "gk-1", ...attributes,
      payloadHash: targetPlan.payloadHash, updatedAt: "2026-09-21T00:00:00.000Z" } },
    expectedSourceObservationId: "obs-0",
    persistedSourceObservationId: "obs-0",
  }
  assert.deepEqual(verifyEaGoalkeeperReadBack(expected), { ok: true })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected, current: null }), {
    ok: false, category: "PLAYER_OR_POSITION", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, playerId: "different-player" } }), {
    ok: false, category: "PLAYER_OR_POSITION", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, position: "MC" } }), {
    ok: false, category: "PLAYER_OR_POSITION", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, attributes: null } }), {
    ok: false, category: "GK_ROW_MISSING", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    plan: { ...expected.plan, after: null } }), {
    ok: false, category: "INVALID_PLAN", externalId: "1",
  })

  const mismatchCategories = {
    diving: "GK_DIVING_MISMATCH",
    handling: "GK_HANDLING_MISMATCH",
    kicking: "GK_KICKING_MISMATCH",
    positioning: "GK_POSITIONING_MISMATCH",
    reflexes: "GK_REFLEXES_MISMATCH",
  } as const
  for (const [field, category] of Object.entries(mismatchCategories) as
      [keyof typeof mismatchCategories, typeof mismatchCategories[keyof typeof mismatchCategories]][]) {
    const current = { ...expected.current, attributes: { ...expected.current.attributes!, [field]: 1 } }
    assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected, current }), {
      ok: false, category, externalId: "1",
    })
  }
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, attributes: { ...expected.current.attributes!, payloadHash: "different" } } }), {
    ok: false, category: "PAYLOAD_HASH_MISMATCH", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected, persistedSourceObservationId: "other-observation" }), {
    ok: false, category: "SOURCE_OBSERVATION_MISMATCH", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected, expectedSourceObservationId: undefined,
    persistedSourceObservationId: undefined }), {
    ok: false, category: "SOURCE_OBSERVATION_MISMATCH", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, position: "MC", attributes: null } }), {
    ok: false, category: "PLAYER_OR_POSITION", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, attributes: { ...expected.current.attributes!, diving: 1, payloadHash: "different" } },
    persistedSourceObservationId: "other-observation" }), {
    ok: false, category: "GK_DIVING_MISMATCH", externalId: "1",
  })
  assert.deepEqual(verifyEaGoalkeeperReadBack({ ...expected,
    current: { ...expected.current, attributes: { ...expected.current.attributes!, payloadHash: "different" } },
    persistedSourceObservationId: "other-observation" }), {
    ok: false, category: "PAYLOAD_HASH_MISMATCH", externalId: "1",
  })
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

test("processes a 50-player CREATE batch with batched identity and read-back queries", async () => {
  const batch = request50()
  const fake = fakeStore({ players: batch.players })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, batch.request)
  assert.equal(output.status, "COMMITTED")
  assert.equal(output.written, 50)
  assert.equal(output.retries, 0)
  assert.equal(fake.state().readPlayersCalls, 1)
  assert.equal(fake.state().createAttributesBatchCalls, 1)
  assert.equal(fake.state().verifyCalls, 1)
  assert.equal(fake.state().updateAttributesCalls, 0)
  assert.equal(fake.state().provenanceWrites, 1)
  assert.equal(fake.state().cursor?.offset, 414)
  assert.equal(typeof output.timing?.transactionTotalMs, "number")
  assert.equal(typeof output.timing?.phasesMs.PLAYER_REVALIDATION, "number")
  assert.equal(typeof output.timing?.phasesMs.READ_BACK, "number")
})

test("audit time is separate from transaction wall time, including on audit mismatch", async () => {
  for (const corruptAudit of [false, true]) {
    let clock = 0
    const fake = fakeStore({ corruptAudit,
      onAudit: after => { clock += after ? 9000 : 1000 },
      onTransaction: () => { clock += 25 } })
    const output = await persistEaGoalkeeperBatchAtomically(fake.store, request(), undefined, () => clock)
    assert.equal(output.status, corruptAudit ? "AUDIT_MISMATCH" : "COMMITTED")
    assert.equal(output.transactionState, "COMMIT_CONFIRMED")
    assert.equal(output.timing?.transactionTotalMs, 25)
    assert.equal(output.timing?.unmeasuredOverheadMs, 25)
    assert.equal(output.timing?.preAuditMs, 1000)
    assert.equal(output.timing?.postAuditMs, 9000)
  }
})

test("post-commit audit exception preserves confirmed writes and provenance without retry", async () => {
  const batch = request50()
  let clock = 0
  const fake = fakeStore({ players: batch.players,
    postAuditError: Object.assign(new Error("private SQL URL credentials"), { code: "P2028" }),
    onAudit: after => { if (after) clock += 8000 }, onTransaction: () => { clock += 30 } })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, batch.request, undefined, () => clock)
  assert.equal(output.status, "AUDIT_FAILED")
  assert.equal(output.reason, "POST_COMMIT_AUDIT_FAILED")
  assert.equal(output.transactionState, "COMMIT_CONFIRMED")
  assert.equal(output.written, 50)
  assert.deepEqual(output.provenanceIds, ["obs-0"])
  assert.deepEqual(output.diagnostic, { phase: "POST_COMMIT_AUDIT", code: "P2028" })
  assert.equal(output.timing?.transactionTotalMs, 30)
  assert.equal(output.timing?.postAuditMs, 8000)
  assert.equal(output.retries, 0)
  assert.equal(fake.state().transactionCalls, 1)
  assert.equal(fake.state().writes, 50)
  assert.equal(fake.state().cursor?.offset, 414)
  assert.doesNotMatch(JSON.stringify(output), /private SQL|credentials|URL/)
})

test("short createMany count rolls back all simulated rows, provenance and cursor", async () => {
  const batch = request50()
  const fake = fakeStore({ players: batch.players, shortCreateCount: true })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, batch.request)
  assert.equal(output.status, "CONCURRENT_MODIFICATION")
  assert.equal(output.reason, "GOALKEEPER_CAS_FAILED")
  assert.equal(output.transactionState, "ROLLED_BACK")
  assert.equal(output.written, 0)
  assert.deepEqual(output.provenanceIds, [])
  assert.deepEqual(fake.state().players, batch.players)
  assert.equal(fake.state().writes, 0)
  assert.equal(fake.state().provenanceWrites, 0)
  assert.equal(fake.state().cursor, null)
  assert.equal(fake.state().verifyCalls, 0)
  assert.equal(fake.state().transactionCalls, 1)
  assert.equal(output.retries, 0)
})

test("Prisma adapter batches reads/creates and keeps source provenance outside the CAS state", async () => {
  const batch = request50()
  const existing = { ...batch.players[0]!, attributes: { id: "gk-1", ...attributes, payloadHash: "old-hash",
    updatedAt: batch.players[0]!.playerUpdatedAt } }
  const updatePlan = planEaGoalkeeperAttributesWrite({ sourceIndex: 0, sourcePage: 0,
    player: { externalId: existing.externalId, name: existing.name, position: "GOL",
      goalkeeperAttributes: { ...attributes, diving: 91 } }, current: existing })
  assert.equal(updatePlan.action, "UPDATE")
  const plans = [updatePlan, ...batch.request.plans.slice(1)]
  const byId = new Map(batch.players.map(item => [item.playerId, {
    id: item.playerId, externalId: item.externalId, name: item.name, position: item.position,
    dateOfBirth: null, officialOverall: 85, attributes: null,
    updatedAt: new Date(item.playerUpdatedAt), goalkeeperAttributes: null as null | Record<string, unknown>,
  }]))
  byId.get(existing.playerId)!.goalkeeperAttributes = { ...existing.attributes,
    updatedAt: new Date(existing.attributes.updatedAt), sourceObservationId: "previous-observation" }
  let playerFindManyCalls = 0
  let createManyCalls = 0
  let updateManyCalls = 0
  let historyCreates = 0
  let historyLinks = 0
  const tx = {
    eaCatalogObservation: { create: async () => ({ id: "obs-0" }) },
    eaPlayerRatingSnapshot: { createMany: async ({ data }: { data: unknown[] }) => {
      historyCreates += data.length; return { count: data.length }
    }, findMany: async () => [...byId.values()].map(row => ({
      id: `history-${row.id}`, playerId: row.id, externalId: row.externalId,
    })) },
    eaPlayerCatalogObservation: { updateMany: async () => { historyLinks++; return { count: 1 } } },
    player: { async findMany({ where }: { where: { externalId?: { in: string[] }; id?: { in: string[] } } }) {
      playerFindManyCalls++
      const ids = new Set(where.externalId?.in ?? where.id?.in)
      return [...byId.values()].filter(row => ids.has(where.externalId ? row.externalId : row.id))
    } },
    playerGoalkeeperAttributes: { async createMany({ data }: { data: Array<Record<string, unknown> & { playerId: string }> }) {
      createManyCalls++
      for (const item of data) {
        const owner = [...byId.values()].find(row => row.id === item.playerId)!
        owner.goalkeeperAttributes = { id: `gk-${item.playerId}`, ...item, updatedAt: item.observedAt }
      }
      return { count: data.length }
    }, async updateMany({ where, data }: { where: { playerId: string; id: string; payloadHash: string; updatedAt: Date };
      data: Record<string, unknown> }) {
      updateManyCalls++
      const owner = [...byId.values()].find(row => row.id === where.playerId)!
      const actual = owner.goalkeeperAttributes!
      assert.equal(actual.id, where.id)
      assert.equal(actual.payloadHash, where.payloadHash)
      assert.equal((actual.updatedAt as Date).toISOString(), where.updatedAt.toISOString())
      owner.goalkeeperAttributes = { ...actual, ...data }
      return { count: 1 }
    } },
  }
  const db = { async $transaction<T>(work: (client: unknown) => Promise<T>) { return work(tx) } }
  const store = createPrismaEaGoalkeeperWriteStore(db as never, EA_GOALKEEPER_HISTORICAL_SYNC_KEY)
  await store.transaction(async port => {
    await port.createProvenance(batch.request.sourcePages[0]!, plans)
    const revalidated = await port.readPlayers(plans.map(item => item.externalId))
    assert.equal(revalidated.size, 50)
    assert.deepEqual(revalidated.get("1"), existing)
    const creates = plans.filter(item => item.action === "CREATE").map(plan => ({ plan, observationId: "obs-0",
      observedAt: provenance.observedAt }))
    assert.equal(await port.createAttributesBatch(creates), 49)
    assert.equal(await port.updateAttributes(updatePlan, revalidated.get("1")!, "obs-0", provenance.observedAt), 1)
    const verified = await port.verify(plans, new Map([[0, "obs-0"]]))
    assert.deepEqual(verified, { ok: true })
  })
  assert.equal(playerFindManyCalls, 4)
  assert.equal(historyCreates, 50)
  assert.equal(historyLinks, 50)
  assert.equal(createManyCalls, 1)
  assert.equal(updateManyCalls, 1)
})

test("50-player batch preserves conflict detection and rolls back every read-back divergence", async () => {
  const batch = request50()
  const changed = batch.players.map((item, index) => index === 32
    ? { ...item, playerUpdatedAt: "2026-09-22T00:00:00.000Z" } : item)
  const conflict = await persistEaGoalkeeperBatchAtomically(fakeStore({ players: changed }).store, batch.request)
  assert.equal(conflict.status, "CONCURRENT_MODIFICATION")
  assert.equal(conflict.reason, "PLAYER_OR_GK_STATE_CHANGED:33")

  const categories: EaGoalkeeperReadBackCategory[] = ["PLAYER_OR_POSITION", "GK_ROW_MISSING", "GK_DIVING_MISMATCH",
    "GK_HANDLING_MISMATCH", "GK_KICKING_MISMATCH", "GK_POSITIONING_MISMATCH", "GK_REFLEXES_MISMATCH",
    "PAYLOAD_HASH_MISMATCH", "SOURCE_OBSERVATION_MISMATCH"]
  for (const category of categories) {
    const fake = fakeStore({ players: batch.players,
      readBackFailure: { ok: false, category, externalId: "33" } })
    const output = await persistEaGoalkeeperBatchAtomically(fake.store, batch.request)
    assert.equal(output.status, "ROLLED_BACK")
    assert.equal(output.reason, "GOALKEEPER_READ_BACK_MISMATCH")
    assert.deepEqual(output.diagnostic, { phase: "READ_BACK", code: null, category, externalId: "33" })
    assert.equal(output.timing?.transactionTotalMs !== undefined, true)
    assert.equal(output.retries, 0)
    assert.equal(fake.state().writes, 0)
    assert.equal(fake.state().provenanceWrites, 0)
    assert.equal(fake.state().cursor, null)
  }

  const failed = fakeStore({ players: batch.players, failMutation: true })
  const rollback = await persistEaGoalkeeperBatchAtomically(failed.store, batch.request)
  assert.equal(rollback.status, "ROLLED_BACK")
  assert.equal(failed.state().writes, 0)
  assert.equal(failed.state().provenanceWrites, 0)
  assert.equal(failed.state().cursor, null)
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

test("reports only safe phase and database code for a rolled-back transaction failure", async () => {
  const failed = fakeStore({ failMutation: true, failMutationCode: "42501" })
  const output = await persistEaGoalkeeperBatchAtomically(failed.store, request())
  assert.equal(output.status, "ROLLED_BACK")
  assert.equal(output.reason, "TRANSACTION_FAILED")
  assert.deepEqual(output.diagnostic, { phase: "GK_ATTRIBUTE_CREATE", code: "42501" })
  assert.equal(output.retries, 0)
  assert.equal(failed.state().writes, 0)
  assert.equal(failed.state().provenanceWrites, 0)
  assert.doesNotMatch(JSON.stringify(output), /secret-query-param|database failure|nested private adapter detail/)
})

test("every read-back divergence preserves the public reason and rolls back with only safe diagnostic data", async () => {
  const categories: EaGoalkeeperReadBackCategory[] = [
    "PLAYER_OR_POSITION", "GK_ROW_MISSING", "GK_DIVING_MISMATCH", "GK_HANDLING_MISMATCH",
    "GK_KICKING_MISMATCH", "GK_POSITIONING_MISMATCH", "GK_REFLEXES_MISMATCH",
    "PAYLOAD_HASH_MISMATCH", "SOURCE_OBSERVATION_MISMATCH",
  ]
  for (const category of categories) {
    const failed = fakeStore({ readBackFailure: { ok: false, category, externalId: "1" } })
    const output = await persistEaGoalkeeperBatchAtomically(failed.store, request())
    assert.equal(output.status, "ROLLED_BACK")
    assert.equal(output.reason, "GOALKEEPER_READ_BACK_MISMATCH")
    assert.deepEqual(output.diagnostic, { phase: "READ_BACK", code: null, category, externalId: "1" })
    assert.equal(output.retries, 0)
    assert.equal(failed.state().writes, 0)
    assert.equal(failed.state().provenanceWrites, 0)
    assert.equal(failed.state().cursor, null)
    assert.doesNotMatch(JSON.stringify(output), /"(?:88|86|84|89|90)"/)
  }
})

test("read-back query wrapper identifies both safe failure steps and elapsed time", async () => {
  const cause = Object.assign(new Error("private SQL and connection detail"), { code: "P2028" })
  for (const step of ["PLAYER_STATE_READ", "SOURCE_OBSERVATION_READ"] as const) {
    let clock = 100
    await assert.rejects(runEaGoalkeeperReadBackQuery({ step, externalId: "ea-123", now: () => clock,
      query: async () => { clock = 137; throw cause } }), error => {
      const failure = error as Error & { step: string; externalId: string; elapsedMs: number; cause: unknown }
      assert.equal(failure.name, "EaGoalkeeperReadBackStoreError")
      assert.equal(failure.step, step)
      assert.equal(failure.externalId, "ea-123")
      assert.equal(failure.elapsedMs, 37)
      assert.equal(failure.cause, cause)
      return true
    })
  }
})

test("read-back storage error preserves public failure and emits only safe diagnostic metadata", async () => {
  const failure = Object.assign(new Error("private SQL, URL, and payload"), { code: "P2028" })
  for (const step of ["PLAYER_STATE_READ", "SOURCE_OBSERVATION_READ"] as const) {
    const failed = fakeStore({ readBackError: failure, readBackErrorStep: step })
    const output = await persistEaGoalkeeperBatchAtomically(failed.store, request())
    assert.equal(output.status, "ROLLED_BACK")
    assert.equal(output.reason, "TRANSACTION_FAILED")
    assert.equal(output.diagnostic?.phase, "READ_BACK")
    assert.equal(output.diagnostic?.code, "P2028")
    assert.equal(output.diagnostic?.readBack?.step, step)
    assert.equal(output.diagnostic?.readBack?.externalId, "1")
    assert.equal(typeof output.diagnostic?.readBack?.elapsedMs, "number")
    assert.equal(output.retries, 0)
    assert.equal(failed.state().writes, 0)
    assert.equal(failed.state().provenanceWrites, 0)
    assert.equal(failed.state().cursor, null)
    assert.doesNotMatch(JSON.stringify(output), /private SQL|URL|payload|connection detail/)
  }
})

test("unknown commit acknowledgement stops with COMMIT_INDETERMINATE and zero retry", async () => {
  let clock = 0
  const fake = fakeStore({ indeterminate: true, onTransaction: () => { clock += 40 } })
  const output = await persistEaGoalkeeperBatchAtomically(fake.store, request(), undefined, () => clock)
  assert.equal(output.status, "INDETERMINATE_COMMIT")
  assert.equal(output.transactionState, "COMMIT_INDETERMINATE")
  assert.equal(output.retries, 0)
  assert.equal(fake.state().transactionCalls, 1)
  assert.equal(output.timing?.transactionTotalMs, 40)
  assert.equal(output.timing?.postAuditMs, null)
  assert.equal(output.diagnostic?.phase, "COMMIT")
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
  assert.match(source, /if \(writeResult.status !== "COMMITTED"\) process.exitCode = 1/)
  assert.match(source, /provenancePersisted:.*transactionState === "COMMIT_CONFIRMED"/)
  assert.match(source, /cursorChanged:.*transactionState === "COMMIT_CONFIRMED"/)
})
