import assert from "node:assert/strict"
import test from "node:test"
import { auditedObservation, auditedPlayers, auditedTransfers } from "../../fixtures/auditedTransfers"
import { observationEvent, planTransferObservationAppend, prepareTransferHistory, transferEvidenceHash } from "../../../lib/transferHistory"
import { persistTransferObservations, type ObservationStore } from "../../../services/transferHistoryPersistence"
import type { TransferObservationRecord } from "../../../types/currentClub"

const now = new Date(auditedTransfers.now)
const input = () => ({ player: auditedPlayers[1], events: auditedObservation(44).transfers, fetchedAt: auditedTransfers.fetchedAt })
function fakeStore(options: { owners?: string[]; failAt?: number; insertRace?: boolean } = {}) {
  let rows: TransferObservationRecord[] = [], calls = 0
  const store: ObservationStore = { async transaction(work) {
    const draft = structuredClone(rows)
    const result = await work({
      identityOwners: async () => options.owners ?? [input().player.playerId],
      list: async () => structuredClone(draft),
      insertIfAbsent: async row => {
        calls++
        if (calls === options.failAt) throw new Error("fake insert failure")
        if (options.insertRace || draft.some(r => r.id === row.id)) return false
        draft.push(structuredClone(row)); return true
      },
    })
    rows = draft; return result
  } }
  return { store, rows: () => structuredClone(rows), calls: () => calls }
}

test("observation identity ignores fetch time/order, preserves raw facts and uses canonical hashes", () => {
  const a = input(), first = prepareTransferHistory(a, now)
  const second = prepareTransferHistory({ ...a, fetchedAt: now.toISOString(), events: a.events.map(e => ({ ...e, sourceIndex: e.sourceIndex + 10 })) }, now)
  assert.deepEqual(first.map(r => r.id), second.map(r => r.id))
  assert.equal(transferEvidenceHash({ z: 2, a: { d: 4, b: 3 } }), transferEvidenceHash({ a: { b: 3, d: 4 }, z: 2 }))
  assert.notEqual(transferEvidenceHash([1, 2]), transferEvidenceHash([2, 1]))
  assert.equal(first.at(-1)!.typeRaw, "Transfer")
  assert.equal(first.at(-1)!.toProviderTeamId, 529)
})

test("append-only persistence is idempotent across repeated fetches; no original row is replaced", async () => {
  const f = fakeStore(), a = input()
  const first = await persistTransferObservations(a, now, f.store)
  const snapshot = f.rows()
  const second = await persistTransferObservations({ ...a, fetchedAt: now.toISOString() }, now, f.store)
  assert.equal(first.inserted, 3); assert.equal(second.inserted, 0); assert.equal(second.duplicates, 3)
  assert.deepEqual(f.rows(), snapshot); assert.equal(f.calls(), 3)
})

test("provider correction appends a revision linked to original content, never overwrites", async () => {
  const f = fakeStore(), a = input()
  await persistTransferObservations(a, now, f.store)
  const before = f.rows(), corrected = structuredClone(a.events.at(-1)!)
  corrected.typeRaw = "€ 55M"; corrected.toTeamNameRaw = "Corrected display name"
  const result = await persistTransferObservations({ ...a, events: [corrected] }, now, f.store)
  assert.equal(result.inserted, 1); assert.equal(result.revisions, 1)
  assert.deepEqual(f.rows().slice(0, before.length), before)
  assert.deepEqual(f.rows().at(-1)!.possibleRevisionHashes, [before.at(-1)!.contentHash])
  assert.equal(f.rows().at(-1)!.typeRaw, "€ 55M")
})

test("NULL destination and date are preserved, not invented; future is evaluated against the new clock", () => {
  const a = input(), event = { ...a.events[0], dateRaw: null, toProviderTeamId: null, toTeamNameRaw: null, typeRaw: null }
  const [r] = prepareTransferHistory({ ...a, events: [event] }, now)
  assert.equal(r.transferDate, null); assert.equal(r.dateRaw, null); assert.equal(r.typeRaw, null)
  assert.equal(r.toProviderTeamId, null); assert.ok(r.warnings.includes("MISSING_DATE"))
  const [future] = prepareTransferHistory({ ...a, events: [{ ...event, dateRaw: "2026-09-16" }] }, now)
  assert.equal(observationEvent(future, now).dateState, "FUTURE_TRANSFER")
  assert.equal(observationEvent(future, new Date("2026-09-17")).dateState, "VALID")
})

test("same-day distinct routes remain distinct observations; possible revision is not a merge", () => {
  const a = input(), records = prepareTransferHistory({ ...a, events: [a.events[0], { ...a.events[0], toProviderTeamId: 123456 }] }, now)
  const plan = planTransferObservationAppend([], [...records, records[0]], now)
  assert.equal(plan.append.length, 2); assert.equal(plan.duplicateHashes.length, 1)
  assert.deepEqual(plan.append[1].possibleRevisionHashes, [])
})

test("ownership is rechecked inside the transaction before any insert", async () => {
  for (const owners of [[], ["other"], [input().player.playerId, "other"]]) {
    const f = fakeStore({ owners })
    await assert.rejects(persistTransferObservations(input(), now, f.store), /OWNERSHIP_CHANGED/)
    assert.equal(f.calls(), 0); assert.deepEqual(f.rows(), [])
  }
})

test("transaction insertion failure rolls back the fake store; service never retries", async () => {
  const f = fakeStore({ failAt: 2 })
  await assert.rejects(persistTransferObservations(input(), now, f.store), /fake insert failure/)
  assert.equal(f.calls(), 2); assert.deepEqual(f.rows(), [])
})

test("atomic insert race no-op is reported as duplicate, not insertion or revision", async () => {
  const f = fakeStore({ insertRace: true })
  assert.deepEqual(await persistTransferObservations(input(), now, f.store), { inserted: 0, duplicates: 3, revisions: 0 })
})

test("unconfirmed/foreign identity and impossible observation clock never enter persistence", async () => {
  const f = fakeStore(), a = input()
  await assert.rejects(persistTransferObservations({ ...a, player: { ...a.player, identityConfirmed: false as true } }, now, f.store), /CONFIRMED/)
  await assert.rejects(persistTransferObservations({ ...a, events: [{ ...a.events[0], providerPlayerId: 306 }] }, now, f.store), /IDENTITY/)
  await assert.rejects(persistTransferObservations({ ...a, fetchedAt: "2099-01-01" }, now, f.store), /CLOCK/)
  assert.equal(f.calls(), 0)
})
