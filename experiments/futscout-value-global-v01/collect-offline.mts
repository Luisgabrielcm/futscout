// Explicit offline collection CLI. Never opens a PostgreSQL connection.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { executeGlobal } from './executor'
import { loadFrozen, offlineResources, operationalRoot } from './operational'
import { loadValueBindings } from './local-bindings'
import { sha } from './runner'
import { operationalBalanceRecoveryPolicy, operationalQuarantinePolicy } from './quarantine-policy'
import { capturedDiagnostic, diagnose, persistDiagnostic } from './diagnostics'

const offlineRoot = resolve('audit/output/value-global-offline-execution')

async function main() {
  assert(process.argv.includes('--collect-offline-authorized'), 'EXPLICIT_OFFLINE_COLLECTION_AUTHORIZATION_REQUIRED')
  assert.equal(process.env.FUTSCOUT_GLOBAL_AUTHORIZED_HOST, hostname(), 'AUTHORIZED_HOST_REQUIRED')
  assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'beta-next')
  const valueBindings = loadValueBindings()
  const childHash = valueBindings.offlineSelectionHash
  const approvedSelectionHash = valueBindings.parentSelectionHash
  const frozen = loadFrozen()
  const selectionBytes = readFileSync('audit/output/value-global-remaining-preflight/selection.json')
  const manifestBytes = readFileSync('audit/output/value-global-remaining-preflight/dataset.manifest.json')
  assert.equal(sha(selectionBytes), childHash, 'FROZEN_COMPLEMENTARY_SELECTION')
  const selection = JSON.parse(selectionBytes.toString()) as { firstOriginalPosition: number; playerIds: string[] }
  assert.equal(selection.firstOriginalPosition, 1058, 'OFFLINE_START_POSITION')
  const originalPosition = new Map(selection.playerIds.map((id, index) => [id, index + selection.firstOriginalPosition]))
  const env = parseEnv(readFileSync('.env', 'utf8'))
  const key = process.env.LIVE_FOOTBALL_API_KEY ?? env.LIVE_FOOTBALL_API_KEY
  assert(key, 'LIVE_FOOTBALL_CREDENTIAL_MISSING')
  const result = await executeGlobal({ bytes: selectionBytes, expectedHash: childHash, root: offlineRoot,
    authorizedHost: hostname(), valueBindings, autoQuarantine: operationalQuarantinePolicy(process.argv.slice(2)),
    autoBalanceRecovery: operationalBalanceRecoveryPolicy(process.argv.slice(2)),
    offlineContinuation: { parentBytes: frozen.bytes, manifestBytes, parentRoot: operationalRoot, expectedParentHash: approvedSelectionHash },
    create: async () => offlineResources(key, join(offlineRoot, childHash), childHash, sha(frozen.bytes), originalPosition, valueBindings) })
  console.log(JSON.stringify({ status: result.status ?? 'VALUE_OFFLINE_COLLECTION_COMPLETE', ...result }))
}

main().catch(async error => {
  const diagnostic = capturedDiagnostic(error) ?? diagnose(error, { requestId: null, stage: 'EXECUTOR', outcomeIndeterminate: true })
  let diagnosticHash: string | null = null
  try { diagnosticHash = await persistDiagnostic(offlineRoot, diagnostic) } catch { /* Never retry or print raw errors. */ }
  console.error(JSON.stringify({ status: 'VALUE_OFFLINE_COLLECTION_BLOCKED_NO_RETRY', diagnostic, diagnosticHash }))
  process.exitCode = 1
})
