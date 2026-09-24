// Technical provenance only. This does not grant publication or writer authorization.
export const BRACK_SOURCE = Object.freeze({
  entityId: "cmt9cdhm202ycukuc9eatc0la",
  provider: "official-brack-media",
  providerEntityId: "236618", // Official media-kit item, not an API-Football competition ID.
  sourceUrl: "https://d21buns5ku92am.cloudfront.net/69864/images/602591-RZ_BSL_Logo_Portrait_RGB-64e276-original-1753264028.png?download=1",
  contentHash: "9495ccc727eb8b6fffef811a77f0a1ea6f751bb848c4aac99116ec5a85a3c8ea",
  evidenceUrl: "https://newsroom.brackalltron.ch/en/assets/236618/",
  season: "2025/26",
  deliveryPath: "/api/brand-assets/brack",
  bytes: 35259,
  width: 1044,
  height: 1005,
})

export function matchesBrackSource(value: {
  entityType: string; entityId: string; provider: string; providerEntityId: string | number;
  assetType: string; sourceUrl: string; contentHash?: string | null; storageUrl?: string | null;
  rightsStatus: string;
}): boolean {
  return (value.entityType === "LEAGUE" || value.entityType === "league") &&
    value.entityId === BRACK_SOURCE.entityId && value.provider === BRACK_SOURCE.provider &&
    value.providerEntityId === BRACK_SOURCE.providerEntityId && value.assetType === "LOGO" &&
    value.sourceUrl === BRACK_SOURCE.sourceUrl && value.contentHash === BRACK_SOURCE.contentHash &&
    value.storageUrl === null && value.rightsStatus === "REVIEW_REQUIRED"
}

export function isBrackRemoteUrl(value: string): boolean {
  try { return new URL(value).hostname === new URL(BRACK_SOURCE.sourceUrl).hostname }
  catch { return false }
}

type SelectableIdentity = {
  entityType: string; entityId: string; provider: string; providerEntityId: string; status: string;
  assets: readonly { assetType: string; status: string; rightsStatus: string;
    operationalDecision: string; displayPolicy: string }[];
}

/** No provider fallback, no order-dependent Map overwrites. Blocked history is a veto for Brack. */
export function selectBrandIdentities<T extends SelectableIdentity>(identities: readonly T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const identity of identities) {
    const key = `${identity.entityType}:${identity.entityId}`
    groups.set(key, [...(groups.get(key) ?? []), identity])
  }
  const selected: T[] = []
  for (const group of groups.values()) {
    const brack = group[0].entityType === "LEAGUE" && group[0].entityId === BRACK_SOURCE.entityId
    if (brack && group.some(identity => identity.status === "BLOCKED" || identity.assets.some(asset =>
      asset.assetType === "LOGO" && (asset.rightsStatus === "BLOCKED" ||
        asset.operationalDecision === "REVOKED" || asset.displayPolicy === "DISPLAY_BLOCKED")))) continue
    const candidates = group.filter(identity => identity.status === "VERIFIED" && (brack
      ? identity.provider === BRACK_SOURCE.provider && identity.providerEntityId === BRACK_SOURCE.providerEntityId
      : identity.provider === "api-football"))
    if (candidates.length !== 1) continue
    const identity = candidates[0]
    const type = identity.entityType === "CLUB" ? "CREST" : "LOGO"
    if (identity.assets.filter(asset => asset.assetType === type && asset.status === "ACTIVE").length === 1) {
      selected.push(identity)
    }
  }
  return selected
}
