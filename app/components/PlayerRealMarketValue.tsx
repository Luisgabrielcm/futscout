import { playerExperienceText } from "../../lib/i18n/playerExperience"
import { localeTags, type Locale } from "../../lib/i18n/config"
import type { PlayerRealLifeProfile } from "../../types/playerRealLife"

export default function PlayerRealMarketValue({ locale, value }: {
  locale: Locale
  value: PlayerRealLifeProfile["realMarketValue"]
}) {
  const amount = value?.marketValueReadState === "READY" && value.marketCurrency === "EUR" ? value.marketValue : null
  const source = amount !== null ? value?.economicMarketValue : null
  return <section className="profileSection" data-domain="real" aria-labelledby="real-market-title">
    <span className="sectionEyebrow">{playerExperienceText(locale, "realContext")}</span>
    <h2 id="real-market-title">{playerExperienceText(locale, "marketValue")}</h2>
    <strong className="playerMarketValue">{amount !== null ? new Intl.NumberFormat(localeTags[locale], {
      style: "currency", currency: "EUR", maximumFractionDigits: 2,
    }).format(amount) : "—"}</strong>
    {amount === null && <p>{playerExperienceText(locale, "marketValueMissing")}</p>}
    {source && <dl className="careerFields">
      <div><dt>{playerExperienceText(locale, "marketValueSource")}</dt><dd>{source.provider === "LIVE_FOOTBALL" ? "Live Football" : source.provider.replaceAll("_", " ")}</dd></div>
      <div><dt>{playerExperienceText(locale, "marketValueObserved")}</dt><dd>
        <time dateTime={source.observedAt}>{new Intl.DateTimeFormat(localeTags[locale], {
          dateStyle: "medium", timeZone: "UTC",
        }).format(new Date(source.observedAt))}</time>
      </dd></div>
    </dl>}
  </section>
}
