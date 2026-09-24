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

// Provider ID is the exact official asset path/version, not API-Football competition 323.
export const ISL_SOURCE = Object.freeze({
  entityId: "cmtacvytc02r59guc438hbrlo", provider: "official-isl",
  providerEntityId: "static-assets/images/svg/isl-logo.svg?v=100.54",
  sourceUrl: "https://www.indiansuperleague.com/static-assets/images/svg/isl-logo.svg?v=100.54",
  contentHash: "58e9824e6a3bc95081139c3fa64385994facc9e45feb59f93e8848e2bbaec884",
  evidenceUrl: "https://www.indiansuperleague.com/standings/1000",
  season: "2025/26", deliveryPath: "/api/brand-assets/isl", bytes: 22329, width: 74, height: 74,
})
export const OFFICIAL_LEAGUE_SOURCES = Object.freeze([BRACK_SOURCE, ISL_SOURCE])
export function officialLeagueSource(entityId: string) {
  return OFFICIAL_LEAGUE_SOURCES.find(source => source.entityId === entityId)
}

export function matchesBrackSource(value: {
  entityType: string; entityId: string; provider: string; providerEntityId: string | number;
  assetType: string; sourceUrl: string; contentHash?: string | null; storageUrl?: string | null;
  rightsStatus: string;
}): boolean {
  return value.entityId === BRACK_SOURCE.entityId && matchesOfficialLeagueSource(value)
}

export function matchesOfficialLeagueSource(value: Parameters<typeof matchesBrackSource>[0]): boolean {
  const source = officialLeagueSource(value.entityId)
  if (!source) return false
  return (value.entityType === "LEAGUE" || value.entityType === "league") &&
    value.provider === source.provider && value.providerEntityId === source.providerEntityId && value.assetType === "LOGO" &&
    value.sourceUrl === source.sourceUrl && value.contentHash === source.contentHash &&
    value.storageUrl === null && value.rightsStatus === "REVIEW_REQUIRED"
}

export function isBrackRemoteUrl(value: string): boolean {
  try { return new URL(value).hostname === new URL(BRACK_SOURCE.sourceUrl).hostname }
  catch { return false }
}

export function isOfficialLeagueRemoteUrl(value: string): boolean {
  try { return OFFICIAL_LEAGUE_SOURCES.some(source => new URL(value).hostname === new URL(source.sourceUrl).hostname) }
  catch { return false }
}

type SelectableIdentity = {
  entityType: string; entityId: string; provider: string; providerEntityId: string; status: string;
  assets: readonly { assetType: string; status: string; rightsStatus: string;
    operationalDecision: string; displayPolicy: string }[];
}

/** No provider fallback. Negative history vetoes each supported official league independently. */
export function selectBrandIdentities<T extends SelectableIdentity>(identities: readonly T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const identity of identities) {
    const key = `${identity.entityType}:${identity.entityId}`
    groups.set(key, [...(groups.get(key) ?? []), identity])
  }
  const selected: T[] = []
  for (const group of groups.values()) {
    const source = group[0].entityType === "LEAGUE" ? officialLeagueSource(group[0].entityId) : undefined
    if (source && group.some(identity => identity.status === "BLOCKED" || identity.assets.some(asset =>
      asset.assetType === "LOGO" && (asset.rightsStatus === "BLOCKED" ||
        asset.operationalDecision === "REVOKED" || asset.displayPolicy === "DISPLAY_BLOCKED")))) continue
    const candidates = group.filter(identity => identity.status === "VERIFIED" && (source
      ? identity.provider === source.provider && identity.providerEntityId === source.providerEntityId
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
