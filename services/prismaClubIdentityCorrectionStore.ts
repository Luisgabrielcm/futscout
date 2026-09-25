import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import type { ClubCorrectionPin, ClubCorrectionSnapshot, ClubCorrectionStore } from "./clubIdentityCorrection"

export function createClubCorrectionStore(db: Pick<PrismaClient, "$transaction">, pin: ClubCorrectionPin): ClubCorrectionStore {
  async function read(tx: Prisma.TransactionClient): Promise<ClubCorrectionSnapshot> {
    const club = await tx.club.findUniqueOrThrow({ where: { id: pin.clubId } })
    const identities = await tx.brandAssetIdentity.findMany({ where: { entityType: "CLUB", entityId: pin.clubId }, include: { assets: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } })
    const playerIds = (await tx.player.findMany({ where: { clubId: pin.clubId }, select: { id: true }, orderBy: { id: "asc" } })).map(p => p.id)
    const conflicts = [
      ...(await tx.club.findMany({ where: { id: { not: pin.clubId }, apiFootballId: pin.newId }, select: { id: true }, orderBy: { id: "asc" } })).map(c => `club:${c.id}`),
      ...(await tx.brandAssetIdentity.findMany({ where: { entityType: "CLUB", provider: "api-football", providerEntityId: String(pin.newId) }, select: { id: true }, orderBy: { id: "asc" } })).map(i => `identity:${i.id}`),
    ]
    const digests = []
    for (const table of ["Player", "League", "Club", "BrandAssetIdentity", "BrandAsset"] as const) {
      const excluded = table === "Club" ? [pin.clubId] : table === "BrandAssetIdentity" ? identities.map(i => i.id) : table === "BrandAsset" ? identities.flatMap(i => i.assets.map(a => a.id)) : []
      digests.push(await tx.$queryRawUnsafe(`SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) hash FROM "${table}" t WHERE NOT (id = ANY($1::text[]))`, excluded))
    }
    return JSON.parse(JSON.stringify({ club, identities, playerIds, conflicts, protectedHash: createHash("sha256").update(JSON.stringify(digests)).digest("hex") }))
  }
  return {
    read: () => withPrismaReadOnly(db, read),
    transaction: work => db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'")
      return work({ read: () => read(tx), apply: async (before, after) => {
        const changed = await tx.club.updateMany({ where: { id: pin.clubId, externalId: before.club.externalId, leagueId: before.club.leagueId, apiFootballId: before.club.apiFootballId, updatedAt: new Date(before.club.updatedAt) }, data: { apiFootballId: after.club.apiFootballId, updatedAt: new Date(after.club.updatedAt) } })
        if (changed.count !== 1) throw new Error("CLUB_CAS")
        for (const original of before.identities) {
          const next = after.identities.find(i => i.id === original.id)!
          const identity = await tx.brandAssetIdentity.updateMany({ where: { id: original.id, status: original.status, version: original.version, updatedAt: new Date(original.updatedAt) }, data: { status: next.status, version: next.version, updatedAt: new Date(next.updatedAt), evidence: next.evidence as Prisma.InputJsonValue } })
          if (identity.count !== 1) throw new Error("IDENTITY_CAS")
          for (const asset of original.assets) {
            const expected = next.assets.find(a => a.id === asset.id)!
            const result = await tx.brandAsset.updateMany({ where: { id: asset.id, identityId: original.id, version: asset.version, status: asset.status, operationalDecision: asset.operationalDecision, displayPolicy: asset.displayPolicy, updatedAt: new Date(asset.updatedAt) }, data: { operationalDecision: expected.operationalDecision, displayPolicy: expected.displayPolicy, version: expected.version, updatedAt: new Date(expected.updatedAt) } })
            if (result.count !== 1) throw new Error("ASSET_CAS")
          }
        }
      } })
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 60000 }),
  }
}
