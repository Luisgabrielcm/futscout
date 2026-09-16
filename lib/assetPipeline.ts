import { getVisualAssetSrc, type ImageKind } from "./visualAssets"

export type AssetRightsStatus =
  | "LOCAL_APPROVED"
  | "REMOTE_REFERENCE_ALLOWED"
  | "CACHE_ALLOWED"
  | "SOURCE_REVIEW_REQUIRED"
  | "UNAVAILABLE"

export type AssetIdentity = Readonly<{
  kind: ImageKind
  provider: string
  providerAssetId: string | number
}>

export type AssetReference = Readonly<{
  identity: AssetIdentity
  sourceUrl: string
  status: AssetRightsStatus
  contentHash?: string
  fetchedAt?: string
  version?: string
}>

export type AssetRegistry = ReadonlyMap<string, AssetReference>

export function assetIdentityKey(identity: AssetIdentity): string {
  return `${identity.kind}:${identity.provider}:${String(identity.providerAssetId).trim()}`
}

/** Resolve only by a provider identity; names are deliberately not considered. */
export function resolveAssetByIdentity(identity: AssetIdentity | null | undefined, registry: AssetRegistry): AssetReference | null {
  if (!identity || String(identity.providerAssetId).trim() === "") return null
  const reference = registry.get(assetIdentityKey(identity))
  return reference ? normalizeAssetReference(reference) : null
}

export function normalizeAssetReference(reference: AssetReference): AssetReference | null {
  if (reference.status === "UNAVAILABLE" || reference.status === "SOURCE_REVIEW_REQUIRED") return null
  const sourceUrl = getVisualAssetSrc(reference.sourceUrl, reference.identity.kind)
  if (!sourceUrl) return null
  return sourceUrl === reference.sourceUrl ? reference : { ...reference, sourceUrl }
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
  return normalizeAssetReference(input)?.sourceUrl ?? null
}
