import type { Locale } from "../../lib/i18n"
import { resolveAssetSource, type AssetReference } from "../../lib/assetPipeline"
import PlayerImage from "./PlayerImage"

const sizes = { small: 24, medium: 32, large: 72, hero: 96 } as const

export default function ClubLogo({ locale = "pt", name, src, asset, size = "medium", className = "" }: {
  locale?: Locale
  name: string
  src?: string | null
  asset?: AssetReference | null
  size?: keyof typeof sizes
  className?: string
}) {
  const imageSrc = resolveAssetSource(asset ?? src, "club")
  return <span className={`clubBadge clubBadge-${size}`}>
    <PlayerImage locale={locale} src={imageSrc ?? undefined} alt={name} kind="club"
      width={sizes[size]} height={sizes[size]} loading="lazy" className={className}
      fallbackClassName={`clubBadgeFallback ${className}`} fallbackText="F" />
  </span>
}
