// Temporary, opt-in server diagnostic. No HTTP route and no work by default.
export function shouldRunValueRuntimeRoleDiagnostic(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_RUNTIME === 'nodejs' && env.VERCEL_ENV === 'production' &&
    Boolean(env.VERCEL_REGION) && env.FUTSCOUT_VALUE_ROLE_DIAGNOSTIC === '1'
}

export async function register() {
  if (!shouldRunValueRuntimeRoleDiagnostic()) return
  const { runValueRuntimeRoleDiagnostic } = await import('./experiments/futscout-value-global-v01/runtime-role-diagnostic')
  await runValueRuntimeRoleDiagnostic()
}
