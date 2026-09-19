import type { Locale } from "../../lib/i18n"
import { profileText } from "../../lib/i18n/playerProfile"
import type { PlayerGoalkeeperAttributes as GoalkeeperAttributes } from "../../types/goalkeeperAttributes"

type PlayerGoalkeeperAttributesProps = {
  locale?: Locale
  attributes?: GoalkeeperAttributes | null
}

export default function PlayerGoalkeeperAttributes({
  locale = "pt",
  attributes = null,
}: PlayerGoalkeeperAttributesProps) {
  return <section className="playerAttributes goalkeeperDataNotice">
    <div className="attributesHeader">
      <span>{profileText(locale, "goalkeeperEyebrow")}</span>
      <h2>{profileText(locale, "goalkeeper")}</h2>
      {!attributes && <p>{profileText(locale, "missingGoalkeeper")}</p>}
    </div>
    {attributes && <dl>
      <div><dt>{profileText(locale, "diving")}</dt><dd>{attributes.diving}</dd></div>
      <div><dt>{profileText(locale, "handling")}</dt><dd>{attributes.handling}</dd></div>
      <div><dt>{profileText(locale, "kicking")}</dt><dd>{attributes.kicking}</dd></div>
      <div><dt>{profileText(locale, "gkPositioning")}</dt><dd>{attributes.positioning}</dd></div>
      <div><dt>{profileText(locale, "reflexes")}</dt><dd>{attributes.reflexes}</dd></div>
    </dl>}
  </section>
}
