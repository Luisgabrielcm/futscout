import type { Prisma } from "../../app/generated/prisma/client"
import { decideValuePublication, PUBLICATION_POLICY_VERSION } from "../../experiments/futscout-value-v01/publication"
import { publicationHoldFor } from "./publicationHolds"
import { SUPPLIER_NOTICE_POLICY, approvedEstimateMethod } from './estimatePublication'

// Bounded relation projection: one batch for the page, never one query per Player.
export const economicMarketValueReadSelect = {
  where: { field: "MARKET_VALUE" },
  select: { policyVersion: true, observation: { select: { observedAt: true, state: { select: {
    field: true, context: true, provider: true, presence: true, amount: true,
    currency: true, confidence: true, matchState: true, status: true, contentHash: true,
  } } } } },
} satisfies Prisma.PlayerEconomicCurrentFindManyArgs

type SelectedCurrent = Prisma.PlayerEconomicCurrentGetPayload<typeof economicMarketValueReadSelect>
type Current = { policyVersion?: string; observation: { observedAt: Date;
  state: Omit<SelectedCurrent['observation']['state'], 'contentHash'> & { contentHash?: string } } }
// Structural integrity only, not publication authorization. Historical replays use
// this predicate to preserve their frozen classification before publication holds.
export function isStructurallyValidEconomicCurrent(player: { economicCurrents?: Current[] }) {
  const state = player.economicCurrents?.[0]?.observation.state
  const value = state?.amount === null || state?.amount === undefined ? null : Number(state.amount.toString())
  return !!state && player.economicCurrents?.length === 1 && state.field === 'MARKET_VALUE' &&
    state.context === 'REAL_WORLD' && state.presence === 'VALUE' && state.status === 'VALID' &&
    state.confidence === 'HIGH' && state.matchState === 'MATCHED' && state.currency === 'EUR' &&
    value !== null && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}
export function readEconomicMarketValue(player: { id?: string; externalId?: string | null; economicCurrents?: Current[] }) {
  const current = player.economicCurrents?.[0]
  const state = current?.observation.state
  const own = state?.provider === 'FUTSCOUT_VALUE' && current?.policyVersion === SUPPLIER_NOTICE_POLICY
  const method = state?.provider === 'LIVE_FOOTBALL' ? 'LIVE_FOOTBALL_EXISTING_CURRENT' :
    own ? approvedEstimateMethod(state.contentHash) ?? 'UNAPPROVED_PROVIDER' : 'UNAPPROVED_PROVIDER'
  const metadata: { provider: string; observedAt: string; method?: string; publicationPolicyVersion?: string } | null = state ? {
    provider: state.provider, observedAt: current.observation.observedAt.toISOString(),
    method, publicationPolicyVersion: own ? SUPPLIER_NOTICE_POLICY : PUBLICATION_POLICY_VERSION } : null
  const base = { marketValue: null as number | null, marketCurrency: null as string | null, economicMarketValue: metadata }
  if (!state) return { ...base, marketValueReadState: "MISSING_CURRENT" as const }
  const value = state.amount === null ? null : Number(state.amount.toString())
  // Existing presentation is EUR-only; never mislabel another currency as euros.
  if (!isStructurallyValidEconomicCurrent(player))
    return { ...base, marketValueReadState: "INVALID_CURRENT" as const }
  const hold = publicationHoldFor(player.id, player.externalId)
  const decision = decideValuePublication({
    playerId: player.id ?? '', eaId: player.externalId ?? null, valueEur: value, currency: 'EUR',
    type: state.provider === 'LIVE_FOOTBALL' ? 'PROVIDER' : own ? 'FUTSCOUT_ESTIMATE' : 'UNAVAILABLE', method,
    context: method === 'B_PARTIAL_CONTEXT' ? 'UNKNOWN' : 'COMPLETE', estimateContentHash: state.contentHash,
    eligibility: hold?.activityHold ? 'ACTIVITY_EVIDENCE_HOLD' : own ? 'PRIVATE_EXPERIMENT_ONLY' : 'EXISTING_READER_POLICY',
    publication: { existingReaderEligible: true, modelApproved: false, action: 'NOT_EXECUTED' },
    rights: { providerTraining: 'UNKNOWN', parameterCommercialUse: 'UNKNOWN', display: 'EXISTING_POLICY_ONLY' },
    dataReview: hold,
  }, own ? SUPPLIER_NOTICE_POLICY : PUBLICATION_POLICY_VERSION)
  if (!decision.eligible) return { ...base, marketValueReadState: 'PUBLICATION_HELD' as const }
  return { ...base, marketValue: decision.marketValue, marketCurrency: decision.marketCurrency, marketValueReadState: "READY" as const }
}
