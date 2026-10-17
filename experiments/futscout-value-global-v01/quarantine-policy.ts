import type { Diagnostic } from './diagnostics'

export const autoPolicyVersion = 'auto-quarantine-v01'
export type AutoQuarantinePolicy = { enabled: true; version: typeof autoPolicyVersion }
export const autoBalancePolicyVersion = 'auto-balance-recovery-v01'
export type AutoBalanceRecoveryPolicy = { enabled: true; version: typeof autoBalancePolicyVersion }
/** Explicit CLI opt-in only; never inferred from environment or historical events. */
export function operationalQuarantinePolicy(args: readonly string[]): AutoQuarantinePolicy | undefined {
  const flags = args.filter(arg => arg.startsWith('--auto-quarantine'))
  if (!flags.length) return undefined
  if (flags.length !== 1 || flags[0] !== '--auto-quarantine-v01') throw new Error('INVALID_AUTO_QUARANTINE_OPT_IN')
  return { enabled: true, version: autoPolicyVersion }
}
/** BALANCE is systemic unless this independent, explicit offline-only flag is present. */
export function operationalBalanceRecoveryPolicy(args: readonly string[]): AutoBalanceRecoveryPolicy | undefined {
  const flags = args.filter(arg => arg.startsWith('--auto-balance-recovery'))
  if (!flags.length) return undefined
  if (flags.length !== 1 || flags[0] !== '--auto-balance-recovery-v01') throw new Error('INVALID_AUTO_BALANCE_OPT_IN')
  return { enabled: true, version: autoBalancePolicyVersion }
}
export function isBalanceDiagnostic(d: Diagnostic) {
  return (d.stage === 'LIVE_SEARCH' || d.stage === 'LIVE_PROFILE') && d.outcomeIndeterminate &&
    d.errorClass === 'AssertionError' && d.code === 'ERR_ASSERTION' && d.assertion === 'BALANCE'
}
export function failureClass(d: Diagnostic): 'A_LOCAL' | 'B_QUERY_UNKNOWN' | 'C_WRITE_UNKNOWN' | 'D_SYSTEMIC' {
  if (d.stage === 'WRITE_PLAYER' || d.stage === 'READ_BACK') return 'C_WRITE_UNKNOWN'
  if (!d.outcomeIndeterminate && d.assertion === 'NAME') return 'A_LOCAL'
  if ((d.stage === 'LIVE_SEARCH' || d.stage === 'LIVE_PROFILE') && d.outcomeIndeterminate &&
    ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET', 'ABORT_ERR'].includes(d.code)) return 'B_QUERY_UNKNOWN'
  // DNS, auth, rate limits, assertions, integrity, storage, unknown and preflight failures stop.
  return 'D_SYSTEMIC'
}
export function quarantineLimits(positions: number[], consecutive: number) {
  const sorted = [...positions].sort((a, b) => a - b)
  return consecutive <= 2 && sorted.every((p, i) => sorted.filter(x => x >= p && x < p + 100).length <= 5 && (i === 0 || p !== sorted[i - 1]))
}
