import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export type RejectedResponse = { outcome: 'REJECTED_RESPONSE'; observedAt: string; data: null;
  evidence: { schemaVersion: 2; endpoint: 'player_search' | 'player'; complete: true; body: string; contentHash: string } }
export function inspectEnvelope(body: unknown, endpoint: 'player_search' | 'player', secret: string): RejectedResponse | null {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'INVALID_ENVELOPE')
  const b = body as Record<string, unknown>
  // Missing required fields, invalid balances and unknown origins cannot be settled as rejected.
  assert(['success', 'data', 'credits_remaining'].every(k => Object.hasOwn(b, k)), 'INVALID_ENVELOPE')
  assert(Number.isSafeInteger(b.credits_remaining) && Number(b.credits_remaining) >= 0, 'BALANCE')
  assert(b.data !== null && typeof b.data === 'object', 'INVALID_ENVELOPE')
  const valid = b.success === true && !Array.isArray(b.data) &&
    (endpoint !== 'player_search' || Array.isArray((b.data as Record<string, unknown>).players))
  if (valid) return null
  const allowed = new Set(['success', 'data', 'credits_remaining', 'players', 'id', 'player_id', 'name', 'first_name', 'last_name',
    'country', 'birthdate', 'nationality', 'market_value', 'currency', 'market_value_currency', 'market_value_updated_at', 'market_value_date'])
  function safe(value: unknown, depth = 0): boolean {
    if (depth > 8) return false
    if (value === null || typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string') return value.length <= 512 && !value.includes(secret) && !/:\/\/|token|password|api_key/i.test(value)
    if (Array.isArray(value)) return value.length <= 100 && value.every(v => safe(v, depth + 1))
    return !!value && typeof value === 'object' && Object.entries(value).every(([k, v]) => allowed.has(k) && safe(v, depth + 1))
  }
  assert(safe(body), 'UNSAFE_PROVIDER_FIELD')
  const serialized = JSON.stringify(body)
  assert(serialized.length <= 65536, 'UNSAFE_PROVIDER_FIELD')
  return { outcome: 'REJECTED_RESPONSE', observedAt: new Date().toISOString(), data: null,
    evidence: { schemaVersion: 2, endpoint, complete: true, body: serialized,
      contentHash: createHash('sha256').update(serialized).digest('hex') } }
}
export function validateRejected(r: RejectedResponse) {
  assert.equal(r.outcome, 'REJECTED_RESPONSE'); assert.equal(r.data, null)
  assert(r.evidence?.endpoint === 'player' || r.evidence?.endpoint === 'player_search', 'REJECTED_ENDPOINT')
  assert(typeof r.evidence.body === 'string' && r.evidence.body.length <= 65536, 'REJECTED_BODY')
  assert(r.evidence?.complete === true && r.evidence.schemaVersion === 2, 'REJECTED_EVIDENCE')
  assert.equal(createHash('sha256').update(r.evidence.body).digest('hex'), r.evidence.contentHash, 'REJECTED_HASH')
  const replay = inspectEnvelope(JSON.parse(r.evidence.body), r.evidence.endpoint, '\u0000')
  assert(replay, 'REJECTED_VALID_RESPONSE')
}
