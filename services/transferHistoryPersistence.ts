import { planTransferObservationAppend, prepareTransferHistory } from "../lib/transferHistory"
import type { TransferHistoryInput, TransferObservationRecord } from "../types/currentClub"

// Narrow append-only port: no Player/Club update, delete, upsert, HTTP, env or default DB.
// The future DB adapter must run SERIALIZABLE and atomically implement insertIfAbsent via the unique content key.
export type ObservationTransaction = {
  identityOwners(providerPlayerId: number): Promise<string[]>
  list(playerId: string): Promise<TransferObservationRecord[]>
  insertIfAbsent(record: TransferObservationRecord): Promise<boolean>
}
export type ObservationStore = {
  transaction<T>(work: (tx: ObservationTransaction) => Promise<T>): Promise<T>
}
export async function persistTransferObservations(input: TransferHistoryInput, now: Date, store: ObservationStore) {
  const incoming = prepareTransferHistory(input, now)
  return store.transaction(async tx => {
    const owners = await tx.identityOwners(input.player.providerPlayerId)
    if (owners.length !== 1 || owners[0] !== input.player.playerId) throw new Error("TRANSFER_PROVIDER_OWNERSHIP_CHANGED")
    const existing = await tx.list(input.player.playerId)
    if (existing.some(r => r.playerId !== input.player.playerId || r.providerPlayerId !== input.player.providerPlayerId)) throw new Error("TRANSFER_HISTORY_IDENTITY_CONFLICT")
    const plan = planTransferObservationAppend(existing, incoming, now)
    let inserted = 0, revisions = 0
    for (const row of plan.append) if (await tx.insertIfAbsent(row)) { inserted++; if (row.possibleRevisionHashes.length) revisions++ }
    return { inserted, duplicates: incoming.length - inserted, revisions }
  })
}
