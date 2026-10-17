import { loadValueBindings } from './local-bindings'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type { PrismaClient } from '../../app/generated/prisma/client'
import { createPlayerEconomicWriter, type EconomicWrite } from '../../services/playerEconomicPersistence'
import { adaptLiveFootballMarketValue } from '../../lib/economicData/liveFootball'
import { economicFingerprint } from '../../lib/economicData/value'
import { recoveryNationality } from './identity-alias'
import { acquireGlobalLock } from './global-lock'
import { runGlobal, sha, type Dependencies, type Player } from './runner'
import { safeTransportError } from './diagnostics'
import { inspectEnvelope, type RejectedResponse } from './response-v02'
import { newTransactionTrace, traceClient, type TransactionTrace } from './transaction-trace'
import { captureCleanup } from './diagnostics'

const matcher = createRequire(import.meta.url)('./matching.cjs')

type Data = Record<string, unknown>
type Transport = (endpoint: 'player_search' | 'player', params: Record<string, string>) => Promise<{ data: Data; observedAt: string; outcome?: 'SUCCESS' } | RejectedResponse>

/** Same endpoint/auth/envelope protocol as the validated batch runner; inert until invoked. */
export function liveFootballTransport(key: string, fetcher: typeof fetch = fetch): Transport {
  assert(key, 'CREDENTIAL_MISSING')
  return async (endpoint, params) => {
    const url = new URL(`https://live-football-api.com/api/v1/${endpoint}`)
    url.searchParams.set('api_key', key); url.searchParams.set('lang', 'en')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    try {
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw Object.assign(new Error('HTTP_FAILURE'), { code: `HTTP_${response.status}` })
      const body = await response.json()
      const rejected = inspectEnvelope(body, endpoint, key)
      if (rejected) return rejected
      assert(body.success !== false && body.data && Number.isSafeInteger(body.credits_remaining), 'INVALID_ENVELOPE')
      assert(body.credits_remaining >= 0, 'BALANCE')
      // Persist only allowlisted fields used by the existing matcher/adapter.
      const sanitize = (d: Data) => Object.fromEntries(['id', 'player_id', 'name', 'first_name', 'last_name', 'country', 'birthdate', 'nationality',
        'market_value', 'currency', 'market_value_currency', 'market_value_updated_at', 'market_value_date'].filter(k => Object.hasOwn(d, k)).map(k => {
          const value = d[k]
          assert(value === null || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 512 && !value.includes(key) && !/:\/\//.test(value), 'UNSAFE_PROVIDER_FIELD')
          return [k, value]
        }))
      return { outcome: 'SUCCESS', observedAt: new Date().toISOString(), data: endpoint === 'player_search'
        ? { players: (body.data.players ?? []).map(sanitize), creditsRemaining: body.credits_remaining }
        : { ...sanitize(body.data), creditsRemaining: body.credits_remaining } }
    } catch (error) {
      throw safeTransportError(error, endpoint === 'player_search' ? 'LIVE_SEARCH' : 'LIVE_PROFILE')
    }
  }
}

export interface ReadOnlyGate {
  // Implementations must use READ ONLY + ROLLBACK + close, validate counts/references,
  // current ledger, frozen player inputs and completed/write suffixes in batch.
  preflight: Dependencies['preflight']
  existing: Dependencies['existing']
  readBack: Dependencies['readBack']
  checkpoint: Dependencies['checkpoint']
  // Must provide fresh official no-paid-request balance evidence; historical balance is insufficient.
  balance(): Promise<{ credits: number; observedAt: string; official: boolean }>
  concurrent(): Promise<boolean>
}
export function bindings(transport: Transport, writer: Dependencies['write'], gate: ReadOnlyGate, requestLimit = 17408,
  stagingGeneration?: string): Dependencies {
  return {
    ...gate,
    ...(stagingGeneration ? { stagingGeneration } : {}),
    preflight: async (players, progress) => {
      assert(!await gate.concurrent(), 'CONCURRENT_EXECUTION')
      await gate.preflight(players, progress)
      const balance = await gate.balance()
      assert(balance.official && Number.isSafeInteger(balance.credits) && balance.credits >= Math.max(0, requestLimit - progress.requests), 'BALANCE_UNCONFIRMED')
      assert(Number.isFinite(Date.parse(balance.observedAt)) && Math.abs(Date.now() - Date.parse(balance.observedAt)) < 60000, 'BALANCE_STALE')
    },
    validateSearch: p => { assert(typeof p.name === 'string' && p.name.trim().length > 0, 'NAME') },
    search: p => { assert(typeof p.name === 'string' && p.name.trim().length > 0, 'NAME'); return transport('player_search', { q: p.name }) },
    profile: id => transport('player', { player_id: id }),
    choose: (p, data) => {
      const candidates = (data as Data).players
      assert(Array.isArray(candidates), 'SEARCH_ENVELOPE')
      const candidate = matcher.choose(p, candidates)
      if (!candidate) return null
      assert(typeof candidate.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(candidate.id), 'PROVIDER_ID')
      return candidate.id
    },
    adapt: (p, id, response) => {
      const d = response.data as Data
      assert(!d.player_id || d.player_id === id, 'PROVIDER_ID_CONFLICT')
      const match = matcher.classify({ ...p, nationality: recoveryNationality(p.nationality ?? '') },
        { ...d, nationality: recoveryNationality(String(d.nationality ?? '')) }, null)
      if (match !== 'HIGH') return null
      const state = adaptLiveFootballMarketValue({ playerId: p.playerId, providerPlayerId: id, field: 'MARKET_VALUE',
        marketValue: d.market_value, currency: d.currency ?? d.market_value_currency,
        providerEffectiveAt: (d.market_value_updated_at ?? d.market_value_date ?? null) as string | null,
        confidence: 'HIGH', matchState: 'MATCHED' }).state
      state.metadata.evidenceRef = 'value-global-v1'
      economicFingerprint(state)
      return state
    },
    write: writer,
  }
}
export function existingWriter(client: Pick<PrismaClient, '$transaction'>, warmPhysicalPool: () => Promise<void>,
  telemetry?: { connection: () => TransactionTrace['connection']; record: (trace: TransactionTrace) => Promise<void> }) {
  return async (plan: EconomicWrite) => {
    await warmPhysicalPool()
    const observer = newTransactionTrace(plan.requestId, telemetry?.connection() ?? null)
    const writer = createPlayerEconomicWriter(traceClient(client, observer), [{ provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE', context: 'REAL_WORLD', evidenceRef: 'value-global-v1' }])
    let failed = false, primary: unknown
    try { return await writer(plan) } catch (error) { failed = true; primary = error; throw error }
    finally { try { await telemetry?.record(observer.trace) } catch (error) { if (failed) captureCleanup(primary, error); else throw error } }
  }
}
export async function integratedRun(bytes: Buffer, journalRoot: string, sharedLockRoot: string, deps: Dependencies) {
  const valueBindings = loadValueBindings()
  const approvedSelectionHash = valueBindings.parentSelectionHash
  assert.equal(sha(bytes), approvedSelectionHash, 'APPROVED_SELECTION_REQUIRED')
  const release = await acquireGlobalLock(sharedLockRoot, approvedSelectionHash)
  try { return await runGlobal(bytes, approvedSelectionHash, journalRoot, { ...deps, valueBindings }) } finally { await release() }
}
// No CLI, ambient credentials, network, pool construction or execution on import.
export type { Player }
