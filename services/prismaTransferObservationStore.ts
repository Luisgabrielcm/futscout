import type { Prisma, PrismaClient, PlayerTransferObservation } from "../app/generated/prisma/client"
import { observationEvent, prepareTransferHistory } from "../lib/transferHistory"
import type { TransferObservationRecord } from "../types/currentClub"
import type { ObservationStore, ObservationTransaction } from "./transferHistoryPersistence"

export type TransferIdentityScope = readonly { playerId: string; providerPlayerId: number }[]
export function requireTransferScope(scope: TransferIdentityScope, playerId: string, providerPlayerId: number) {
  if (!scope.length || new Set(scope.map(p => p.playerId)).size !== scope.length ||
      new Set(scope.map(p => p.providerPlayerId)).size !== scope.length ||
      !scope.some(p => p.playerId === playerId && p.providerPlayerId === providerPlayerId)) throw new Error("TRANSFER_ALLOW_LIST_REJECTED")
}

// Convert infrastructure types, then revalidate using the existing pure domain algorithm.
export function decodeTransferObservation(row: PlayerTransferObservation): TransferObservationRecord {
  if (row.provider !== "api-football" || row.payloadVersion !== 1 || !Array.isArray(row.warnings) ||
      !Array.isArray(row.possibleRevisionHashes)) throw new Error("TRANSFER_STORED_RECORD_INVALID")
  const record: TransferObservationRecord = { ...row, provider: "api-football", payloadVersion: 1,
    transferDate: row.transferDate?.toISOString().slice(0, 10) ?? null,
    fetchedAt: row.fetchedAt.toISOString(), createdAt: row.createdAt.toISOString() }
  const [rebuilt] = prepareTransferHistory({ player: { playerId: row.playerId, providerPlayerId: row.providerPlayerId,
    identityConfirmed: true, ownershipUnique: true, eaClubId: null, eaTeamId: null },
    events: [observationEvent(record, row.createdAt)], fetchedAt: record.fetchedAt }, row.createdAt)
  for (const key of ["id", "contentHash", "logicalEventKey", "transferDate"] as const) {
    if (record[key] !== rebuilt[key]) throw new Error("TRANSFER_READ_BACK_HASH_MISMATCH")
  }
  return record
}

// The port exposes no observation UPDATE/DELETE and no legacy mutation capability.
export function prismaObservationTransaction(tx: Prisma.TransactionClient, scope: TransferIdentityScope): ObservationTransaction {
  const checked = new Set<string>()
  return {
    async identityOwners(providerPlayerId) {
      const expected = scope.find(p => p.providerPlayerId === providerPlayerId)
      if (!expected) throw new Error("TRANSFER_ALLOW_LIST_REJECTED")
      requireTransferScope(scope, expected.playerId, providerPlayerId)
      const owners = await tx.player.findMany({ where: { apiFootballId: providerPlayerId }, select: { id: true } })
      if (owners.length === 1 && owners[0].id === expected.playerId) checked.add(expected.playerId)
      return owners.map(p => p.id)
    },
    async list(playerId) {
      if (!checked.has(playerId)) throw new Error("TRANSFER_OWNERSHIP_NOT_CHECKED")
      const rows = await tx.playerTransferObservation.findMany({ where: { playerId },
        orderBy: [{ createdAt: "asc" }, { sourceIndex: "asc" }, { id: "asc" }] })
      return rows.map(decodeTransferObservation)
    },
    async insertIfAbsent(record) {
      requireTransferScope(scope, record.playerId, record.providerPlayerId)
      if (!checked.has(record.playerId)) throw new Error("TRANSFER_OWNERSHIP_NOT_CHECKED")
      const data = { ...record, transferDate: record.transferDate ? new Date(record.transferDate) : null,
        fetchedAt: new Date(record.fetchedAt), createdAt: new Date(record.createdAt) }
      decodeTransferObservation(data)
      // PostgreSQL ON CONFLICT DO NOTHING; serializable failures propagate, never retry.
      const result = await tx.playerTransferObservation.createMany({ data: [data], skipDuplicates: true })
      const readBack = await tx.playerTransferObservation.findUnique({ where: { id: record.id } })
      if (!readBack || decodeTransferObservation(readBack).contentHash !== record.contentHash) throw new Error("TRANSFER_INSERT_READ_BACK_MISMATCH")
      return result.count === 1
    },
  }
}

export function createPrismaObservationStore(db: Pick<PrismaClient, "$transaction">, scope: TransferIdentityScope): ObservationStore {
  return { transaction: work => db.$transaction(tx => work(prismaObservationTransaction(tx, scope)),
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 60000 }) }
}
