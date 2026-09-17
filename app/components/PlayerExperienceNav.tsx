import Link from "next/link"
import { localizedHref, type Locale } from "../../lib/i18n"
import { playerExperienceText } from "../../lib/i18n/playerExperience"

export default function PlayerExperienceNav({ locale, slug, active }: {
  locale: Locale
  slug: string
  active: "ea" | "real"
}) {
  const base = `/jogadores/${encodeURIComponent(slug)}`
  return <nav className="playerExperienceNav" aria-label={playerExperienceText(locale, "navigation")}>
    <Link href={localizedHref(locale, base)} aria-current={active === "ea" ? "page" : undefined}>EA SPORTS FC</Link>
    <Link href={localizedHref(locale, `${base}/vida-real`)} aria-current={active === "real" ? "page" : undefined}>
      {playerExperienceText(locale, "realLife")}
    </Link>
  </nav>
}
