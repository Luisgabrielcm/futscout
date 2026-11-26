import { createHash } from 'node:crypto'
export type PrivateEstimateEntry = { playerId: string; eaId: string; contentHash: string; method: 'B_PARTIAL_CONTEXT' }
export function parsePrivateEstimateScope(raw?: string, digest?: string): PrivateEstimateEntry[] {
  if (!raw && !digest) return []
  if (!raw || Buffer.byteLength(raw, 'utf8') > 8192 || !digest || !/^[a-f0-9]{64}$/.test(digest) || createHash('sha256').update(raw).digest('hex') !== digest) throw Error('PRIVATE_VALUE_SCOPE_INVALID')
  const v = JSON.parse(raw) as { version: number; entries: PrivateEstimateEntry[] }
  if (!v || Object.keys(v).sort().join(',') !== 'entries,version' || v.version !== 1 || !Array.isArray(v.entries) || v.entries.length < 1 || v.entries.length > 21) throw Error('PRIVATE_VALUE_SCOPE_INVALID')
  const seen = new Set<string>(), players = new Set<string>(), ids = new Set<string>()
  for (const e of v.entries) {
    if (!e || typeof e.playerId !== 'string' || typeof e.eaId !== 'string' || typeof e.contentHash !== 'string' || Object.keys(e).sort().join(',') !== 'contentHash,eaId,method,playerId' || !/^[a-zA-Z0-9_-]{1,128}$/.test(e.playerId) || !/^[1-9][0-9]{0,8}$/.test(e.eaId) || !/^[a-f0-9]{64}$/.test(e.contentHash) || e.method !== 'B_PARTIAL_CONTEXT' || seen.has(e.contentHash) || players.has(e.playerId) || ids.has(e.eaId)) throw Error('PRIVATE_VALUE_SCOPE_INVALID')
    seen.add(e.contentHash); players.add(e.playerId); ids.add(e.eaId)
  }
  return v.entries
}
// Deployment-local approval metadata only; values, models and source evidence stay private.
// This owner presentation decision does not establish third-party rights.
export const privateEstimateEntries = parsePrivateEstimateScope(process.env.FUTSCOUT_PRIVATE_VALUE_SCOPE, process.env.FUTSCOUT_PRIVATE_VALUE_SCOPE_SHA256)
export function privateEstimateMethod(hash: string | undefined, playerId?: string, eaId?: string | null): string | null {
  return privateEstimateEntries.find(e => e.contentHash === hash && e.playerId === playerId && e.eaId === eaId)?.method ?? null
}
