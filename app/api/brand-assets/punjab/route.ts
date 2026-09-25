import { PUNJAB_SOURCE } from "../../../../lib/punjabBrandSource"
import { servePunjabAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return servePunjabAsset(request, async () =>
    (await getBrandAssetsForEntities({ clubIds: [PUNJAB_SOURCE.entityId] })).clubs.get(PUNJAB_SOURCE.entityId))
}
