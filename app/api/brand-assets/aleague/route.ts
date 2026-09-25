import { ALEAGUE_SOURCE } from "../../../../lib/brackBrandSource"
import { serveAleagueAsset } from "../../../../services/brackBrandDelivery"
import { getBrandAssetsForEntities } from "../../../../services/brandAssetReadService"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return serveAleagueAsset(request, async () =>
    (await getBrandAssetsForEntities({ leagueIds: [ALEAGUE_SOURCE.entityId] })).leagues.get(ALEAGUE_SOURCE.entityId))
}
