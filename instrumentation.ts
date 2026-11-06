// Temporary, opt-in server diagnostic. No HTTP route and no work by default.
export function shouldRunValueRuntimeRoleDiagnostic(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_RUNTIME === 'nodejs' && env.VERCEL_ENV === 'production' &&
    Boolean(env.VERCEL_REGION) && env.FUTSCOUT_VALUE_ROLE_DIAGNOSTIC === '1'
}

export function shouldRunAdminDatabaseIdentityDiagnostic(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'production' && env.NEXT_RUNTIME === 'nodejs' && env.VERCEL_ENV === 'production' &&
    Boolean(env.VERCEL_REGION) && env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC === '1' &&
    Boolean(env.DATABASE_URL) && Boolean(env.FUTSCOUT_ADMIN_DATABASE_URL)
}

type IdentityStatus = 'VERIFIED' | 'INCONCLUSIVE'

export function adminDatabaseIdentityLog(status: IdentityStatus) {
  return JSON.stringify({ diagnostic: 'FUTSCOUT_ADMIN_DATABASE_IDENTITY', identity: status })
}

export async function registerAdminDatabaseIdentityDiagnostic(
  env: NodeJS.ProcessEnv,
  run: () => Promise<IdentityStatus>,
  emit: (line: string) => void,
) {
  if (env.FUTSCOUT_ADMIN_DB_IDENTITY_DIAGNOSTIC !== '1' || env.NEXT_RUNTIME === 'edge') return
  let status: IdentityStatus = 'INCONCLUSIVE'
  if (shouldRunAdminDatabaseIdentityDiagnostic(env)) {
    try { status = await run() } catch { /* Never surface connection or import errors. */ }
  }
  emit(adminDatabaseIdentityLog(status))
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
