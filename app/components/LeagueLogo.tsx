import type { Locale } from "../../lib/i18n"
import { resolveAssetSource, type AssetReference } from "../../lib/assetPipeline"
import PlayerImage from "./PlayerImage"
import BrandAssetFallback from "./BrandAssetFallback"
import { ALEAGUE_SOURCE, CYPRUS_SOURCE } from "../../lib/brackBrandSource"

export default function LeagueLogo({ locale, name, logoUrl, asset, size = "medium" }: { locale: Locale; name: string; logoUrl?: string | null; asset?: AssetReference | null; size?: "small" | "medium" | "large" }) {
  const src = resolveAssetSource(asset ?? logoUrl, "league")
  const pixels = size === "small" ? 24 : size === "large" ? 72 : 48
  const wide = src === ALEAGUE_SOURCE.deliveryPath ? "aleague" : src === CYPRUS_SOURCE.deliveryPath ? "cyprus" : null
  const width = wide === "aleague" ? 224 : wide === "cyprus" ? 160 : pixels
  const height = wide === "aleague" ? 36 : wide === "cyprus" ? 68 : pixels
  const needsLightBackground = asset?.identity.provider === "api-football" &&
    ["61", "88"].includes(String(asset.identity.providerEntityId))
  return <PlayerImage locale={locale} src={src ?? undefined} alt={name} kind="league" width={width} height={height}
    proxyRemote={Boolean(asset)} className={`leagueLogo leagueLogo-${size}${wide ? ` leagueLogo-wide leagueLogo-${wide}` : ""}${needsLightBackground ? " leagueLogo-lightBackground" : ""}`}
    fallbackClassName={`leagueLogo leagueLogo-${size} brandAssetFallback brandAssetFallback-league`}
    fallback={<BrandAssetFallback kind="league" />} />
}
