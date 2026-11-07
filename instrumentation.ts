// Temporary, opt-in server diagnostic. No HTTP route and no work by default.
import type { IdentityDiagnosticCode, IdentityDiagnosticOutcome } from './lib/adminDatabaseIdentityDiagnostic.server'
export function shouldRunValueRuntimeRoleDiagnostic(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_RUNTIME === 'nodejs' && env.VERCEL_ENV === 'production' &&
    Boolean(env.VERCEL_REGION) && env.FUTSCOUT_VALUE_ROLE_DIAGNOSTIC === '1'
}

export function isNodeJsProcess() {
  return typeof process !== 'undefined' && process.release?.name === 'node' &&
    typeof process.versions?.node === 'string' && /^\d+\.\d+\.\d+$/.test(process.versions.node)
}

export function adminDatabaseIdentityContextFailure(
  env: NodeJS.ProcessEnv,
  nodeProcess = isNodeJsProcess(),
): IdentityDiagnosticCode | null {
  if (env.NODE_ENV !== 'production') return 'CONTEXT_NODE_ENV'
  if (env.NEXT_RUNTIME === 'edge') return 'CONTEXT_EDGE_RUNTIME'
  if (!nodeProcess) return 'CONTEXT_NOT_NODE'
  if (env.VERCEL_ENV !== 'production') return 'CONTEXT_VERCEL_ENV'
  if (!env.DATABASE_URL) return 'CONFIG_RUNTIME_MISSING'
  if (!env.FUTSCOUT_ADMIN_DATABASE_URL) return 'CONFIG_ADMIN_MISSING'
  return null
}

export function shouldRunAdminDatabaseIdentityDiagnostic(env: NodeJS.ProcessEnv = process.env, nodeProcess = isNodeJsProcess()) {
  return env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC === '1' &&
    adminDatabaseIdentityContextFailure(env, nodeProcess) === null
}

export function adminDatabaseIdentityLog(result: IdentityDiagnosticOutcome) {
  return JSON.stringify({ diagnostic: 'FUTSCOUT_ADMIN_DATABASE_IDENTITY', ...result })
}

export async function registerAdminDatabaseIdentityDiagnostic(
  env: NodeJS.ProcessEnv,
  run: () => Promise<IdentityDiagnosticOutcome>,
  emit: (line: string) => void,
  nodeProcess = isNodeJsProcess(),
) {
  if (env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC !== '1' || env.NEXT_RUNTIME === 'edge') return
  const contextCode = adminDatabaseIdentityContextFailure(env, nodeProcess)
  let result: IdentityDiagnosticOutcome = { identity: 'INCONCLUSIVE', code: contextCode ?? 'STARTUP' }
  if (contextCode === null) {
    try { result = await run() }
    catch { result = { identity: 'INCONCLUSIVE', code: 'STARTUP' } }
  }
  emit(adminDatabaseIdentityLog(result))
}

export async function register() {
  await registerAdminDatabaseIdentityDiagnostic(process.env, async () => {
    const { runAdminDatabaseIdentityDiagnostic } = await import('./lib/adminDatabaseIdentityDiagnostic.server')
    return runAdminDatabaseIdentityDiagnostic()
  }, (line) => console.log(line))
  if (!shouldRunValueRuntimeRoleDiagnostic()) return
  const { runValueRuntimeRoleDiagnostic } = await import('./experiments/futscout-value-global-v01/runtime-role-diagnostic')
  await runValueRuntimeRoleDiagnostic()
}
