import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { RED_STAR, type RedStarSnapshot, type RedStarStore, type RedStarTransaction } from "./redStarCorrection"

async function read(tx: Prisma.TransactionClient): Promise<RedStarSnapshot> {
  const club = await tx.club.findUniqueOrThrow({ where: { id: RED_STAR.clubId } })
  const identity = await tx.brandAssetIdentity.findUniqueOrThrow({ where: { id: RED_STAR.identityId } })
  const asset = await tx.brandAsset.findUniqueOrThrow({ where: { id: RED_STAR.assetId } })
  const playerIds = (await tx.player.findMany({ where: { clubId: RED_STAR.clubId }, select: { id: true }, orderBy: { id: "asc" } })).map(p => p.id)
  const assetIds = (await tx.brandAsset.findMany({ where: { identityId: RED_STAR.identityId }, select: { id: true }, orderBy: { id: "asc" } })).map(a => a.id)
  const otherClubOwners = (await tx.club.findMany({ where: { id: { not: RED_STAR.clubId }, apiFootballId: { in: [104, 4396] } }, select: { id: true }, orderBy: { id: "asc" } })).map(c => c.id)
  const otherIdentityOwners = (await tx.brandAssetIdentity.findMany({ where: { id: { not: RED_STAR.identityId }, entityType: "CLUB",
    OR: [{ entityId: RED_STAR.clubId }, { provider: "api-football", providerEntityId: { in: ["104", "4396"] } }] },
    select: { id: true }, orderBy: { id: "asc" } })).map(i => i.id)
  // Fixed table names only; bound exclusions. Detect changes to all players,
  // leagues, other clubs and every unrelated Registry row, inside the transaction.
  const digests = []
  for (const [table, excludedId] of [["Player", null], ["League", null], ["Club", RED_STAR.clubId],
    ["BrandAssetIdentity", RED_STAR.identityId], ["BrandAsset", RED_STAR.assetId]] as const) {
    digests.push(await tx.$queryRawUnsafe(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) AS hash FROM "${table}" t WHERE ($1::text IS NULL OR id <> $1::text)`, excludedId))
  }
  return JSON.parse(JSON.stringify({ club, identity, asset, playerIds, assetIds, otherClubOwners, otherIdentityOwners,
    protectedHash: createHash("sha256").update(JSON.stringify(digests)).digest("hex") }))
}

export function createPrismaRedStarCorrectionStore(db: Pick<PrismaClient, "$transaction">): RedStarStore {
  return {
    read: () => withPrismaReadOnly(db, read),
    transaction: work => db.$transaction(async tx => {
      const port: RedStarTransaction = {
        read: () => read(tx),
        changeClub: async (before, after) => (await tx.club.updateMany({ where: {
          id: RED_STAR.clubId, apiFootballId: before.apiFootballId, externalId: before.externalId,
          leagueId: before.leagueId, updatedAt: new Date(before.updatedAt),
        }, data: { apiFootballId: after.apiFootballId, updatedAt: new Date(after.updatedAt) } })).count,
        changeIdentity: async (before, after) => (await tx.brandAssetIdentity.updateMany({ where: {
          id: RED_STAR.identityId, version: before.version, updatedAt: new Date(before.updatedAt),
          status: before.status, providerEntityId: before.providerEntityId,
        }, data: { status: after.status, version: after.version, updatedAt: new Date(after.updatedAt),
          evidence: after.evidence as Prisma.InputJsonValue } })).count,
        changeAsset: async (before, after) => (await tx.brandAsset.updateMany({ where: {
          id: RED_STAR.assetId, identityId: RED_STAR.identityId, version: before.version,
          updatedAt: new Date(before.updatedAt), operationalDecision: before.operationalDecision,
          displayPolicy: before.displayPolicy, status: before.status,
        }, data: { operationalDecision: after.operationalDecision, displayPolicy: after.displayPolicy,
          version: after.version, updatedAt: new Date(after.updatedAt) } })).count,
      }
      return work(port)
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 60000 }),
  }
}
