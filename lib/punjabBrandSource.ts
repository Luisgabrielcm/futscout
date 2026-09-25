// Official club source. API 3466 proves club identity; it is not this source's provider ID.
export const PUNJAB_SOURCE = Object.freeze({
  entityId: "cmtbpdgt2009zpkuc9j70jvc8", provider: "official-punjab",
  providerEntityId: "wp-content/uploads/website-logo-3.svg", expectedApiFootballId: 3466,
  sourceUrl: "https://rgpunjabfc.com/wp-content/uploads/website-logo-3.svg",
  contentHash: "9913f9994757e5af31302428699afa8bd28c2d489ebc0b3d83ba2894b17bd472",
  evidenceUrl: "https://rgpunjabfc.com/isl-2023-24-punjab-fc-a-club-reminiscent-of-jct-mills-hopes-to-create-its-own-brand/",
  season: "current-2026", deliveryPath: "/api/brand-assets/punjab", bytes: 14442,
  width: 182.7, height: 163.3,
})

export function matchesPunjabSource(value: {
  entityType: string; entityId: string; provider: string; providerEntityId: string | number;
  assetType: string; sourceUrl: string; contentHash?: string | null; storageUrl?: string | null; rightsStatus: string;
}): boolean {
  return (value.entityType === "CLUB" || value.entityType === "club") && value.entityId === PUNJAB_SOURCE.entityId &&
    value.provider === PUNJAB_SOURCE.provider && value.providerEntityId === PUNJAB_SOURCE.providerEntityId &&
    value.assetType === "CREST" && value.sourceUrl === PUNJAB_SOURCE.sourceUrl &&
    value.contentHash === PUNJAB_SOURCE.contentHash && value.storageUrl === null && value.rightsStatus === "REVIEW_REQUIRED"
}

export function isPunjabRemoteUrl(value: string): boolean {
  try { return new URL(value).hostname === "rgpunjabfc.com" } catch { return false }
}
