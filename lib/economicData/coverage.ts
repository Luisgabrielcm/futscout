import { readEconomicMarketValue } from "./read"

type PlayerWithCurrent = Parameters<typeof readEconomicMarketValue>[0]

export type MarketValueCoverage = {
  players: number
  positiveEligible: number
  zeroEligible: number
  explicitNull: number
  unavailable: number
  rejectedCurrent: number
}

export function emptyMarketValueCoverage(): MarketValueCoverage {
  return { players: 0, positiveEligible: 0, zeroEligible: 0, explicitNull: 0, unavailable: 0, rejectedCurrent: 0 }
}

export function countMarketValuePlayer(total: MarketValueCoverage, player: PlayerWithCurrent): void {
  total.players++
  const result = readEconomicMarketValue(player)
  if (result.marketValueReadState === "MISSING_CURRENT") {
    total.unavailable++
    return
  }
  if (result.marketValueReadState === "READY") {
    if (result.marketValue! > 0) total.positiveEligible++
    else total.zeroEligible++
    return
  }
  const state = player.economicCurrents?.[0]?.observation.state
  if (player.economicCurrents?.length === 1 && state?.field === "MARKET_VALUE" && state.context === "REAL_WORLD" &&
      state.presence === "NULL" && state.amount === null && state.status === "MISSING" &&
      state.confidence === "HIGH" && state.matchState === "MATCHED") {
    total.explicitNull++
    return
  }
  total.rejectedCurrent++
}
