import { getVisualAssetSrc, type ImageKind } from "./visualAssets"

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
  operationalDecision?: AssetOperationalDecision
  operationalAuthorizedAt?: string | null
  operationalDecisionRef?: string | null
  status: AssetStatus
}>

export type AssetRegistry = ReadonlyMap<string, AssetReference>

export function assetIdentityKey(identity: AssetIdentity): string {
  return [identity.entityType, identity.provider.trim().toLowerCase(), String(identity.providerEntityId).trim(), identity.assetType].join(":")
}

/** Resolve only by a provider identity; names are deliberately not considered. */
export function resolveAssetByIdentity(identity: AssetIdentity | null | undefined, registry: AssetRegistry): AssetReference | null {
  if (!identity || !identity.provider.trim() || String(identity.providerEntityId).trim() === "") return null
  const reference = registry.get(assetIdentityKey(identity))
  return reference && assetIdentityKey(reference.identity) === assetIdentityKey(identity)
    ? normalizeAssetReference(reference) : null
}

function permittedAssetUrl(reference: AssetReference): string | null {
  if (reference.status !== "ACTIVE") return null
  if (reference.rightsStatus === "BLOCKED" || reference.operationalDecision === "REVOKED") return null

  const sourceUrl = getVisualAssetSrc(reference.sourceUrl, reference.identity.entityType)
  const storageUrl = getVisualAssetSrc(reference.storageUrl, reference.identity.entityType)
  if (reference.rightsStatus === "REVIEW_REQUIRED") {
    const authorizedAt = reference.operationalAuthorizedAt
    const authorizationRef = reference.operationalDecisionRef?.trim()
    return reference.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
      authorizedAt && Number.isFinite(Date.parse(authorizedAt)) && authorizationRef ? sourceUrl : null
  }
  if (reference.rightsStatus === "REMOTE_ONLY") return sourceUrl
  return storageUrl ?? sourceUrl
}

export function normalizeAssetReference(reference: AssetReference): AssetReference | null {
  const compatibleType = (reference.identity.entityType === "club" && reference.identity.assetType === "CREST") ||
    (reference.identity.entityType === "league" && reference.identity.assetType === "LOGO")
  if (!reference.entityId.trim() || !reference.identity.provider.trim() ||
      String(reference.identity.providerEntityId).trim() === "" || !Number.isInteger(reference.version) || reference.version < 1 ||
      !compatibleType ||
      !Number.isFinite(Date.parse(reference.fetchedAt)) || !permittedAssetUrl(reference)) return null
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

export function resolveAssetSource(input: string | AssetReference | null | undefined, kind: ImageKind): string | null {
  if (!input) return null
  if (typeof input === "string") return getVisualAssetSrc(input, kind)
  if (input.identity.entityType !== kind || !normalizeAssetReference(input)) return null
  return permittedAssetUrl(input)
}
