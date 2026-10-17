import { playerExperienceText } from "../../lib/i18n/playerExperience"
import { localeTags, type Locale } from "../../lib/i18n/config"
import type { PlayerRealLifeProfile } from "../../types/playerRealLife"

export default function PlayerRealMarketValue({ locale, value }: {
  locale: Locale
  value: PlayerRealLifeProfile["realMarketValue"]
}) {
  const currency = value?.marketCurrency
  const amount = value?.marketValueReadState === "READY" && typeof currency === "string" &&
    Intl.supportedValuesOf("currency").includes(currency) ? value.marketValue : null
  const source = amount !== null ? value?.economicMarketValue : null
  // Live Football valuations are reference estimates, not observed sale prices.
  // Do not infer the nature of other providers from HIGH identity confidence.
  const providerEstimate = source?.provider === "LIVE_FOOTBALL"
  return <section className="profileSection" data-domain="real" aria-labelledby="real-market-title">
    <span className="sectionEyebrow">{playerExperienceText(locale, "realContext")}</span>
    <h2 id="real-market-title">{playerExperienceText(locale, providerEstimate ? "marketValueProviderEstimate" : "marketValue")}</h2>
    <strong className="playerMarketValue">{amount !== null ? new Intl.NumberFormat(localeTags[locale], {
      style: "currency", currency: currency!, currencyDisplay: "code", maximumFractionDigits: 2,
    }).format(amount) : "—"}</strong>
    {source && <p>{playerExperienceText(locale, providerEstimate ? "marketValueEstimateNote" : "marketValueNatureUnknown")}</p>}
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
