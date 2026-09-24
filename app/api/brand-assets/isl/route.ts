import { ISL_SOURCE } from "../../../../lib/brackBrandSource"
import { serveIslAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return serveIslAsset(request, async () =>
    (await getBrandAssetsForEntities({ leagueIds: [ISL_SOURCE.entityId] })).leagues.get(ISL_SOURCE.entityId))
}
