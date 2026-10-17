import assert from 'node:assert/strict'
import { validInstant } from '../../lib/economicData/value'

export const balanceDocumentation = 'https://www.live-football-api.com/docs'
export function paidOfficialBalanceProbe(key: string, fetcher: typeof fetch = fetch) {
  assert(key, 'CREDENTIAL_MISSING')
  return async () => {
    const url = new URL('https://live-football-api.com/api/v1/leagues')
    url.searchParams.set('api_key', key)
    try {
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw Error(`HTTP_${response.status}`)
      const body = await response.json()
      return { success: body.success === true, credits_remaining: body.credits_remaining as number }
    } catch { throw Error('BALANCE_REQUEST_FAILED_NO_RETRY') }
  }
}
// No independent free balance endpoint is documented. No guessed /account or /balance request.
export async function officialBalance(options: {
  authorizedPaidProbe: boolean
  probe?: () => Promise<{ success: boolean; credits_remaining: number }>
  record: (receipt: { source: string; observedAt: string; credits: number; requestCost: number }) => Promise<void>
}) {
  assert(options.authorizedPaidProbe && options.probe, 'BALANCE_PROBE_AUTHORIZATION_REQUIRED_COST_1_CREDIT')
  const response = await options.probe() // zero retries; endpoint chosen/documented by authorized caller
  const observedAt = new Date().toISOString()
  assert(response.success === true && Number.isSafeInteger(response.credits_remaining) && response.credits_remaining >= 0 && validInstant(observedAt), 'INVALID_BALANCE_RESPONSE')
  await options.record({ source: 'LIVE_FOOTBALL/credits_remaining', observedAt, credits: response.credits_remaining, requestCost: 1 })
  return { credits: response.credits_remaining, observedAt, official: true }
}
