import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { normalizePosition } from "../../../normalizers/normalizePosition"
import {
  EA_POSITION_HISTORICAL_SYNC_KEY,
  EA_POSITION_SYNC_KEY,
  canonicalEaPositionValues,
  eaPositionStateHash,
  persistEaPositionBatchAtomically,
  planEaPositionSync,
  type EaPositionAudit,
  type EaPositionCursor,
  type EaPositionPlan,
  type EaPositionPlayerState,
  type EaPositionWriteRequest,
  type EaPositionWriteStore,
} from "../../../services/eaPositionSync"
import type { PlayerPosition } from "../../../types/player"

const timestamp = "2026-09-19T00:00:00.000Z"
const historical = { offset: 16228, updatedAt: "2026-08-29T14:43:48.873Z" }

function player(overrides: Partial<EaPositionPlayerState> = {}): EaPositionPlayerState {
  return {
    id: "player-1",
    externalId: "100",
    name: "Player One",
    position: "PD",
    secondaryPosition: null,
    secondaryPositions: [],
    updatedAt: timestamp,
    ...overrides,
  }
}

function plan(current = player(), overrides: Partial<EaPositionPlan> = {}): EaPositionPlan {
  return {
    sourceIndex: 0,
    playerId: current.id,
    externalId: current.externalId,
    name: current.name,
    status: "READY",
    reason: "POSITION_CHANGE_READY",
    before: canonicalEaPositionValues(current),
    after: { position: "MD", secondaryPosition: "PD", secondaryPositions: ["PD"] },
    changedFields: ["position", "secondaryPosition", "secondaryPositions"],
    sourceChangedFields: ["position", "secondaryPosition", "secondaryPositions"],
    payloadHash: `hash-${current.externalId}`,
    expectedUpdatedAt: current.updatedAt,
    expectedStateHash: eaPositionStateHash(current),
    ...overrides,
  }
}

function provenance(offset: number, limit: number, totalItems = 16228) {
  return {
    provider: "ea-ratings" as const,
    endpoint: "https://drop-api.ea.com/rating/ea-sports-fc",
    eaGameVersion: "FC27",
    gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT" as const,
    gameVersionEvidenceUrl: "https://www.ea.com/games/ea-sports-fc/ratings",
    catalogVersion: null,
    sourceUpdatedAt: null,
    observedAt: new Date("2026-09-19T00:00:00.000Z"),
    responseDate: null,
    etag: null,
    lastModified: null,
    locale: "en",
    gender: 0,
    requestOffset: offset,
    requestLimit: limit,
    totalItems,
  }
}

function request(plans: EaPositionPlan[], input: Partial<EaPositionWriteRequest> = {}): EaPositionWriteRequest {
  const sourceOffset = input.sourceOffset ?? 0
  const batchSize = input.batchSize ?? plans.length
  return {
    key: EA_POSITION_SYNC_KEY,
    historicalKey: EA_POSITION_HISTORICAL_SYNC_KEY,
    expectedHistoricalCheckpoint: historical,
    expectedCursor: input.expectedCursor ?? null,
    sourceOffset,
    sourceReceived: plans.length,
    batchSize,
    totalItems: input.totalItems ?? 16228,
    provenance: provenance(sourceOffset, batchSize, input.totalItems ?? 16228),
    batchHash: `batch-${sourceOffset}`,
    plans,
    ...input,
  }
}

type FakeState = {
  players: Map<string, EaPositionPlayerState>
  cursor: EaPositionCursor | null
  provenance: string[]
  protected: Record<string, { count: string; hash: string }>
}

function fakeStore(initialPlayers = [player()], options: {
  failUpdate?: boolean
  failVerification?: boolean
  throwAfterCommit?: boolean
  corruptProtected?: boolean
} = {}) {
  let state: FakeState = {
    players: new Map(initialPlayers.map(item => [item.externalId, structuredClone(item)])),
    cursor: null,
    provenance: [],
    protected: { PlayerCurrentClubProposal: { count: "6", hash: "current-club-v2" } },
  }
  let transactions = 0
  const audit = (): EaPositionAudit => ({
    protected: structuredClone(state.protected),
    historicalCheckpoint: historical,
  })
  const store: EaPositionWriteStore = {
    audit: async () => audit(),
    async transaction(work) {
      transactions++
      const draft = structuredClone(state)
      const result = await work({
        readHistoricalCheckpoint: async key => key === EA_POSITION_HISTORICAL_SYNC_KEY ? historical : null,
        readCursor: async key => key === EA_POSITION_SYNC_KEY ? structuredClone(draft.cursor) : null,
        readPlayer: async externalId => structuredClone(draft.players.get(externalId) ?? null),
        async updatePositions(expected, after) {
          if (options.failUpdate) throw new Error("WRITE_FAILED")
          const current = draft.players.get(expected.externalId)
          if (!current || current.updatedAt !== expected.updatedAt) return 0
          draft.players.set(expected.externalId, { ...current, ...structuredClone(after),
            updatedAt: "2026-09-19T00:00:01.000Z" })
          return 1
        },
        async verifyPositions(plans) {
          if (options.failVerification) return false
          return plans.every(plan => {
            const current = draft.players.get(plan.externalId)
            return current !== undefined && plan.after !== null &&
              current.position === plan.after.position &&
              current.secondaryPosition === plan.after.secondaryPosition &&
              JSON.stringify(current.secondaryPositions) === JSON.stringify(plan.after.secondaryPositions)
          })
        },
        async createProvenance(input) {
          draft.provenance.push(...input.plans.map(item => `${item.externalId}:${item.changedFields.join(",")}`))
          return `observation-${draft.provenance.length}`
        },
        async advanceCursor(input) {
          if (input.expected && draft.cursor?.updatedAt !== input.expected.updatedAt) return 0
          if (!input.expected && draft.cursor) return 0
          draft.cursor = { key: input.key, offset: input.offset, batchSize: input.batchSize,
            status: input.completed ? "completed" : "running", updatedAt: input.now.toISOString() }
          return 1
        },
      })
      state = draft
      if (options.corruptProtected) state.protected.PlayerCurrentClubProposal.hash = "changed"
      if (options.throwAfterCommit) throw new Error("CONNECTION_LOST_AFTER_COMMIT")
      return result
    },
  }
  return { store, state: () => state, transactions: () => transactions }
}

