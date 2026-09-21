import type { Locale } from "../../lib/i18n"
import type { AssetReference } from "../../lib/assetPipeline"
import ClubBadge from "./ClubBadge"

export default function ClubLogo({ locale = "pt", name, src, asset, size = "medium", className = "" }: {
  locale?: Locale
  name: string
  src?: string | null
  asset?: AssetReference | null
  size?: "small" | "medium" | "large" | "hero"
  className?: string
}) {
  return <ClubBadge locale={locale} name={name} src={src} asset={asset} size={size} className={className} />
}
