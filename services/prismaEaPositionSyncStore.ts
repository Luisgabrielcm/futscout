import { isDeepStrictEqual } from "node:util"

import type { Prisma, PrismaClient } from "../app/generated/prisma/client"

import { EA_CATALOG_PROVENANCE_SCHEMA_VERSION } from "../lib/eaCatalogSemanticSync"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type {
  EaPositionAudit,
  EaPositionCursor,
  EaPositionPlan,
  EaPositionPlayerState,
  EaPositionProvenanceInput,
  EaPositionValues,
  EaPositionWriteStore,
} from "./eaPositionSync"

const protectedTables = [
  "Club", "League", "PlayerAttributes", "PlayerGoalkeeperAttributes", "PlayerPlayStyle", "PlayerTransferObservation",
  "PlayerCurrentClubState", "PlayerCurrentClubProposal", "PlayerApprovedCurrentClub",
  "BrandAssetIdentity", "BrandAsset",
] as const

const playerState = (row: {
  id: string
  externalId: string | null
  name: string
  position: string
  secondaryPosition: string | null
  secondaryPositions: string[]
  updatedAt: Date
} | null): EaPositionPlayerState | null => {
  if (!row?.externalId) return null
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    position: row.position as EaPositionPlayerState["position"],
    secondaryPosition: row.secondaryPosition as EaPositionPlayerState["secondaryPosition"],
    secondaryPositions: row.secondaryPositions as EaPositionPlayerState["secondaryPositions"],
    updatedAt: row.updatedAt.toISOString(),
  }
}

const cursor = (row: {
  key: string
  offset: number
  batchSize: number
  status: string
  updatedAt: Date
} | null): EaPositionCursor | null => row && ({ ...row, updatedAt: row.updatedAt.toISOString() })

async function readPlayer(tx: Prisma.TransactionClient, externalId: string) {
  return playerState(await tx.player.findUnique({ where: { externalId }, select: {
    id: true, externalId: true, name: true, position: true, secondaryPosition: true,
    secondaryPositions: true, updatedAt: true,
  } }))
}

async function readCursor(tx: Prisma.TransactionClient, key: string) {
  return cursor(await tx.syncState.findUnique({ where: { key }, select: {
    key: true, offset: true, batchSize: true, status: true, updatedAt: true,
  } }))
}

async function readHistoricalCheckpoint(tx: Prisma.TransactionClient, key: string) {
  const row = await tx.syncState.findUnique({ where: { key }, select: { offset: true, updatedAt: true } })
  return row ? { offset: row.offset, updatedAt: row.updatedAt.toISOString() } : null
}

async function audit(db: Pick<PrismaClient, "$transaction">, historicalKey: string): Promise<EaPositionAudit> {
  return withPrismaReadOnly(db, async tx => {
    const read = async (name: typeof protectedTables[number]) =>
      (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
        `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) hash FROM "${name}" t`
      ))[0]
    return {
      protected: Object.fromEntries(await Promise.all(protectedTables.map(async name => [name, await read(name)]))),
      historicalCheckpoint: await readHistoricalCheckpoint(tx, historicalKey),
    }
  })
}

async function createProvenance(tx: Prisma.TransactionClient, input: EaPositionProvenanceInput) {
  const source = input.provenance
  const row = await tx.eaCatalogObservation.create({ data: {
    provider: source.provider,
    endpoint: source.endpoint,
    eaGameVersion: source.eaGameVersion,
    gameVersionEvidence: source.gameVersionEvidence,
    gameVersionEvidenceUrl: source.gameVersionEvidenceUrl,
    catalogVersion: source.catalogVersion,
    sourceUpdatedAt: source.sourceUpdatedAt,
    observedAt: source.observedAt,
    responseDate: source.responseDate,
    etag: source.etag,
    lastModified: source.lastModified,
    locale: source.locale,
    gender: source.gender,
    requestOffset: source.requestOffset,
    requestLimit: source.requestLimit,
    totalItems: source.totalItems,
    batchHash: input.batchHash,
    schemaVersion: EA_CATALOG_PROVENANCE_SCHEMA_VERSION,
    players: { create: input.plans.map(plan => ({
      playerId: plan.playerId,
      externalId: plan.externalId,
      clubExternalId: null,
      leagueExternalId: null,
      leagueName: null,
      payloadHash: plan.payloadHash,
      action: plan.status === "READY" ? "UPDATE" : "NO_OP",
      changedFields: plan.changedFields,
    })) },
  }, select: { id: true } })
  return row.id
}