test("taxonomia validada preserva RM/LM/RW/LW", () => {
  assert.equal(normalizePosition("RM"), "MD")
  assert.equal(normalizePosition("LM"), "ME")
  assert.equal(normalizePosition("RW"), "PD")
  assert.equal(normalizePosition("LW"), "PE")
})

test("canonicaliza, deduplica, ordena e remove a posição principal das alternativas", () => {
  assert.deepEqual(canonicalEaPositionValues({ position: "MD", secondaryPosition: "ME",
    secondaryPositions: ["PD", "ME", "PD", "MD"] }), {
    position: "MD",
    secondaryPosition: "ME",
    secondaryPositions: ["ME", "PD"],
  })
})

test("planeja Lamine genericamente como MD principal e PD alternativa", () => {
  const current = player({ externalId: "277643", name: "Lamine Yamal" })
  const result = planEaPositionSync({ sourceIndex: 12, current, player: {
    externalId: "277643", name: "Lamine Yamal", position: normalizePosition("RM"),
    secondaryPosition: normalizePosition("RW"), secondaryPositions: [normalizePosition("RW")],
  }, semantic: { action: "UPDATE", changedFields: ["position", "secondaryPosition", "secondaryPositions"],
    payloadHash: "lamine-hash", reason: null } })
  assert.equal(result.status, "READY")
  assert.deepEqual(result.after, { position: "MD", secondaryPosition: "PD", secondaryPositions: ["PD"] })
})

test("NO_OP preserva updatedAt e não cria plano de escrita", () => {
  const current = player({ position: "MD", secondaryPosition: "PD", secondaryPositions: ["PD"] })
  const result = planEaPositionSync({ sourceIndex: 0, current, player: {
    externalId: current.externalId,
    name: current.name,
    position: current.position,
    secondaryPosition: current.secondaryPosition ?? undefined,
    secondaryPositions: current.secondaryPositions,
  },
    semantic: { action: "NO_OP", changedFields: [], payloadHash: "same", reason: null } })
  assert.equal(result.status, "NO_OP")
  assert.deepEqual(result.changedFields, [])
  assert.equal(result.expectedUpdatedAt, current.updatedAt)
})

test("identidade ausente ou posição desconhecida é rejeitada", () => {
  const missing = planEaPositionSync({ sourceIndex: 0, current: null, player: {
    externalId: "404", name: "Missing", position: "PD", secondaryPositions: [],
  }, semantic: { action: "CREATE", changedFields: ["player"], payloadHash: "x", reason: null } })
  assert.equal(missing.status, "CONFLICT")
  assert.throws(() => canonicalEaPositionValues({ position: "XYZ" as PlayerPosition,
    secondaryPositions: [] }), /EA_POSITION_PRIMARY_INVALID/)
})

test("field scope bloqueia qualquer propriedade fora dos três campos autorizados", async () => {
  const fake = fakeStore()
  const unsafe = plan(player(), { after: { position: "MD", secondaryPosition: "PD",
    secondaryPositions: ["PD"], officialOverall: 99 } as never })
  const result = await persistEaPositionBatchAtomically(fake.store, request([unsafe]))
  assert.equal(result.status, "BLOCKED")
  assert.equal(fake.transactions(), 0)
})

