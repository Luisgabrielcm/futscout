import { CYPRUS_SOURCE } from "../../../../lib/brackBrandSource"
import { serveCyprusAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return serveCyprusAsset(request, async () =>
    (await getBrandAssetsForEntities({ leagueIds: [CYPRUS_SOURCE.entityId] })).leagues.get(CYPRUS_SOURCE.entityId))
}
