// This file is an explicit CLI only; never imported by application runtime or tests.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { hostname } from 'node:os'
import { executeGlobal } from './executor'
import { loadFrozen, operationalResources, operationalRoot } from './operational'
import { capturedDiagnostic, diagnose, persistDiagnostic } from './diagnostics'
import { operationalQuarantinePolicy } from './quarantine-policy'

async function main() {
  assert(process.argv.includes('--execute-authorized'), 'EXPLICIT_FUTURE_EXECUTION_AUTHORIZATION_REQUIRED')
  const autoQuarantine = operationalQuarantinePolicy(process.argv.slice(2))
  assert.equal(process.env.FUTSCOUT_GLOBAL_AUTHORIZED_HOST, hostname(), 'AUTHORIZED_HOST_REQUIRED')
  assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'beta-next')
  const frozen = loadFrozen()
  const env = parseEnv(readFileSync('.env', 'utf8'))
  const url = env.DIRECT_URL, key = process.env.LIVE_FOOTBALL_API_KEY ?? env.LIVE_FOOTBALL_API_KEY
  assert(url && key, 'CREDENTIALS_MISSING')
  const result = await executeGlobal({ bytes: frozen.bytes, root: operationalRoot, authorizedHost: hostname(),
    autoQuarantine,
    create: async () => operationalResources(url, key, frozen) })
  console.log(JSON.stringify({ status: 'VALUE_GLOBAL_PASS', ...result }))
}
main().catch(async error => {
  const diagnostic = capturedDiagnostic(error) ?? diagnose(error, { requestId: null, stage: 'EXECUTOR', outcomeIndeterminate: true })
  let diagnosticHash: string | null = null
  try { diagnosticHash = await persistDiagnostic(operationalRoot, diagnostic) } catch { /* No retry or raw logging on storage failure. */ }
  console.error(JSON.stringify({ status: 'VALUE_GLOBAL_BLOCKED_RECONCILE_JOURNAL_NO_RETRY', diagnostic, diagnosticHash, diagnosticStored: diagnosticHash !== null }))
  process.exitCode = 1
})
