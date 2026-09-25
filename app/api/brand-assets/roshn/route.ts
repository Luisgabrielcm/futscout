import { ROSHN_SOURCE } from "../../../../lib/brackBrandSource"
import { serveRoshnAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return serveRoshnAsset(request, async () =>
    (await getBrandAssetsForEntities({ leagueIds: [ROSHN_SOURCE.entityId] })).leagues.get(ROSHN_SOURCE.entityId))
}