function transactionPort(tx: Prisma.TransactionClient) {
  return {
    readHistoricalCheckpoint: (key: string) => readHistoricalCheckpoint(tx, key),
    readCursor: (key: string) => readCursor(tx, key),
    readPlayer: (externalId: string) => readPlayer(tx, externalId),
    async updatePositions(expected: EaPositionPlayerState, after: EaPositionValues) {
      const result = await tx.player.updateMany({ where: {
        id: expected.id,
        externalId: expected.externalId,
        updatedAt: new Date(expected.updatedAt),
      }, data: {
        position: after.position,
        secondaryPosition: after.secondaryPosition,
        secondaryPositions: after.secondaryPositions,
      } })
      return result.count
    },
    async verifyPositions(plans: readonly EaPositionPlan[]) {
      for (const plan of plans) {
        const current = await readPlayer(tx, plan.externalId)
        if (!current || !plan.after || !isDeepStrictEqual({
          position: current.position,
          secondaryPosition: current.secondaryPosition,
          secondaryPositions: current.secondaryPositions,
        }, plan.after)) return false
      }
      return true
    },
    createProvenance: (input: EaPositionProvenanceInput) => createProvenance(tx, input),
    async advanceCursor(input: {
      key: string
      expected: EaPositionCursor | null
      offset: number
      batchSize: number
      completed: boolean
      now: Date
    }) {
      if (!input.expected) {
        await tx.syncState.create({ data: {
          key: input.key,
          offset: input.offset,
          batchSize: input.batchSize,
          status: input.completed ? "completed" : "running",
          lastSuccessAt: input.now,
          lastError: null,
        } })
        return 1
      }
      const result = await tx.syncState.updateMany({ where: {
        key: input.key,
        offset: input.expected.offset,
        updatedAt: new Date(input.expected.updatedAt),
      }, data: {
        offset: input.offset,
        batchSize: input.batchSize,
        status: input.completed ? "completed" : "running",
        lastSuccessAt: input.now,
        lastError: null,
      } })
      return result.count
    },
  }
}

export async function loadEaPositionSyncState(db: Pick<PrismaClient, "$transaction">, input: {
  externalIds: string[]
  cursorKey: string
  historicalKey: string
}) {
  return withPrismaReadOnly(db, async tx => {
    const rows = await tx.player.findMany({ where: { externalId: { in: input.externalIds } }, select: {
      id: true, externalId: true, name: true, position: true, secondaryPosition: true,
      secondaryPositions: true, updatedAt: true,
    } })
    return {
      players: new Map(rows.flatMap(row => {
        const state = playerState(row)
        return state ? [[state.externalId, state] as const] : []
      })),
      cursor: await readCursor(tx, input.cursorKey),
      historicalCheckpoint: await readHistoricalCheckpoint(tx, input.historicalKey),
    }
  })
}

// Inert factory: construction performs no reads or writes. Only an explicitly authorized caller can invoke transaction().
export function createPrismaEaPositionWriteStore(db: Pick<PrismaClient, "$transaction">,
  historicalKey: string): EaPositionWriteStore {
  return {
    audit: () => audit(db, historicalKey),
    transaction: work => db.$transaction(tx => work(transactionPort(tx)), {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 30000,
    }),
  }
}
