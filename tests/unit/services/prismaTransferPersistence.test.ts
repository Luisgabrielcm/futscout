import assert from "node:assert/strict"
import test from "node:test"
import type { PrismaClient, PlayerTransferObservation, PlayerCurrentClubState } from "../../../app/generated/prisma/client"
import { auditedObservation, auditedPlayers, auditedTransfers } from "../../fixtures/auditedTransfers"
import { createPrismaObservationStore, decodeTransferObservation } from "../../../services/prismaTransferObservationStore"
import { persistTransferObservations } from "../../../services/transferHistoryPersistence"
import { dryRunTransferPersistence, writeTransferPersistence, type TransferPersistenceInput } from "../../../services/transferProjectionPersistence"
import { readAuditedTransferPayloads, runTransferPersistenceUnits } from "../../../services/transferPersistencePilot"
import { TRANSFER_PILOT_PLAYERS } from "../../../services/transferObservationPilot"

const now = new Date(auditedTransfers.now)
const scope = auditedPlayers
const sourceHashes = Object.fromEntries(["Club", "ApiFootballTeamRosterCache", "ClubOfficialLineupSnapshot"].map(t => [t, { count: "1", hash: "fixture" }]))
const input = (index = 1): TransferPersistenceInput => ({ player: auditedPlayers[index], observation: auditedObservation(auditedPlayers[index].providerPlayerId),
  context: { clubs: auditedTransfers.clubs, rosters: auditedTransfers.rosters, lineups: auditedTransfers.lineups },
  expectedUpdatedAt: now.toISOString(), now, sourceHashes })

function fake(options: { wrongOwner?: boolean; failInsert?: number; failProjection?: boolean; tamper?: boolean; sourceChanged?: boolean } = {}) {
  let rows: PlayerTransferObservation[] = [], states: PlayerCurrentClubState[] = []
  let insertCalls = 0, commits = 0, rollbacks = 0
  const legacy = { clubId: "EA-UNCHANGED", updatedAt: "UNCHANGED", transfers: 3, attributes: "UNCHANGED" }
  const db = { async $transaction(work: (tx: unknown) => Promise<unknown>, settings: { isolationLevel: string }) {
    assert.ok(["Serializable", "RepeatableRead"].includes(settings.isolationLevel))
    const draft = structuredClone(rows), projections = structuredClone(states)
    let readOnly = false
    const reject = () => { throw new Error("FORBIDDEN_LEGACY_OR_UPDATE_CAPABILITY") }
    const tx = new Proxy({
      $executeRawUnsafe: async (sql: string) => { assert.equal(sql, "SET TRANSACTION READ ONLY"); readOnly = true },
      $queryRawUnsafe: async (sql: string) => sql.startsWith("SHOW") ? [{ transaction_read_only: "on" }]
        : sql.includes("FOR SHARE") ? [] : [{ count: "1", hash: options.sourceChanged ? "changed" : "fixture" }],
      player: { findUnique: async ({ where }: { where: { id: string } }) => {
        const p = scope.find(p => p.playerId === where.id)!
        return { apiFootballId: p.providerPlayerId, clubId: p.eaClubId, updatedAt: now }
      }, findMany: async ({ where }: { where: { apiFootballId: number } }) => [{ id: options.wrongOwner ? "other" : scope.find(p => p.providerPlayerId === where.apiFootballId)!.playerId }], update: reject },
      club: { findMany: async () => structuredClone(auditedTransfers.clubs), update: reject },
      playerTransfer: { create: reject },
      playerTransferObservation: {
        findMany: async ({ where }: { where: { playerId: string } }) => structuredClone(draft.filter(r => r.playerId === where.playerId)),
        findUnique: async ({ where }: { where: { id: string } }) => structuredClone(draft.find(r => r.id === where.id) ?? null),
        createMany: async ({ data, skipDuplicates }: { data: PlayerTransferObservation[]; skipDuplicates: boolean }) => {
          assert.equal(readOnly, false); assert.equal(skipDuplicates, true)
          insertCalls++; if (insertCalls === options.failInsert) throw new Error("INSERT_FAILURE")
          const fresh = data.filter(r => !draft.some(x => x.id === r.id))
          draft.push(...structuredClone(fresh).map(r => options.tamper ? { ...r, typeRaw: "tampered" } : r))
          return { count: fresh.length }
        }, update: reject, delete: reject,
      },
      playerCurrentClubState: {
        findUnique: async ({ where }: { where: { playerId: string } }) => structuredClone(projections.find(p => p.playerId === where.playerId) ?? null),
        create: async ({ data }: { data: PlayerCurrentClubState }) => {
          assert.equal(readOnly, false); if (options.failProjection) throw new Error("PROJECTION_FAILURE")
          projections.push(structuredClone(data)); return data
        }, update: reject,
      },
    }, { get(target, key) { if (!(key in target)) return reject(); return Reflect.get(target, key) } })
    try { const result = await work(tx); rows = draft; states = projections; commits++; return result }
    catch (error) { rollbacks++; throw error }
  } } as unknown as Pick<PrismaClient, "$transaction">
  return { db, rows: () => structuredClone(rows), states: () => structuredClone(states), legacy,
    stats: () => ({ insertCalls, commits, rollbacks }) }
}
async function write(f: ReturnType<typeof fake>, a = input()) {
  const plan = await dryRunTransferPersistence(f.db, a, scope)
  return writeTransferPersistence(f.db, a, scope, plan.planHash, () => now)
}

