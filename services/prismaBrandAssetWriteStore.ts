import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type { BrandAssetAudit, BrandAssetCandidate, BrandAssetPilotIdentity, BrandAssetRow,
  BrandAssetType, BrandAssetWriteStore, BrandEntityType, BrandIdentityRow } from "./brandAssetWrite"

const decodeIdentity = (row: { id: string; entityType: string; entityId: string; provider: string; providerEntityId: string;
  status: string; version: number }): BrandIdentityRow => row as BrandIdentityRow
const decodeAsset = (row: { id: string; identityId: string; assetType: string; sourceUrl: string; storageUrl: string | null;
  contentHash: string | null; version: number; fetchedAt: Date; rightsStatus: string; operationalDecision: string;
  displayPolicy: string;
  operationalAuthorizedAt: Date | null; operationalDecisionRef: string | null; operatorRiskAccepted: boolean;
  riskAcceptedAt: Date | null; riskAcceptedBy: string | null; riskReason: string | null; sourceTermsUrl: string | null;
  revocable: boolean; status: string }): BrandAssetRow => ({
    ...row, assetType: row.assetType as BrandAssetType, fetchedAt: row.fetchedAt.toISOString(),
    operationalDecision: row.operationalDecision as BrandAssetRow["operationalDecision"],
    displayPolicy: row.displayPolicy as BrandAssetRow["displayPolicy"],
    operationalAuthorizedAt: row.operationalAuthorizedAt?.toISOString() ?? null,
    riskAcceptedAt: row.riskAcceptedAt?.toISOString() ?? null,
    rightsStatus: row.rightsStatus as BrandAssetRow["rightsStatus"], status: row.status as BrandAssetRow["status"],
  })

async function audit(db: Pick<PrismaClient, "$transaction">): Promise<BrandAssetAudit> {
  return withPrismaReadOnly(db, async tx => {
    const table = async (name: "Club" | "League" | "BrandAssetIdentity" | "BrandAsset") =>
      (await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
        `SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) hash FROM "${name}" t`))[0]
    return { protected: { Club: await table("Club"), League: await table("League") },
      registry: { BrandAssetIdentity: await table("BrandAssetIdentity"), BrandAsset: await table("BrandAsset") } }
  })
}

function transactionPort(tx: Prisma.TransactionClient) {
  return {
    async readLocalEntity(entityType: BrandEntityType, entityId: string) {
      if (entityType === "CLUB") {
        const row = await tx.club.findUnique({ where: { id: entityId }, select: { id: true, apiFootballId: true } })
        return row && { id: row.id, providerEntityId: row.apiFootballId === null ? null : String(row.apiFootballId) }
      }
      const row = await tx.league.findUnique({ where: { id: entityId }, select: { id: true } })
      return row && { id: row.id, providerEntityId: null }
    },
    async findIdentityByLocal(input: BrandAssetPilotIdentity) {
      const row = await tx.brandAssetIdentity.findUnique({ where: { entityType_entityId_provider: {
        entityType: input.entityType, entityId: input.entityId, provider: input.provider } },
        select: { id: true, entityType: true, entityId: true, provider: true, providerEntityId: true, status: true, version: true } })
      return row ? decodeIdentity(row) : null
    },
    async findIdentityByProvider(input: BrandAssetPilotIdentity) {
      const row = await tx.brandAssetIdentity.findUnique({ where: { entityType_provider_providerEntityId: {
        entityType: input.entityType, provider: input.provider, providerEntityId: input.providerEntityId } },
        select: { id: true, entityType: true, entityId: true, provider: true, providerEntityId: true, status: true, version: true } })
      return row ? decodeIdentity(row) : null
    },
    async latestAsset(identityId: string, assetType: BrandAssetType) {
      const row = await tx.brandAsset.findFirst({ where: { identityId, assetType }, orderBy: { version: "desc" }, select: {
        id: true, identityId: true, assetType: true, sourceUrl: true, storageUrl: true, contentHash: true, version: true,
        fetchedAt: true, rightsStatus: true, displayPolicy: true, operationalDecision: true, operationalAuthorizedAt: true,
        operationalDecisionRef: true, operatorRiskAccepted: true, riskAcceptedAt: true, riskAcceptedBy: true,
        riskReason: true, sourceTermsUrl: true, revocable: true, status: true } })
      return row ? decodeAsset(row) : null
    },
    async activeAsset(identityId: string, assetType: BrandAssetType) {
      const row = await tx.brandAsset.findFirst({ where: { identityId, assetType, status: "ACTIVE" }, select: {
        id: true, identityId: true, assetType: true, sourceUrl: true, storageUrl: true, contentHash: true, version: true,
        fetchedAt: true, rightsStatus: true, displayPolicy: true, operationalDecision: true, operationalAuthorizedAt: true,
        operationalDecisionRef: true, operatorRiskAccepted: true, riskAcceptedAt: true, riskAcceptedBy: true,
        riskReason: true, sourceTermsUrl: true, revocable: true, status: true } })
      return row ? decodeAsset(row) : null
    },
    async createIdentity(input: BrandAssetCandidate) {
      return decodeIdentity(await tx.brandAssetIdentity.create({ data: { entityType: input.entityType, entityId: input.entityId,
        provider: input.provider, providerEntityId: input.providerEntityId, status: "VERIFIED", version: 1,
        verifiedAt: new Date(input.fetchedAt), evidence: { source: "guarded-brand-asset-write" } },
        select: { id: true, entityType: true, entityId: true, provider: true, providerEntityId: true, status: true, version: true } }))
    },
    async markActiveStale(id: string, version: number) {
      return (await tx.brandAsset.updateMany({ where: { id, version, status: "ACTIVE" }, data: { status: "STALE" } })).count
    },
    async createAsset(identityId: string, version: number, input: BrandAssetCandidate) {
      const row = await tx.brandAsset.create({ data: { identityId, assetType: input.assetType, sourceUrl: input.sourceUrl,
        storageUrl: input.storageUrl, contentHash: input.contentHash, version, fetchedAt: new Date(input.fetchedAt),
        rightsStatus: input.rightsStatus, displayPolicy: input.displayPolicy, operationalDecision: input.operationalDecision,
        operationalAuthorizedAt: input.operationalAuthorizedAt === null ? null : new Date(input.operationalAuthorizedAt),
        operationalDecisionRef: input.operationalDecisionRef, operatorRiskAccepted: input.operatorRiskAccepted,
        riskAcceptedAt: input.riskAcceptedAt === null ? null : new Date(input.riskAcceptedAt), riskAcceptedBy: input.riskAcceptedBy,
        riskReason: input.riskReason, sourceTermsUrl: input.sourceTermsUrl, revocable: input.revocable,
        status: "ACTIVE" }, select: { id: true, identityId: true, assetType: true,
        sourceUrl: true, storageUrl: true, contentHash: true, version: true, fetchedAt: true, rightsStatus: true,
        displayPolicy: true, operationalDecision: true, operationalAuthorizedAt: true, operationalDecisionRef: true,
        operatorRiskAccepted: true, riskAcceptedAt: true, riskAcceptedBy: true, riskReason: true,
        sourceTermsUrl: true, revocable: true, status: true } })
      return decodeAsset(row)
    },
  }
}

// Deliberately no CLI/env/singleton. This factory is inert until a separately authorized caller supplies a Prisma client.
export function createPrismaBrandAssetWriteStore(db: Pick<PrismaClient, "$transaction">): BrandAssetWriteStore {
  return { audit: () => audit(db), transaction: work => db.$transaction(tx => work(transactionPort(tx)),
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 }) }
}
