import { isDeepStrictEqual } from "node:util"

import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { EA_CATALOG_PROVENANCE_SCHEMA_VERSION } from "../lib/eaCatalogSemanticSync"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type {
  EaGoalkeeperAudit, EaGoalkeeperCursor, EaGoalkeeperOperationalState, EaGoalkeeperSourcePage,
  EaGoalkeeperWritePlan, EaGoalkeeperWriteStore,
} from "./eaGoalkeeperAttributesSync"

const protectedTables = [
  "Player", "Club", "League", "PlayerAttributes", "PlayerPlayStyle", "PlayerTransferObservation",
  "PlayerCurrentClubState", "PlayerCurrentClubProposal", "PlayerApprovedCurrentClub",
  "BrandAssetIdentity", "BrandAsset",
] as const
const POSITION_CURSOR = "ea-ratings-players:fc27:position-write-v1"

function state(row: {
  id: string; externalId: string | null; name: string; position: string; updatedAt: Date
  goalkeeperAttributes: null | { id: string; diving: number; handling: number; kicking: number;
    positioning: number; reflexes: number; payloadHash: string; updatedAt: Date }
} | null): EaGoalkeeperOperationalState | null {
  if (!row?.externalId) return null
  return {
    playerId: row.id, externalId: row.externalId, name: row.name,
    position: row.position as EaGoalkeeperOperationalState["position"], playerUpdatedAt: row.updatedAt.toISOString(),
    attributes: row.goalkeeperAttributes ? { ...row.goalkeeperAttributes,
      updatedAt: row.goalkeeperAttributes.updatedAt.toISOString() } : null,
  }
}

async function readPlayer(tx: Prisma.TransactionClient, externalId: string) {
  return state(await tx.player.findUnique({ where: { externalId }, select: {
    id: true, externalId: true, name: true, position: true, updatedAt: true,
    goalkeeperAttributes: { select: { id: true, diving: true, handling: true, kicking: true,
      positioning: true, reflexes: true, payloadHash: true, updatedAt: true } },
  } }))
}

const cursor = (row: { key: string; offset: number; batchSize: number; status: string; updatedAt: Date } | null): EaGoalkeeperCursor | null =>
  row && ({ ...row, updatedAt: row.updatedAt.toISOString() })

async function readCursor(tx: Prisma.TransactionClient, key: string) {
  return cursor(await tx.syncState.findUnique({ where: { key }, select: {
    key: true, offset: true, batchSize: true, status: true, updatedAt: true,
  } }))
}

async function checkpoint(tx: Prisma.TransactionClient, key: string) {
  const row = await tx.syncState.findUnique({ where: { key }, select: { offset: true, updatedAt: true } })
  return row ? { offset: row.offset, updatedAt: row.updatedAt.toISOString() } : null
}

async function audit(db: Pick<PrismaClient, "$transaction">, historicalKey: string): Promise<EaGoalkeeperAudit> {
  return withPrismaReadOnly(db, async tx => {
    const read = async (name: typeof protectedTables[number]) =>
      (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
        `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) hash FROM "${name}" t`
      ))[0]
    return {
      protected: Object.fromEntries(await Promise.all(protectedTables.map(async name => [name, await read(name)]))),
      historicalCheckpoint: await checkpoint(tx, historicalKey),
      positionCursor: await checkpoint(tx, POSITION_CURSOR),
    }
  })
}

async function createProvenance(tx: Prisma.TransactionClient, page: EaGoalkeeperSourcePage,
  plans: readonly EaGoalkeeperWritePlan[]) {
  const source = page.provenance
  const row = await tx.eaCatalogObservation.create({ data: {
    provider: source.provider, endpoint: source.endpoint, eaGameVersion: source.eaGameVersion,
    gameVersionEvidence: source.gameVersionEvidence, gameVersionEvidenceUrl: source.gameVersionEvidenceUrl,
    catalogVersion: source.catalogVersion, sourceUpdatedAt: source.sourceUpdatedAt, observedAt: source.observedAt,
    responseDate: source.responseDate, etag: source.etag, lastModified: source.lastModified,
    locale: source.locale, gender: source.gender, requestOffset: source.requestOffset,
    requestLimit: source.requestLimit, totalItems: source.totalItems, batchHash: page.batchHash,
    schemaVersion: EA_CATALOG_PROVENANCE_SCHEMA_VERSION,
    players: { create: plans.map(plan => ({
      playerId: plan.playerId, externalId: plan.externalId, clubExternalId: null, leagueExternalId: null,
      leagueName: null, payloadHash: plan.payloadHash, action: plan.action, changedFields: plan.changedFields,
    })) },
  }, select: { id: true } })
  return row.id
}

