import type { Locale } from "../../lib/i18n"
import { profileText } from "../../lib/i18n/playerProfile"

type PlayerGoalkeeperAttributesProps = {
  locale?: Locale
}

export default function PlayerGoalkeeperAttributes({
  locale = "pt",
}: PlayerGoalkeeperAttributesProps) {
  return <section className="playerAttributes goalkeeperDataNotice">
    <div className="attributesHeader">
      <span>{profileText(locale, "goalkeeperEyebrow")}</span>
      <h2>{profileText(locale, "goalkeeper")}</h2>
      <p>{profileText(locale, "missingGoalkeeper")}</p>
    </div>
  </section>
}
