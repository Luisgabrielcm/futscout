import { getVisualAssetSrc, type ImageKind } from "./visualAssets"
import { OFFICIAL_LEAGUE_SOURCES, officialLeagueSource, matchesOfficialLeagueSource, isOfficialLeagueRemoteUrl } from "./brackBrandSource"

export type AssetRightsStatus =
  | "APPROVED"
  | "REMOTE_ONLY"
  | "CACHE_ALLOWED"
  | "REVIEW_REQUIRED"
  | "BLOCKED"

export type AssetStatus =
  | "DISCOVERED"
  | "VALIDATED"
  | "ACTIVE"
  | "STALE"
  | "REMOVED"
  | "ERROR"

export type AssetOperationalDecision =
  | "NOT_AUTHORIZED"
  | "OWNER_AUTHORIZED_REMOTE_USE"
  | "REVOKED"

export type AssetDisplayPolicy = "DISPLAY_ALLOWED" | "DISPLAY_BLOCKED"

export type AssetPublicationPolicy = Readonly<{
  publicationEnabled: boolean
  blockedProviders: ReadonlySet<string>
  blockedEntityIds: ReadonlySet<string>
}>

export type BrandAssetEntityType = Extract<ImageKind, "club" | "league">
export type BrandAssetType = "CREST" | "LOGO"

export type AssetIdentity = Readonly<{
  entityType: BrandAssetEntityType
  provider: string
  providerEntityId: string | number
  assetType: BrandAssetType
}>

export type AssetReference = Readonly<{
  identity: AssetIdentity
  entityId: string
  sourceUrl: string
  storageUrl?: string | null
  contentHash?: string | null
  version: number
  fetchedAt: string
  rightsStatus: AssetRightsStatus
  displayPolicy: AssetDisplayPolicy
  operationalDecision?: AssetOperationalDecision
  operationalAuthorizedAt?: string | null
  operationalDecisionRef?: string | null
  operatorRiskAccepted?: boolean
  riskAcceptedAt?: string | null
  riskAcceptedBy?: string | null
  riskReason?: string | null
  sourceTermsUrl?: string | null
  revocable?: boolean
  /** Server-resolved publication switch. Keeps private runtime env out of client bundles. */
  publicationAllowedByServer?: boolean
  status: AssetStatus
}>

export type AssetRegistry = ReadonlyMap<string, AssetReference>

export function brandAssetPublicationPolicyFromEnvironment(
  value = process.env.BRAND_ASSET_PUBLICATION_ENABLED,
  blockedProviders = process.env.BRAND_ASSET_BLOCKED_PROVIDERS,
  blockedEntityIds = process.env.BRAND_ASSET_BLOCKED_ENTITY_IDS,
): AssetPublicationPolicy {
  const values = (input: string | undefined, normalize = (item: string) => item) => new Set((input ?? "").split(",")
    .map(item => normalize(item.trim())).filter(Boolean))
  return {
    publicationEnabled: value === "true",
    blockedProviders: values(blockedProviders, item => item.toLowerCase()),
    blockedEntityIds: values(blockedEntityIds),
  }
}

export function assetIdentityKey(identity: AssetIdentity): string {
  return [identity.entityType, identity.provider.trim().toLowerCase(), String(identity.providerEntityId).trim(), identity.assetType].join(":")
}

function isHttpsUrl(value: string | null | undefined): boolean {
  try {
    const url = new URL(value ?? "")
    return url.protocol === "https:" && !url.username && !url.password
  } catch {
    return false
  }
}

/** Resolve only by a provider identity; names are deliberately not considered. */
export function resolveAssetByIdentity(identity: AssetIdentity | null | undefined, registry: AssetRegistry,
  policy = brandAssetPublicationPolicyFromEnvironment()): AssetReference | null {
  if (!identity || !identity.provider.trim() || String(identity.providerEntityId).trim() === "") return null
  const reference = registry.get(assetIdentityKey(identity))
  return reference && assetIdentityKey(reference.identity) === assetIdentityKey(identity)
    ? normalizeAssetReference(reference, policy) : null
}