function values(plan: EaGoalkeeperWritePlan, observationId: string, observedAt: Date) {
  return { ...plan.after!, provider: "ea-ratings", sourceObservationId: observationId,
    sourceUpdatedAt: null, observedAt, payloadHash: plan.payloadHash }
}

function transactionPort(tx: Prisma.TransactionClient) {
  return {
    readHistoricalCheckpoint: (key: string) => checkpoint(tx, key),
    readCursor: (key: string) => readCursor(tx, key),
    readPlayer: (externalId: string) => readPlayer(tx, externalId),
    createProvenance: (page: EaGoalkeeperSourcePage, plans: readonly EaGoalkeeperWritePlan[]) =>
      createProvenance(tx, page, plans),
    async createAttributes(plan: EaGoalkeeperWritePlan, observationId: string, observedAt: Date) {
      if (!plan.playerId || !plan.after) return 0
      await tx.playerGoalkeeperAttributes.create({ data: { playerId: plan.playerId,
        ...values(plan, observationId, observedAt) } })
      return 1
    },
    async updateAttributes(plan: EaGoalkeeperWritePlan, observationId: string, observedAt: Date) {
      if (!plan.playerId || !plan.after) return 0
      const current = await tx.playerGoalkeeperAttributes.findUnique({ where: { playerId: plan.playerId },
        select: { id: true, payloadHash: true, updatedAt: true } })
      const result = await tx.playerGoalkeeperAttributes.updateMany({ where: {
        playerId: plan.playerId,
        id: current?.id,
        payloadHash: current?.payloadHash,
        updatedAt: current?.updatedAt,
      }, data: values(plan, observationId, observedAt) })
      return result.count
    },
    async verify(plans: readonly EaGoalkeeperWritePlan[], observationIds: ReadonlyMap<number, string>) {
      for (const plan of plans) {
        const current = await readPlayer(tx, plan.externalId)
        if (!current || current.position !== "GOL" || !plan.after || !current.attributes ||
            !isDeepStrictEqual(Object.fromEntries(["diving", "handling", "kicking", "positioning", "reflexes"]
              .map(field => [field, current.attributes?.[field as keyof typeof current.attributes]])), plan.after) ||
            current.attributes.payloadHash !== plan.payloadHash) return false
        if (plan.action !== "NO_OP") {
          const persisted = await tx.playerGoalkeeperAttributes.findUnique({ where: { playerId: current.playerId },
            select: { sourceObservationId: true } })
          if (persisted?.sourceObservationId !== observationIds.get(plan.sourcePage)) return false
        }
      }
      return true
    },
    async advanceCursor(input: { key: string; expected: EaGoalkeeperCursor | null; offset: number; batchSize: number;
      completed: boolean; now: Date }) {
      if (!input.expected) {
        await tx.syncState.create({ data: { key: input.key, offset: input.offset, batchSize: input.batchSize,
          status: input.completed ? "completed" : "running", lastSuccessAt: input.now, lastError: null } })
        return 1
      }
      const result = await tx.syncState.updateMany({ where: { key: input.key, offset: input.expected.offset,
        updatedAt: new Date(input.expected.updatedAt) }, data: { offset: input.offset, batchSize: input.batchSize,
        status: input.completed ? "completed" : "running", lastSuccessAt: input.now, lastError: null } })
      return result.count
    },
  }
}

export async function loadEaGoalkeeperSyncState(db: Pick<PrismaClient, "$transaction">, input: {
  externalIds: string[]; cursorKey: string; historicalKey: string
}) {
  return withPrismaReadOnly(db, async tx => {
    const rows = await tx.player.findMany({ where: { externalId: { in: input.externalIds } }, select: {
      id: true, externalId: true, name: true, position: true, updatedAt: true,
      goalkeeperAttributes: { select: { id: true, diving: true, handling: true, kicking: true,
        positioning: true, reflexes: true, payloadHash: true, updatedAt: true } },
    } })
    return {
      players: new Map(rows.flatMap(row => { const value = state(row); return value ? [[value.externalId, value] as const] : [] })),
      cursor: await readCursor(tx, input.cursorKey),
      historicalCheckpoint: await checkpoint(tx, input.historicalKey),
    }
  })
}

export function createPrismaEaGoalkeeperWriteStore(db: Pick<PrismaClient, "$transaction">,
  historicalKey: string): EaGoalkeeperWriteStore {
  return {
    audit: () => audit(db, historicalKey),
    transaction: work => db.$transaction(tx => work(transactionPort(tx)), {
      isolationLevel: "Serializable", maxWait: 5000, timeout: 30000,
    }),
  }
}
