import type { Locale } from "../../lib/i18n"
import { getPlayStyleVisual } from "../../lib/playStyleAssets"
import type { PlayerPlayStyle } from "../../types/player"
import PlayerImage from "./PlayerImage"

export default function PlayStyleIcon({ locale = "pt", playStyle, size = 32 }: {
  locale?: Locale
  playStyle: PlayerPlayStyle
  size?: number
}) {
  const visual = getPlayStyleVisual(playStyle, locale)
  if (!visual.iconSrc) return null
  return <PlayerImage locale={locale} src={visual.iconSrc} alt={visual.displayName} kind="asset"
    width={size} height={size} loading="lazy" fallbackText="" />
}