test("batch atômico grava somente posições, provenance e cursor isolado", async () => {
  const first = player()
  const second = player({ id: "player-2", externalId: "200", name: "Player Two", position: "ME" })
  const fake = fakeStore([first, second])
  const noOp = plan(second, { sourceIndex: 1, status: "NO_OP", reason: "POSITION_SEMANTICALLY_EQUAL",
    before: canonicalEaPositionValues(second), after: canonicalEaPositionValues(second), changedFields: [] })
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan(first), noOp]),
    () => new Date("2026-09-19T00:01:00.000Z"))
  assert.equal(result.status, "COMMITTED")
  assert.equal(result.written, 1)
  assert.equal(fake.state().cursor?.key, EA_POSITION_SYNC_KEY)
  assert.equal(fake.state().cursor?.offset, 2)
  assert.equal(fake.state().provenance.length, 2)
  assert.deepEqual(fake.state().protected.PlayerCurrentClubProposal, { count: "6", hash: "current-club-v2" })
})

test("CAS interrompe lote e não avança cursor", async () => {
  const current = player({ updatedAt: "2026-09-19T00:00:05.000Z" })
  const expected = player()
  const fake = fakeStore([current])
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan(expected)]))
  assert.equal(result.status, "CONCURRENT_MODIFICATION")
  assert.equal(fake.state().cursor, null)
  assert.equal(fake.state().provenance.length, 0)
})

test("falha no update faz rollback do batch inteiro", async () => {
  const fake = fakeStore([player()], { failUpdate: true })
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan()]))
  assert.equal(result.status, "ROLLED_BACK")
  assert.equal(fake.state().players.get("100")?.position, "PD")
  assert.equal(fake.state().cursor, null)
  assert.equal(fake.state().provenance.length, 0)
})

test("read-back divergente reverte posições antes de provenance e cursor", async () => {
  const fake = fakeStore([player()], { failVerification: true })
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan()]))
  assert.equal(result.status, "ROLLED_BACK")
  assert.equal(result.reason, "POSITION_READ_BACK_MISMATCH")
  assert.equal(fake.state().players.get("100")?.position, "PD")
  assert.equal(fake.state().cursor, null)
  assert.equal(fake.state().provenance.length, 0)
})

test("partial resume preserva lote anterior e não pula o lote que falha", async () => {
  const first = player()
  const fake = fakeStore([first])
  const completed = await persistEaPositionBatchAtomically(fake.store, request([plan(first)]),
    () => new Date("2026-09-19T00:01:00.000Z"))
  assert.equal(completed.status, "COMMITTED")
  assert.equal(fake.state().cursor?.offset, 1)

  const second = player({ id: "player-2", externalId: "200", updatedAt: timestamp })
  fake.state().players.set(second.externalId, second)
  const staleCursor = structuredClone(fake.state().cursor)!
  const secondPlan = plan(second, { sourceIndex: 0, expectedStateHash: "stale" })
  const resumed = await persistEaPositionBatchAtomically(fake.store, request([secondPlan], {
    sourceOffset: 1,
    expectedCursor: staleCursor,
  }))
  assert.equal(resumed.status, "CONCURRENT_MODIFICATION")
  assert.equal(fake.state().cursor?.offset, 1)
  assert.equal(fake.state().players.get("100")?.position, "MD")
})

test("commit sem confirmação é classificado como indeterminado e nunca repetido", async () => {
  const fake = fakeStore([player()], { throwAfterCommit: true })
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan()]))
  assert.equal(result.status, "INDETERMINATE_COMMIT")
  assert.equal(result.transactionState, "COMMIT_INDETERMINATE")
  assert.equal(result.retries, 0)
  assert.equal(fake.transactions(), 1)
})

test("auditoria bloqueia sucesso se Current Club V2 mudar", async () => {
  const fake = fakeStore([player()], { corruptProtected: true })
  const result = await persistEaPositionBatchAtomically(fake.store, request([plan()]))
  assert.equal(result.status, "AUDIT_MISMATCH")
  assert.equal(result.transactionState, "COMMIT_CONFIRMED")
})

test("adapter Prisma usa Serializable e update estritamente field-scoped", () => {
  const source = readFileSync("services/prismaEaPositionSyncStore.ts", "utf8")
  assert.match(source, /isolationLevel:\s*"Serializable"/)
  const updateBlock = source.match(/tx\.player\.updateMany\([\s\S]*?return result\.count/)?.[0] ?? ""
  assert.match(updateBlock, /position:\s*after\.position/)
  assert.match(updateBlock, /secondaryPosition:\s*after\.secondaryPosition/)
  assert.match(updateBlock, /secondaryPositions:\s*after\.secondaryPositions/)
  assert.doesNotMatch(updateBlock, /officialOverall|potential|clubId|imageUrl/)
})

test("runner mantém dry-run sem writer e exige gate explícito para write", () => {
  const source = readFileSync("sync/runEAPositionSync.ts", "utf8")
  assert.match(source, /EA_POSITION_SYNC_WRITE_ENABLED !== "true"/)
  assert.match(source, /mode === "dry-run" \? 0 : initial\.cursor\?\.offset \?\? 0/)
  assert.match(source, /if \(mode === "write"\)/)
  assert.doesNotMatch(source, /EA_POSITION_SYNC_WRITE_ENABLED\s*=\s*["']true/)
})