test("real Prisma adapter: dry-run rolls back and does not insert anything", async () => {
  const f = fake(), p = await dryRunTransferPersistence(f.db, input(), scope)
  assert.equal(p.observationsToInsert, 3); assert.equal(p.projectionToInsert, 1)
  assert.deepEqual(f.stats(), { insertCalls: 0, commits: 0, rollbacks: 1 })
})
test("real Prisma adapter: insert, read-back hashes and PROPOSED projection are atomic and not promoted", async () => {
  const f = fake(), r = await write(f)
  assert.equal(r.inserted, 3); assert.equal(r.projectionInserted, 1); assert.equal(r.promoted, false)
  assert.equal(r.projection?.status, "PROPOSED")
  assert.equal((r.projection?.evidence as { writable: boolean }).writable, false)
  f.rows().forEach(r => assert.equal(decodeTransferObservation(r).contentHash, r.contentHash))
  assert.deepEqual(f.legacy, { clubId: "EA-UNCHANGED", updatedAt: "UNCHANGED", transfers: 3, attributes: "UNCHANGED" })
})
test("real Prisma adapter: identical execution is a no-op including projection and timestamps", async () => {
  const f = fake(); await write(f)
  const before = { rows: f.rows(), states: f.states() }, r = await write(f)
  assert.equal(r.inserted, 0); assert.equal(r.duplicates, 3); assert.equal(r.projectionInserted, 0)
  assert.deepEqual({ rows: f.rows(), states: f.states() }, before); assert.equal(f.stats().insertCalls, 3)
})
test("ownership mismatch blocks every mutation", async () => {
  const f = fake({ wrongOwner: true })
  await assert.rejects(write(f), /OWNERSHIP/); assert.equal(f.stats().insertCalls, 0)
})
test("unknown team preserves provider 998 and raw facts, with no Club relation or name match", async () => {
  const f = fake(), r = await write(f, input(0))
  assert.equal(r.projection?.clubId, null); assert.equal(r.projection?.providerTeamId, 998)
  assert.equal(r.decision.decision, "TEAM_IDENTITY_UNRESOLVED")
  assert.ok(f.rows().some(r => r.toProviderTeamId === 998 && r.typeRaw === "Free agent"))
})
test("adapter translates revisions from domain without replacing the previous source fact", async () => {
  const f = fake(), a = input(), store = createPrismaObservationStore(f.db, scope)
  const history = { player: a.player, events: a.observation.transfers, fetchedAt: a.observation.requestMetadata.fetchedAt }
  await persistTransferObservations(history, now, store)
  const before = f.rows(), corrected = { ...history.events[0], typeRaw: "Correction fixture" }
  const r = await persistTransferObservations({ ...history, events: [corrected] }, now, store)
  assert.equal(r.inserted, 1); assert.equal(r.revisions, 1)
  assert.deepEqual(f.rows().slice(0, before.length), before)
  assert.deepEqual(f.rows().at(-1)?.possibleRevisionHashes, [before[0].contentHash])
})
for (const [label, options] of [["insert", { failInsert: 2 }], ["projection", { failProjection: true }], ["read-back", { tamper: true }]] as const) {
  test(`${label} failure rolls back entire player unit, no retry`, async () => {
    const f = fake(options)
    await assert.rejects(write(f)); assert.deepEqual(f.rows(), []); assert.deepEqual(f.states(), [])
    assert.equal(f.stats().commits, 0)
  })
}
test("changed source snapshot blocks stale roster/lineup evidence", async () => {
  const f = fake({ sourceChanged: true })
  await assert.rejects(write(f), /SOURCE_SNAPSHOT_CHANGED/); assert.equal(f.stats().insertCalls, 0)
})
test("changed dry-run hash blocks mutation; expired clock blocks opening the write transaction", async () => {
  const f = fake(), a = input()
  await assert.rejects(writeTransferPersistence(f.db, a, scope, "wrong", () => now), /DRY_RUN_CHANGED/)
  await assert.rejects(writeTransferPersistence(f.db, a, scope, "wrong", () => new Date(now.getTime() + 300001)), /EXPIRED/)
  assert.equal(f.stats().insertCalls, 0)
})
test("seventh player is rejected before any Prisma operation", async () => {
  const f = fake(), a = input(); a.player = { ...a.player, providerPlayerId: 999999 }
  assert.throws(() => dryRunTransferPersistence(f.db, a, scope), /ALLOW_LIST/)
  assert.equal(f.stats().rollbacks, 0)
})
test("six-player batch fails stop, keeps prior units, never calls later players or retries", async () => {
  const inputs = TRANSFER_PILOT_PLAYERS.map((p, i) => ({ ...input(i), player: { ...input(i).player, playerId: p.playerId } }))
  const called: number[] = []
  const r = await runTransferPersistenceUnits(inputs, async a => { called.push(a.player.providerPlayerId); if (called.length === 2) throw new Error("failure"); return a.player.playerId })
  assert.deepEqual(called, [306, 44]); assert.equal(r.completed.length, 1); assert.equal(r.notStarted.length, 4)
  assert.equal(r.retries, 0); assert.equal(r.requiresAuditBeforeRetry, true)
  await assert.rejects(runTransferPersistenceUnits([...inputs, inputs[0]], async () => null), /ALLOW_LIST/)
})
test("unverified local payload is rejected instead of reconstructed from report prose", () => {
  assert.throws(() => readAuditedTransferPayloads(Buffer.from("{}")), /INTEGRITY/)
})

for (let index = 0; index < 6; index++) {
  test(`audited cohort member ${auditedPlayers[index].providerPlayerId}: full facts, proposal and repeat no-op`, async () => {
    const f = fake(), a = input(index), r = await write(f, a)
    assert.equal(r.inserted, a.observation.transfers.length)
    for (const e of a.observation.transfers) {
      const stored = f.rows().find(x => x.sourceIndex === e.sourceIndex)!
      assert.equal(stored.typeRaw, e.typeRaw); assert.equal(stored.dateRaw, e.dateRaw)
      assert.equal(stored.fromProviderTeamId, e.fromProviderTeamId); assert.equal(stored.toProviderTeamId, e.toProviderTeamId)
      assert.equal(stored.payloadVersion, 1); assert.equal(stored.fetchedAt.toISOString(), a.observation.requestMetadata.fetchedAt)
    }
    const before = f.rows(), second = await write(f, a)
    assert.equal(second.inserted, 0); assert.equal(second.projectionInserted, 0); assert.deepEqual(f.rows(), before)
    assert.equal(r.decision.decision, index === 0 ? "TEAM_IDENTITY_UNRESOLVED" : "TRANSFER_CANDIDATE")
  })
}
