import type { Locale } from "../../lib/i18n"
import { resolveAssetSource, type AssetReference } from "../../lib/assetPipeline"
import PlayerImage from "./PlayerImage"

// Optional supplied artwork only; callers keep the league name visible.
export default function LeagueLogo({ locale, name, logoUrl, asset }: { locale: Locale; name: string; logoUrl?: string | null; asset?: AssetReference | null }) {
  const src = resolveAssetSource(asset ?? logoUrl, "league")
  if (!src) return null
  return <PlayerImage locale={locale} src={src} alt={name} kind="league" width={48} height={48}
    className="leagueLogo" fallbackClassName="leagueLogoUnavailable" fallbackText="" />
}
