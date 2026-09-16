import type { Locale } from "../../lib/i18n"
import { getVisualAssetSrc } from "../../lib/visualAssets"
import PlayerImage from "./PlayerImage"

// Optional supplied artwork only; callers keep the league name visible.
export default function LeagueLogo({ locale, name, logoUrl }: { locale: Locale; name: string; logoUrl?: string | null }) {
  const src = getVisualAssetSrc(logoUrl, "league")
  if (!src) return null
  return <PlayerImage locale={locale} src={src} alt={name} kind="league" width={48} height={48}
    className="leagueLogo" fallbackClassName="leagueLogoUnavailable" fallbackText="" />
}
