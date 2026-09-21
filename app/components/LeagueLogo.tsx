import type { Locale } from "../../lib/i18n"
import { resolveAssetSource, type AssetReference } from "../../lib/assetPipeline"
import PlayerImage from "./PlayerImage"
import BrandAssetFallback from "./BrandAssetFallback"

export default function LeagueLogo({ locale, name, logoUrl, asset, size = "medium" }: { locale: Locale; name: string; logoUrl?: string | null; asset?: AssetReference | null; size?: "small" | "medium" | "large" }) {
  const src = resolveAssetSource(asset ?? logoUrl, "league")
  const pixels = size === "small" ? 24 : size === "large" ? 72 : 48
  return <PlayerImage locale={locale} src={src ?? undefined} alt={name} kind="league" width={pixels} height={pixels}
    className={`leagueLogo leagueLogo-${size}`}
    fallbackClassName={`leagueLogo leagueLogo-${size} brandAssetFallback brandAssetFallback-league`}
    fallback={<BrandAssetFallback kind="league" />} />
}
