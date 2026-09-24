import { OFFICIAL_LEAGUE_SOURCES } from "../lib/brackBrandSource"
import type { BrandAssetPilotIdentity } from "./brandAssetWrite"

// Prepared exact allowlist, deliberately NOT consumed by the writer.
// Move approved entries into BRAND_ASSET_PILOT_ALLOWLIST only after the owner reviews
// each operational decision and explicitly authorizes the corresponding registration.
export const PREPARED_OFFICIAL_LEAGUE_ALLOWLIST: readonly BrandAssetPilotIdentity[] = Object.freeze(
  OFFICIAL_LEAGUE_SOURCES.map(source => Object.freeze({ entityType: "LEAGUE" as const,
    entityId: source.entityId, provider: source.provider, providerEntityId: source.providerEntityId,
    assetType: "LOGO" as const })))
