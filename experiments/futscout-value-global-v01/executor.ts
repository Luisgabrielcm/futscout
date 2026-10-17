import assert from 'node:assert/strict'
import { mkdir, open, readFile, readdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { acquireGlobalLock } from './global-lock'
import { loadValueBindings, validateValueBindings, type ValueBindings } from './local-bindings'
import { runGlobal, sha, type BalanceEvidence, type BalanceRecoveryIntent, type Dependencies, type Player } from './runner'
import { captureCleanup } from './diagnostics'
import type { AutoBalanceRecoveryPolicy, AutoQuarantinePolicy } from './quarantine-policy'

type Balance = { credits: number; observedAt: string; official: boolean }
export interface ExecutorResources {
  prepare?(): Promise<void>
  dependencies(balance: () => Promise<Balance>, collectionLimit: number): Dependencies
  probeBalance(): Promise<Balance>
  close(): Promise<void>
}
export interface ExecutorOptions {
  bytes: Buffer; root: string; authorizedHost: string
  create: () => Promise<ExecutorResources>
  // Only synthetic tests may change the frozen selection hash.
  valueBindings?: ValueBindings
  expectedHash?: string
  autoQuarantine?: AutoQuarantinePolicy
  autoBalanceRecovery?: AutoBalanceRecoveryPolicy
  continuation?: { selectionBytes: Buffer; manifestBytes: Buffer }
  /** Offline collection only: parent journal is verified and never modified. */
  offlineContinuation?: { parentBytes: Buffer; manifestBytes: Buffer; parentRoot: string; expectedParentHash: string }
}

/** Offline binding only: parent identifiers and budget remain authoritative. */
export function bindContinuation(parentBytes: Buffer, childBytes: Buffer, manifestBytes: Buffer,
  journal: string[], balanceIntents: number, valueBindings?: ValueBindings) {
  const parentHash = sha(parentBytes), child = JSON.parse(childBytes.toString()), manifest = JSON.parse(manifestBytes.toString())
  if (valueBindings) {
    const verified = validateValueBindings(valueBindings)
    assert.equal(parentHash, verified.parentSelectionHash, 'CONTINUATION_PARENT')
    assert.equal(sha(childBytes), verified.offlineSelectionHash, 'CONTINUATION_APPROVED_HASH')
  }
  const parent = JSON.parse(parentBytes.toString()) as { players: (Player & { order: number })[] }
  assert.equal(child.schemaVersion, 'value-global-remaining-v1', 'CONTINUATION_SCHEMA')
  assert.equal(manifest.schemaVersion, 'value-global-remaining-manifest-v1', 'CONTINUATION_MANIFEST')
  assert.equal(manifest.selectionHash, sha(childBytes), 'CONTINUATION_HASH')
  assert.equal(child.parentSelectionHash, parentHash, 'CONTINUATION_PARENT')
  assert.equal(manifest.parentSelectionHash, parentHash, 'CONTINUATION_PARENT')
  let previous: string | null = null
  const events = journal.map(raw => {
    const envelope = JSON.parse(raw)
    assert.equal(envelope.hash, sha(JSON.stringify(envelope.record)), 'CONTINUATION_CORRUPTION')
    assert.equal(envelope.record.previous, previous, 'CONTINUATION_CHAIN')
    assert.equal(envelope.record.selectionHash, parentHash, 'CONTINUATION_JOURNAL_SELECTION')
    previous = envelope.hash
    return envelope.record.event as { kind: string; id: string }
  })
  assert.equal(child.parentJournalHash, previous, 'CONTINUATION_JOURNAL_CHANGED')
  assert.equal(manifest.parentJournalHash, previous, 'CONTINUATION_JOURNAL_CHANGED')
  assert(Number.isSafeInteger(child.firstOriginalPosition) && child.firstOriginalPosition > 1, 'CONTINUATION_POSITION')
  assert.equal(child.lastOriginalPosition, parent.players.length, 'CONTINUATION_POSITION')
  const players = parent.players.slice(child.firstOriginalPosition - 1)
  assert.deepEqual(child.playerIds, players.map(p => p.playerId), 'CONTINUATION_ORDER')
  assert.equal(new Set(child.playerIds).size, players.length, 'CONTINUATION_DUPLICATE')
  assert.equal(manifest.players, players.length, 'CONTINUATION_COUNT')
  assert.equal(manifest.firstOriginalPosition, child.firstOriginalPosition)
  assert.equal(manifest.lastOriginalPosition, child.lastOriginalPosition)
  const requests = events.filter(e => e.kind === 'REQUEST').length
  assert(Number.isSafeInteger(balanceIntents) && balanceIntents >= 0, 'CONTINUATION_BALANCE_COUNT')
  const inheritedRequests = requests + balanceIntents
  assert.equal(manifest.inheritedRequests, inheritedRequests, 'CONTINUATION_BUDGET')
  assert.equal(manifest.originalCap, 17408, 'CONTINUATION_CAP')
  assert.equal(manifest.remainingCap, 17408 - inheritedRequests, 'CONTINUATION_BUDGET')
  const entries = players.map((player, i) => {
    const originalPosition = child.firstOriginalPosition + i
    assert.equal(player.order, originalPosition, 'CONTINUATION_ORIGINAL_POSITION')
    const requestId = `lfglobal-${parentHash.slice(0, 16)}-${player.playerId}`
    assert(!child.excludedIds.includes(player.playerId), 'CONTINUATION_EXCLUDED')
    assert(!events.some(e => e.id === requestId || e.id === `${requestId}-search` || e.id === `${requestId}-profile`), 'CONTINUATION_PRIOR_ATTEMPT')
    return { player, originalPosition, requestId }
  })
  return { parentHash, childHash: sha(childBytes), inheritedRequests, remainingCap: 17408 - inheritedRequests,
    entries, originalJournalHash: previous, executionEnabled: false as const }
}
async function atomicCreate(file: string, value: unknown) {
  const handle = await open(`${file}.tmp`, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
  await rename(`${file}.tmp`, file)
}
/** Operational composition. The CLI must separately require explicit execution authorization. */
export async function executeGlobal(options: ExecutorOptions) {
  assert.equal(options.authorizedHost, hostname(), 'SINGLE_AUTHORIZED_HOST_REQUIRED')
  assert(!options.continuation || !options.offlineContinuation, 'CONTINUATION_MODE_COLLISION')
  const valueBindings = options.valueBindings ? validateValueBindings(options.valueBindings) : loadValueBindings()
  const hash = options.expectedHash ?? valueBindings.parentSelectionHash
  assert.equal(sha(options.bytes), hash, 'SELECTION_HASH')
  assert(hash === (options.offlineContinuation ? valueBindings.offlineSelectionHash :
    valueBindings.parentSelectionHash), 'APPROVED_SELECTION_REQUIRED')
  const root = resolve(options.root), runDir = join(root, hash)
  const parentHash = options.offlineContinuation && sha(options.offlineContinuation.parentBytes)
  const releaseParent = options.offlineContinuation
    ? await acquireGlobalLock(resolve(options.offlineContinuation.parentRoot), parentHash!) : undefined
  let release: (() => Promise<void>) | undefined
  try { release = await acquireGlobalLock(root, hash) }
  catch (error) { await releaseParent?.(); throw error }
  let resources: ExecutorResources | undefined
  let failed = false, primary: unknown
  try {
    if (options.continuation) {
      const journalDir = join(runDir, 'journal')
      const files = (await readdir(journalDir)).filter(f => /^\d{8}\.json$/.test(f)).sort()
      files.forEach((file, i) => assert.equal(file, `${String(i + 1).padStart(8, '0')}.json`, 'CONTINUATION_JOURNAL_GAP'))
      const budgetFiles = await readdir(join(runDir, 'budget'))
      assert(!budgetFiles.some(f => f.endsWith('.tmp')), 'UNCERTAIN_BALANCE_FILE')
      const intents = budgetFiles.filter(f => /^\d{6}\.intent\.json$/.test(f)).sort()
      assert.equal(budgetFiles.length, intents.length * 2, 'ORPHAN_OR_UNKNOWN_BUDGET_FILE')
      for (const [i, file] of intents.entries()) {
        assert.equal(file, `${String(i + 1).padStart(6, '0')}.intent.json`, 'BUDGET_GAP')
        const intent = JSON.parse(await readFile(join(runDir, 'budget', file), 'utf8'))
        const receipt = JSON.parse(await readFile(join(runDir, 'budget', file.replace('.intent.', '.receipt.')), 'utf8'))
        assert.equal(intent.selectionHash, hash); assert.equal(intent.cost, 1)
        assert.equal(receipt.selectionHash, hash); assert.equal(receipt.hash, sha(JSON.stringify(receipt.balance)))
      }
      bindContinuation(options.bytes, options.continuation.selectionBytes, options.continuation.manifestBytes,
        await Promise.all(files.map(file => readFile(join(journalDir, file), 'utf8'))), intents.length, valueBindings)
      // Never bypass the original uncertain write simply by changing selection/hash.
      throw Error('CONTINUATION_REMOTE_FENCE_UNPROVEN')
    }
    let inheritedRequests = 0
    let offlinePlayers: Player[] | undefined
    if (options.offlineContinuation) {
      assert.equal(parentHash, options.offlineContinuation.expectedParentHash, 'OFFLINE_PARENT_SELECTION')
      const parentDir = join(resolve(options.offlineContinuation.parentRoot), parentHash!)
      const journalDir = join(parentDir, 'journal')
      const journalFiles = (await readdir(journalDir)).filter(f => /^\d{8}\.json$/.test(f)).sort()
      journalFiles.forEach((file, i) => assert.equal(file, `${String(i + 1).padStart(8, '0')}.json`, 'CONTINUATION_JOURNAL_GAP'))
      const budgetFiles = await readdir(join(parentDir, 'budget'))
      assert(!budgetFiles.some(f => f.endsWith('.tmp')), 'UNCERTAIN_PARENT_BALANCE_FILE')
      const parentIntents = budgetFiles.filter(f => /^\d{6}\.intent\.json$/.test(f)).sort()
      assert.equal(budgetFiles.length, parentIntents.length * 2, 'ORPHAN_PARENT_BUDGET_FILE')
      for (const [i, file] of parentIntents.entries()) {
        assert.equal(file, `${String(i + 1).padStart(6, '0')}.intent.json`, 'PARENT_BUDGET_GAP')
        const intent = JSON.parse(await readFile(join(parentDir, 'budget', file), 'utf8'))
        const receipt = JSON.parse(await readFile(join(parentDir, 'budget', file.replace('.intent.', '.receipt.')), 'utf8'))
        assert.equal(intent.selectionHash, parentHash); assert.equal(intent.cost, 1)
        assert.equal(receipt.selectionHash, parentHash); assert.equal(receipt.hash, sha(JSON.stringify(receipt.balance)))
      }
      const bound = bindContinuation(options.offlineContinuation.parentBytes, options.bytes,
        options.offlineContinuation.manifestBytes,
        await Promise.all(journalFiles.map(file => readFile(join(journalDir, file), 'utf8'))), parentIntents.length, valueBindings)
      inheritedRequests = bound.inheritedRequests
      offlinePlayers = bound.entries.map(entry => entry.player)
    }
    await mkdir(runDir, { recursive: true })
    const budgetDir = join(runDir, 'budget'), journalDir = join(runDir, 'journal')
    await mkdir(budgetDir, { recursive: true }); await mkdir(journalDir, { recursive: true })
    const files = await readdir(budgetDir)
    assert(!files.some(f => f.endsWith('.tmp')), 'UNCERTAIN_BALANCE_FILE')
    const intents = files.filter(f => /^\d{6}\.intent\.json$/.test(f)).sort()
    const recoveryReceipts = new Map<string, { intent: BalanceRecoveryIntent; evidence: BalanceEvidence }>()
    assert.equal(files.length, intents.length * 2, 'ORPHAN_OR_UNKNOWN_BUDGET_FILE')
    for (const [index, file] of intents.entries()) {
      assert.equal(file, `${String(index + 1).padStart(6, '0')}.intent.json`, 'BUDGET_GAP')
      const intent = JSON.parse(await readFile(join(budgetDir, file), 'utf8'))
      assert.equal(intent.selectionHash, hash); assert.equal(intent.cost, 1)
      const receipt = JSON.parse(await readFile(join(budgetDir, file.replace('.intent.', '.receipt.')), 'utf8'))
      assert.equal(receipt.selectionHash, hash)
      assert.equal(receipt.hash, sha(JSON.stringify(receipt.balance)), 'BALANCE_RECEIPT_CORRUPT')
      if (intent.recovery) {
        assert(options.offlineContinuation && options.autoBalanceRecovery, 'BALANCE_RECOVERY_OPT_IN_REQUIRED')
        assert.deepEqual(receipt.recovery, intent.recovery, 'BALANCE_RECOVERY_RECEIPT_SCOPE')
        assert.equal(receipt.recoveryHash, sha(JSON.stringify({ balance: receipt.balance, recovery: intent.recovery })),
          'BALANCE_RECOVERY_RECEIPT_HASH')
        const requestId = (intent.recovery as BalanceRecoveryIntent).requestId
        assert(!recoveryReceipts.has(requestId), 'DUPLICATE_BALANCE_RECOVERY_RECEIPT')
        recoveryReceipts.set(requestId, { intent: intent.recovery,
          evidence: { receiptId: file.slice(0, 6), receiptHash: receipt.recoveryHash,
            credits: receipt.balance.credits, observedAt: receipt.balance.observedAt, official: receipt.balance.official } })
      } else assert(!receipt.recovery && !receipt.recoveryHash, 'UNBOUND_BALANCE_RECEIPT')
    }
    // Conservatively count a new balance attempt in the global cap before allowing it.
    const collectionLimit = 17408 - inheritedRequests - intents.length - 1
    assert(collectionLimit >= 0, 'GLOBAL_BUDGET_EXHAUSTED')
    resources = await options.create() // Exactly one shared writer pool/client per process.
    await resources.prepare?.() // Fail closed before the paid balance probe or any player request.
    let balanceCount = intents.length
    const saveBalance = async (recovery?: BalanceRecoveryIntent) => {
      const id = String(balanceCount + 1).padStart(6, '0')
      await atomicCreate(join(budgetDir, `${id}.intent.json`), { selectionHash: hash, cost: 1,
        startedAt: new Date().toISOString(), ...(recovery ? { recovery } : {}) })
      balanceCount++
      const result = await resources!.probeBalance() // Once per invocation, no retry.
      assert(result.official && Number.isSafeInteger(result.credits) && result.credits >= 0, 'BALANCE_INVALID')
      assert(Math.abs(Date.now() - Date.parse(result.observedAt)) < 60000, 'BALANCE_EXPIRED')
      const recoveryHash = recovery && sha(JSON.stringify({ balance: result, recovery }))
      await atomicCreate(join(budgetDir, `${id}.receipt.json`), { selectionHash: hash, balance: result,
        hash: sha(JSON.stringify(result)), ...(recovery ? { recovery, recoveryHash } : {}) })
      if (recovery) {
        const evidence: BalanceEvidence = { receiptId: id, receiptHash: recoveryHash!, credits: result.credits,
          observedAt: result.observedAt, official: true }
        recoveryReceipts.set(recovery.requestId, { intent: recovery, evidence })
        return { balance: result, evidence }
      }
      return { balance: result }
    }
    const balance = async () => (await saveBalance()).balance
    const deps = resources.dependencies(balance, collectionLimit)
    if (offlinePlayers) {
      assert(!deps.stagingGeneration && !deps.offline, 'OFFLINE_BINDING_COLLISION')
      deps.offline = { parentHash: parentHash!, players: offlinePlayers }
      if (options.autoBalanceRecovery) deps.balanceRecovery = {
        read: async intent => {
          const saved = recoveryReceipts.get(intent.requestId)
          if (!saved) return null
          assert.deepEqual(saved.intent, intent, 'BALANCE_RECOVERY_INTENT_CHANGED')
          return saved.evidence
        },
        probe: async (intent, playerRequests) => {
          assert(inheritedRequests + playerRequests + balanceCount + 1 <= 17408, 'GLOBAL_BUDGET_EXHAUSTED')
          assert(!recoveryReceipts.has(intent.requestId), 'BALANCE_ALREADY_PROBED')
          const saved = await saveBalance(intent)
          assert(saved.evidence, 'BALANCE_EVIDENCE_MISSING')
          return saved.evidence
        },
      }
    }
    if (valueBindings) deps.valueBindings = valueBindings
    const result = await runGlobal(options.bytes, hash, journalDir, deps, collectionLimit, undefined,
      options.autoQuarantine, options.autoBalanceRecovery)
    return { ...result, inheritedRequests, balanceRequests: balanceCount,
      totalRequests: inheritedRequests + result.requests + balanceCount }
  } catch (error) {
    failed = true; primary = error; throw error
  } finally {
    const cleanupErrors: unknown[] = []
    try { if (resources) await resources.close() } catch (error) { cleanupErrors.push(error) }
    try { await release?.() } catch (error) { cleanupErrors.push(error) }
    try { await releaseParent?.() } catch (error) { cleanupErrors.push(error) }
    if (failed) { for (const error of cleanupErrors) captureCleanup(primary, error) }
    else if (cleanupErrors.length) throw cleanupErrors[0]
  }
}
