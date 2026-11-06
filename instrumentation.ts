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

export async function register() {
  if (shouldRunAdminDatabaseIdentityDiagnostic()) {
    const { runAdminDatabaseIdentityDiagnostic } = await import('./lib/adminDatabaseIdentityDiagnostic.server')
    await runAdminDatabaseIdentityDiagnostic()
  }
  if (!shouldRunValueRuntimeRoleDiagnostic()) return
  const { runValueRuntimeRoleDiagnostic } = await import('./experiments/futscout-value-global-v01/runtime-role-diagnostic')
  await runValueRuntimeRoleDiagnostic()
}
