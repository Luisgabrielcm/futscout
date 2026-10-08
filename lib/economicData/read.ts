import type { Prisma } from "../../app/generated/prisma/client"

// Bounded relation projection: one batch for the page, never one query per Player.
export const economicMarketValueReadSelect = {
  where: { field: "MARKET_VALUE" },
  select: { observation: { select: { observedAt: true, state: { select: {
    field: true, context: true, provider: true, presence: true, amount: true,
    currency: true, confidence: true, matchState: true, status: true,
  } } } } },
} satisfies Prisma.PlayerEconomicCurrentFindManyArgs

type Current = Prisma.PlayerEconomicCurrentGetPayload<typeof economicMarketValueReadSelect>
export function readEconomicMarketValue(player: { economicCurrents?: Current[] }) {
  const current = player.economicCurrents?.[0]
  const state = current?.observation.state
  const metadata = state ? { provider: state.provider, observedAt: current.observation.observedAt.toISOString() } : null
  const base = { marketValue: null as number | null, marketCurrency: null as string | null, economicMarketValue: metadata }
  if (!state) return { ...base, marketValueReadState: "MISSING_CURRENT" as const }
  const value = state.amount === null ? null : Number(state.amount.toString())
  // Existing presentation is EUR-only; never mislabel another currency as euros.
  if (player.economicCurrents?.length !== 1 || state.field !== "MARKET_VALUE" || state.context !== "REAL_WORLD" ||
      state.presence !== "VALUE" || state.status !== "VALID" || state.confidence !== "HIGH" || state.matchState !== "MATCHED" ||
      state.currency !== "EUR" || value === null || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
    return { ...base, marketValueReadState: "INVALID_CURRENT" as const }
  return { ...base, marketValue: value, marketCurrency: state.currency, marketValueReadState: "READY" as const }
}
