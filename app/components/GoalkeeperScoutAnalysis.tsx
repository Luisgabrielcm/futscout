import type { Locale } from "../../lib/i18n"
import { profileText } from "../../lib/i18n/playerProfile"
import type {
  GoalkeeperAttributeField,
  PlayerGoalkeeperAttributes,
} from "../../types/goalkeeperAttributes"
import { generateGoalkeeperScoutAnalysis } from "../../utils/generateGoalkeeperScoutAnalysis"

const labelKey: Record<GoalkeeperAttributeField,
  "diving" | "handling" | "kicking" | "gkPositioning" | "reflexes"> = {
  diving: "diving",
  handling: "handling",
  kicking: "kicking",
  positioning: "gkPositioning",
  reflexes: "reflexes",
}

type AnalysisItem = Readonly<{ field: GoalkeeperAttributeField; value: number }>

export default function GoalkeeperScoutAnalysis({ locale = "pt", attributes }: {
  locale?: Locale
  attributes: PlayerGoalkeeperAttributes | null
}) {
  const analysis = generateGoalkeeperScoutAnalysis(attributes)
  if (!analysis) return <section className="playersEmpty">
    <h2>{profileText(locale, "goalkeeper")}</h2>
    <p>{profileText(locale, "goalkeeperAnalysisMissing")}</p>
  </section>

  const list = (items: readonly AnalysisItem[]) => items.map(({ field, value }) =>
    <li key={field}><span>{profileText(locale, labelKey[field])}</span><strong>{value}</strong></li>)

  return <section className="scoutAnalysis">
    <div className="scoutAnalysisHeader"><h2>{profileText(locale, "goalkeeper")}</h2></div>
    <div className="scoutAnalysisGrid">
      <div className="scoutAnalysisCard"><h3>{profileText(locale, "goalkeeperStrengths")}</h3><ul>{list(analysis.strongest)}</ul></div>
      <div className="scoutAnalysisCard"><h3>{profileText(locale, "goalkeeperAttention")}</h3><ul>{list(analysis.lowest)}</ul></div>
    </div>
  </section>
}
