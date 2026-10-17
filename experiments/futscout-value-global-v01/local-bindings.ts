import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ManualBinding = Readonly<{
  selectionHash: string; parentSelectionHash: string; position: number; playerId: string
  requestId: string; originalRequestHash: string; approvalReference: string
  kind: 'SEARCH' | 'PROFILE_503' | 'BALANCE'; extraManualSlot: boolean
}>
export type ValueBindings = Readonly<{
  schemaVersion: 1; parentSelectionHash: string; offlineSelectionHash: string
  quarantines: readonly ManualBinding[]
}>
const keys = ['selectionHash', 'parentSelectionHash', 'position', 'playerId', 'requestId',
  'originalRequestHash', 'approvalReference', 'kind', 'extraManualSlot']
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
const exactKeys = (value: object, allowed: string[]) => Object.keys(value).length === allowed.length &&
  Object.keys(value).every(key => allowed.includes(key))

/** Validate a detached snapshot. No environment, journal or inferred approval is a fallback. */
export function validateValueBindings(input: unknown): ValueBindings {
  const value = structuredClone(input) as ValueBindings
  assert(value && typeof value === 'object' &&
    exactKeys(value, ['schemaVersion', 'parentSelectionHash', 'offlineSelectionHash', 'quarantines']) &&
    value.schemaVersion === 1 && hash(value.parentSelectionHash) && hash(value.offlineSelectionHash) &&
    value.parentSelectionHash !== value.offlineSelectionHash && Array.isArray(value.quarantines) &&
    value.quarantines.length <= 12, 'VALUE_BINDINGS_INVALID')
  for (const entry of value.quarantines) {
    assert(entry && typeof entry === 'object' && exactKeys(entry, keys) &&
      [value.parentSelectionHash, value.offlineSelectionHash].includes(entry.selectionHash) &&
      entry.parentSelectionHash === value.parentSelectionHash &&
      Number.isSafeInteger(entry.position) && entry.position > 0 && identifier(entry.playerId) &&
      hash(entry.originalRequestHash) && identifier(entry.approvalReference) &&
      ['SEARCH', 'PROFILE_503', 'BALANCE'].includes(entry.kind) && typeof entry.extraManualSlot === 'boolean' &&
      (!entry.extraManualSlot || entry.kind === 'BALANCE'), 'VALUE_BINDING_INVALID')
    assert(entry.requestId ===
      `lfglobal-${entry.parentSelectionHash.slice(0, 16)}-${entry.playerId}-${entry.kind === 'PROFILE_503' ? 'profile' : 'search'}`,
      'VALUE_BINDING_REQUEST')
  }
  assert(new Set(value.quarantines.map(entry => entry.requestId)).size === value.quarantines.length &&
    new Set(value.quarantines.map(entry => `${entry.selectionHash}:${entry.position}`)).size === value.quarantines.length &&
    new Set(value.quarantines.map(entry => `${entry.selectionHash}:${entry.playerId}`)).size === value.quarantines.length &&
    value.quarantines.filter(entry => entry.extraManualSlot).length <= 3, 'VALUE_BINDINGS_DUPLICATE_OR_LIMIT')
  value.quarantines.forEach(Object.freeze)
  Object.freeze(value.quarantines)
  return Object.freeze(value)
}

/** The default is already covered by /audit/output/ in .gitignore. Never loaded on import. */
export function loadValueBindings(file = resolve('audit/output/value-cloud-private/bindings.json')): ValueBindings {
  let input: unknown
  try { input = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('VALUE_BINDINGS_REQUIRED_OR_UNREADABLE') }
  return validateValueBindings(input)
}

export function approvedManualAttempt(q: {
  approved: true; selectionHash: string; position: number; playerId: string
  requestId: string; originalRequestHash: string; approvalReference: string
}, selectionHash: string, parentHash: string, config?: ValueBindings): ManualBinding | undefined {
  assert(config, 'VALUE_BINDINGS_REQUIRED')
  return config.quarantines.find(entry => q.approved === true && q.selectionHash === selectionHash &&
    entry.selectionHash === selectionHash && entry.parentSelectionHash === parentHash &&
    entry.position === q.position && entry.playerId === q.playerId && entry.requestId === q.requestId &&
    entry.originalRequestHash === q.originalRequestHash && entry.approvalReference === q.approvalReference)
}
