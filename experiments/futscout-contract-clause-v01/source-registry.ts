import { hash } from './contract'

export const syncVersion = 'futscout-contract-sync-offline-v0.1'
export type Permission = 'CONFIRMED' | 'RESTRICTED' | 'UNKNOWN'
export type Source = {
  id: string; provider: string; sourceVersion: string; policyVersion: string
  permissions: { access: Permission; storage: Permission; history: Permission; publication: Permission; commercialUse: Permission }
  permissionReference: string | null
}
export function ensure(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason) }
export function identifier(x: unknown): asserts x is string {
  ensure(typeof x === 'string' && /^[a-zA-Z0-9._/-]{1,160}$/.test(x) && !/(secret|password|token|api.?key)/i.test(x), 'INVALID_IDENTIFIER')
}
export function sourceGate(source: Source) {
  identifier(source.id); identifier(source.sourceVersion); identifier(source.policyVersion)
  ensure(/^[A-Z][A-Z0-9_]{1,63}$/.test(source.provider), 'INVALID_PROVIDER')
  const fields = ['access', 'storage', 'history', 'publication', 'commercialUse'] as const
  ensure(source.permissions && Object.keys(source.permissions).length === fields.length, 'INVALID_PERMISSIONS')
  for (const field of fields) ensure(['CONFIRMED', 'RESTRICTED', 'UNKNOWN'].includes(source.permissions[field]), 'INVALID_PERMISSION')
  if (source.permissionReference !== null) identifier(source.permissionReference)
  const reasons = fields.filter(f => source.permissions[f] !== 'CONFIRMED').map(f => `PERMISSION_${f}`)
  if (source.permissionReference === null) reasons.push('PERMISSION_EVIDENCE_MISSING')
  return { enabled: reasons.length === 0, reasons }
}
export function createRegistry(sources: Source[]) {
  const entries = sources.map(source => ({ source: structuredClone(source), ...sourceGate(source) }))
    .sort((a, b) => a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0)
  ensure(new Set(entries.map(e => e.source.id)).size === entries.length, 'DUPLICATE_SOURCE')
  return { entries, registryHash: hash({ syncVersion, entries }) }
}
// Keep the legacy registry envelope/hash unchanged; operation policy is evaluated separately.
export const permissionPolicyVersion = 'contract-permissions-v0.2'
export function operationGate(source: Source, operation: 'INTERNAL' | 'PUBLISH') {
  sourceGate(source) // Validate every permission without upgrading or discarding classifications.
  ensure(operation === 'INTERNAL' || operation === 'PUBLISH', 'INVALID_OPERATION')
  const fields = operation === 'INTERNAL'
    ? ['access', 'storage', 'history'] as const
    : ['access', 'storage', 'history', 'publication', 'commercialUse'] as const
  const reasons = fields.filter(f => source.permissions[f] !== 'CONFIRMED').map(f => `PERMISSION_${f}`)
  if (source.permissionReference === null) reasons.push('PERMISSION_EVIDENCE_MISSING')
  return { enabled: reasons.length === 0, reasons }
}
export type Registry = ReturnType<typeof createRegistry>
export function assertRegistry(registry: Registry) {
  ensure(hash(createRegistry(registry.entries.map(e => e.source))) === hash(registry), 'REGISTRY_CHANGED')
}
