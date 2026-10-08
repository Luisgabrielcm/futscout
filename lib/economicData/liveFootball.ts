import { economicFingerprint, normalizeAmount, type EconomicStateInput } from "./value"

/** Pure adapter. Identity validation and provider authorization belong to the caller/writer. */
export function adaptLiveFootballMarketValue(input: {
  playerId: string; providerPlayerId: string; field: "MARKET_VALUE"
  marketValue?: unknown; currency?: unknown; providerEffectiveAt?: string | null
  confidence: EconomicStateInput["confidence"]; matchState: EconomicStateInput["matchState"]
}) {
  if (input.field !== "MARKET_VALUE") throw new Error("LIVE_FOOTBALL_FIELD_UNSUPPORTED")
  const presence = input.marketValue === undefined ? "ABSENT" : input.marketValue === null ? "NULL" : "VALUE"
  let amount: string | null = null
  let currency: string | null = typeof input.currency === "string" ? input.currency.toUpperCase() : null
  if (presence === "VALUE") {
    let value = input.marketValue
    if (typeof value === "string" && value.endsWith("€")) {
      if (currency && currency !== "EUR") throw new Error("LIVE_FOOTBALL_CURRENCY_CONFLICT")
      currency = "EUR"
      const text = value.slice(0, -1).trim()
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(text) && !/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("LIVE_FOOTBALL_VALUE_INVALID")
      value = /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replaceAll(".", "") : text
    }
    amount = normalizeAmount(value)
  }
  const state: EconomicStateInput = {
    playerId: input.playerId, providerPlayerId: input.providerPlayerId, provider: "LIVE_FOOTBALL",
    field: "MARKET_VALUE", context: "REAL_WORLD", snapshotVersion: "economic-state-v1",
    presence, amount, currency, period: null, contractUntil: null, datePrecision: null,
    providerEffectiveAt: input.providerEffectiveAt ?? null, confidence: input.confidence, matchState: input.matchState,
    status: presence === "VALUE" ? "VALID" : "MISSING", metadata: { source: "LIVE_FOOTBALL/player", sourceVersion: "adapter-v1" },
  }
  return { state, contentHash: economicFingerprint(state) }
}
