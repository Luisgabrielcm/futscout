import "server-only"

import { prisma } from "../lib/prisma"
import { brandAssetPublicationPolicyFromEnvironment, type AssetReference } from "../lib/assetPipeline"

export type BrandAssetMaps = Readonly<{
  clubs: ReadonlyMap<string, AssetReference>
  leagues: ReadonlyMap<string, AssetReference>
}>

export async function getBrandAssetsForEntities(input: Readonly<{
  clubIds?: readonly string[]
  leagueIds?: readonly string[]
}>): Promise<BrandAssetMaps> {
  const clubIds = [...new Set(input.clubIds ?? [])]
  const leagueIds = [...new Set(input.leagueIds ?? [])]
  if (!clubIds.length && !leagueIds.length) return { clubs: new Map(), leagues: new Map() }

  const identities = await prisma.brandAssetIdentity.findMany({
    where: {
      status: "VERIFIED",
      OR: [
        ...(clubIds.length ? [{ entityType: "CLUB" as const, entityId: { in: clubIds } }] : []),
        ...(leagueIds.length ? [{ entityType: "LEAGUE" as const, entityId: { in: leagueIds } }] : []),
      ],
    },
    select: {
      entityType: true,
      entityId: true,
      provider: true,
      providerEntityId: true,
      assets: {
        where: { status: "ACTIVE" },
        orderBy: { version: "desc" },
        select: {
          assetType: true,
          sourceUrl: true,
          storageUrl: true,
          contentHash: true,
          version: true,
          fetchedAt: true,
          rightsStatus: true,
          displayPolicy: true,
          operationalDecision: true,
          operationalAuthorizedAt: true,
          operationalDecisionRef: true,
          operatorRiskAccepted: true,
          riskAcceptedAt: true,
          riskAcceptedBy: true,
          riskReason: true,
          sourceTermsUrl: true,
          revocable: true,
          status: true,
        },
      },
    },
  })

  const clubs = new Map<string, AssetReference>()
  const leagues = new Map<string, AssetReference>()
  const publicationPolicy = brandAssetPublicationPolicyFromEnvironment()
  for (const identity of identities) {
    const expectedType = identity.entityType === "CLUB" ? "CREST" : "LOGO"
    const asset = identity.assets.find(item => item.assetType === expectedType)
    if (!asset) continue
    const reference: AssetReference = {
      identity: {
        entityType: identity.entityType === "CLUB" ? "club" : "league",
        provider: identity.provider,
        providerEntityId: identity.providerEntityId,
        assetType: asset.assetType,
      },
      entityId: identity.entityId,
      sourceUrl: asset.sourceUrl,
      storageUrl: asset.storageUrl,
      contentHash: asset.contentHash,
      version: asset.version,
      fetchedAt: asset.fetchedAt.toISOString(),
      rightsStatus: asset.rightsStatus,
      displayPolicy: asset.displayPolicy,
      operationalDecision: asset.operationalDecision,
      operationalAuthorizedAt: asset.operationalAuthorizedAt?.toISOString() ?? null,
      operationalDecisionRef: asset.operationalDecisionRef,
      operatorRiskAccepted: asset.operatorRiskAccepted,
      riskAcceptedAt: asset.riskAcceptedAt?.toISOString() ?? null,
      riskAcceptedBy: asset.riskAcceptedBy,
      riskReason: asset.riskReason,
      sourceTermsUrl: asset.sourceTermsUrl,
      revocable: asset.revocable,
      publicationAllowedByServer: publicationPolicy.publicationEnabled &&
        !publicationPolicy.blockedProviders.has(identity.provider.trim().toLowerCase()) &&
        !publicationPolicy.blockedEntityIds.has(identity.entityId),
      status: asset.status,
    }
    if (identity.entityType === "CLUB") clubs.set(identity.entityId, reference)
    else leagues.set(identity.entityId, reference)
  }
  return { clubs, leagues }
}