function permittedAssetUrl(reference: AssetReference, policy: AssetPublicationPolicy): string | null {
  const source = officialLeagueSource(reference.entityId)
  const official = !!source || OFFICIAL_LEAGUE_SOURCES.some(item => item.provider === reference.identity.provider) ||
    isOfficialLeagueRemoteUrl(reference.sourceUrl) || isOfficialLeagueRemoteUrl(reference.storageUrl ?? "")
  if (official && !matchesOfficialLeagueSource({ ...reference, ...reference.identity })) return null
  if (reference.status !== "ACTIVE") return null
  if (reference.rightsStatus === "BLOCKED" || reference.operationalDecision === "REVOKED") return null
  if (reference.displayPolicy !== "DISPLAY_ALLOWED") return null
  if (policy.blockedProviders.has(reference.identity.provider.trim().toLowerCase()) ||
      policy.blockedEntityIds.has(reference.entityId)) return null

  const sourceUrl = getVisualAssetSrc(reference.sourceUrl, reference.identity.entityType)
  const storageUrl = getVisualAssetSrc(reference.storageUrl, reference.identity.entityType)
  if (reference.rightsStatus === "REVIEW_REQUIRED") {
    const operationalAuthorizedAt = reference.operationalAuthorizedAt
    const riskAcceptedAt = reference.riskAcceptedAt
    const riskAcceptedBy = reference.riskAcceptedBy?.trim()
    const riskReason = reference.riskReason?.trim()
    const authorizationRef = reference.operationalDecisionRef?.trim()
    const sourceTermsUrl = reference.sourceTermsUrl
    const riskAcceptanceComplete = reference.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
      reference.operatorRiskAccepted === true && reference.revocable === true &&
      operationalAuthorizedAt && Number.isFinite(Date.parse(operationalAuthorizedAt)) &&
      riskAcceptedAt && Number.isFinite(Date.parse(riskAcceptedAt)) &&
      riskAcceptedBy && riskReason && authorizationRef && isHttpsUrl(sourceTermsUrl)
    const publicationEnabled = reference.publicationAllowedByServer ?? policy.publicationEnabled
    return publicationEnabled && riskAcceptanceComplete ? (source ? source.deliveryPath : sourceUrl) : null
  }
  if (reference.rightsStatus === "REMOTE_ONLY") return sourceUrl
  return storageUrl ?? sourceUrl
}

export function normalizeAssetReference(reference: AssetReference,
  policy = brandAssetPublicationPolicyFromEnvironment()): AssetReference | null {
  const compatibleType = (reference.identity.entityType === "club" && reference.identity.assetType === "CREST") ||
    (reference.identity.entityType === "league" && reference.identity.assetType === "LOGO")
  if (!reference.entityId.trim() || !reference.identity.provider.trim() ||
      String(reference.identity.providerEntityId).trim() === "" || !Number.isInteger(reference.version) || reference.version < 1 ||
      !compatibleType ||
      !Number.isFinite(Date.parse(reference.fetchedAt)) || !permittedAssetUrl(reference, policy)) return null
  return reference
}

/** Remove duplicate references while preserving first-seen order. */
export function deduplicateAssetReferences(references: readonly AssetReference[]): AssetReference[] {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = assetIdentityKey(reference.identity)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function resolveAssetSource(input: string | AssetReference | null | undefined, kind: ImageKind,
  policy = brandAssetPublicationPolicyFromEnvironment()): string | null {
  if (!input) return null
  if (typeof input === "string") return isOfficialLeagueRemoteUrl(input) ? null : getVisualAssetSrc(input, kind)
  if (input.identity.entityType !== kind || !normalizeAssetReference(input, policy)) return null
  return permittedAssetUrl(input, policy)
}
