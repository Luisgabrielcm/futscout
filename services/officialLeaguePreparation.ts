import { OFFICIAL_LEAGUE_SOURCES } from "../lib/brackBrandSource"
import type { BrandAssetPilotIdentity } from "./brandAssetWrite"

// Exact source manifest. The writer uses its own explicit entries, activated after
// owner approval and Production preflight; this manifest cannot dynamically authorize writes.
export const PREPARED_OFFICIAL_LEAGUE_ALLOWLIST: readonly BrandAssetPilotIdentity[] = Object.freeze(
  OFFICIAL_LEAGUE_SOURCES.map(source => Object.freeze({ entityType: "LEAGUE" as const,
    entityId: source.entityId, provider: source.provider, providerEntityId: source.providerEntityId,
    assetType: "LOGO" as const })))
