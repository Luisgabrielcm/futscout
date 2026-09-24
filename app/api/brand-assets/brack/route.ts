import { BRACK_SOURCE } from "../../../../lib/brackBrandSource"
import { serveBrackAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return serveBrackAsset(request, async () =>
    (await getBrandAssetsForEntities({ leagueIds: [BRACK_SOURCE.entityId] })).leagues.get(BRACK_SOURCE.entityId))
}
