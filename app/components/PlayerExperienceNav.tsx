import Link from "next/link"
import { type Locale } from "../../lib/i18n"
import { playerProfileHref } from "../../lib/connectedNavigation"
import { playerExperienceText } from "../../lib/i18n/playerExperience"

export default function PlayerExperienceNav({ locale, slug, active, catalogContext }: {
  locale: Locale
  slug: string
  catalogContext?: string
  active: "ea" | "real"
}) {
  return <nav className="playerExperienceNav" aria-label={playerExperienceText(locale, "navigation")}>
    <Link href={playerProfileHref(locale, slug, catalogContext)} aria-current={active === "ea" ? "page" : undefined}>EA SPORTS FC</Link>
    <Link href={playerProfileHref(locale, slug, catalogContext, "real")} aria-current={active === "real" ? "page" : undefined}>
      {playerExperienceText(locale, "realLife")}
    </Link>
  </nav>
}
