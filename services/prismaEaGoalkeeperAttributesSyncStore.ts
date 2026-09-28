import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { EA_CATALOG_PROVENANCE_SCHEMA_VERSION } from "../lib/eaCatalogSemanticSync"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type {
  EaGoalkeeperAudit, EaGoalkeeperCursor, EaGoalkeeperOperationalState, EaGoalkeeperSourcePage,
  EaGoalkeeperWritePlan, EaGoalkeeperWriteStore,
} from "./eaGoalkeeperAttributesSync"
import { runEaGoalkeeperReadBackQuery, verifyEaGoalkeeperReadBack } from "./eaGoalkeeperAttributesSync"

const protectedTables = [
  "Player", "Club", "League", "PlayerAttributes", "PlayerPlayStyle", "PlayerTransferObservation",
  "PlayerCurrentClubState", "PlayerCurrentClubProposal", "PlayerApprovedCurrentClub",
  "BrandAssetIdentity", "BrandAsset",
] as const
const POSITION_CURSOR = "ea-ratings-players:fc27:position-write-v1"

function state(row: {
  id: string; externalId: string | null; name: string; position: string; updatedAt: Date
  goalkeeperAttributes: null | { id: string; diving: number; handling: number; kicking: number;
    positioning: number; reflexes: number; payloadHash: string; updatedAt: Date; sourceObservationId?: string | null }
} | null): EaGoalkeeperOperationalState | null {
  if (!row?.externalId) return null
  return {
    playerId: row.id, externalId: row.externalId, name: row.name,
    position: row.position as EaGoalkeeperOperationalState["position"], playerUpdatedAt: row.updatedAt.toISOString(),
    attributes: row.goalkeeperAttributes ? {
      id: row.goalkeeperAttributes.id,
      diving: row.goalkeeperAttributes.diving,
      handling: row.goalkeeperAttributes.handling,
      kicking: row.goalkeeperAttributes.kicking,
      positioning: row.goalkeeperAttributes.positioning,
      reflexes: row.goalkeeperAttributes.reflexes,
      payloadHash: row.goalkeeperAttributes.payloadHash,
      updatedAt: row.goalkeeperAttributes.updatedAt.toISOString(),
    } : null,
  }
}

const playerStateSelect = {
  id: true, externalId: true, name: true, position: true, updatedAt: true,
  goalkeeperAttributes: { select: { id: true, diving: true, handling: true, kicking: true,
    positioning: true, reflexes: true, payloadHash: true, updatedAt: true, sourceObservationId: true } },
} as const

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
    async readPlayers(externalIds: readonly string[]) {
      const rows = await tx.player.findMany({ where: { externalId: { in: [...externalIds] } }, select: playerStateSelect })
      return new Map(rows.flatMap(row => {
        const current = state(row)
        return current ? [[current.externalId, current] as const] : []
      }))
    },
    createProvenance: (page: EaGoalkeeperSourcePage, plans: readonly EaGoalkeeperWritePlan[]) =>
      createProvenance(tx, page, plans),
    async createAttributesBatch(items: readonly Readonly<{ plan: EaGoalkeeperWritePlan; observationId: string;
      observedAt: Date }>[]) {
      const data = items.flatMap(({ plan, observationId, observedAt }) =>
        plan.playerId && plan.after ? [{ playerId: plan.playerId, ...values(plan, observationId, observedAt) }] : [])
      if (data.length !== items.length || !data.length) return 0
      return (await tx.playerGoalkeeperAttributes.createMany({ data })).count
    },
    async updateAttributes(plan: EaGoalkeeperWritePlan, expected: EaGoalkeeperOperationalState,
      observationId: string, observedAt: Date) {
      if (!plan.playerId || !plan.after || !expected.attributes) return 0
      const result = await tx.playerGoalkeeperAttributes.updateMany({ where: {
        playerId: plan.playerId,
        id: expected.attributes.id,
        payloadHash: expected.attributes.payloadHash,
        updatedAt: new Date(expected.attributes.updatedAt),
      }, data: values(plan, observationId, observedAt) })
      return result.count
    },
    async verify(plans: readonly EaGoalkeeperWritePlan[], observationIds: ReadonlyMap<number, string>) {
      const rows = await runEaGoalkeeperReadBackQuery({ step: "PLAYER_BATCH_READ",
        externalId: plans.length === 1 ? plans[0]!.externalId : null,
        query: () => tx.player.findMany({ where: { externalId: { in: plans.map(plan => plan.externalId) } },
          select: playerStateSelect }) })
      const currentPlayers = new Map(rows.flatMap(row => {
        const current = state(row)
        return current ? [[current.externalId, { state: current,
          sourceObservationId: row.goalkeeperAttributes?.sourceObservationId }] as const] : []
      }))
      for (const plan of plans) {
        const persisted = currentPlayers.get(plan.externalId)
        const current = persisted?.state ?? null
        const result = verifyEaGoalkeeperReadBack({ plan, current,
          expectedSourceObservationId: observationIds.get(plan.sourcePage),
          persistedSourceObservationId: persisted?.sourceObservationId })
        if (!result.ok) return result
      }
      return { ok: true as const }
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
