import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'
import { economicFingerprint, validInstant } from '../../lib/economicData/value'
import { capture, captureCleanup, diagnose, type Diagnostic, type Stage } from './diagnostics'
import { autoBalancePolicyVersion, autoPolicyVersion, failureClass, isBalanceDiagnostic, quarantineLimits,
  type AutoBalanceRecoveryPolicy, type AutoQuarantinePolicy } from './quarantine-policy'
import { approvedManualAttempt, validateValueBindings, type ValueBindings } from './local-bindings'
import { buildImportBatches, validateImportItem, type ImportItem } from './offline-import-prep'
import { validateRejected, type RejectedResponse } from './response-v02'

export const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export type Player = { playerId: string; leagueId: string; clubId: string; name?: string; dateOfBirth?: string; nationality?: string; [key: string]: unknown }
type Response = { data: unknown; observedAt: string; outcome?: 'SUCCESS' } | RejectedResponse
type Event = { kind: string; id: string; payload: unknown }
export type WriteIsolation = {
  playerId: string; position: number; requestId: string; originalAttemptHash: string
  inputHash: string; contentHash: string; approvedAt: string
  originalState: 'WRITE_INDETERMINATE'; reconciliation: 'PENDING'; retryBlocked: true
}
export type WriteTermination = {
  requestId: string; originalAttemptHash: string; contentHash: string; inputHash: string
  outcome: 'COMMIT_ACKNOWLEDGED' | 'ROLLBACK_ACKNOWLEDGED'; evidenceRef: string; verifiedAt: string
}
export type QuarantineApproval = { position: number; playerId: string
  approved: true; selectionHash: string
  requestId: string; originalRequestHash: string; approvedAt: string; approvalReference: string
}
type Quarantine = QuarantineApproval & {
  originalState: 'UNKNOWN'; reconciliation: 'PENDING'; retryBlocked: true; reservedRequests: 1
  reason: 'RESPONSE_NOT_PRESERVED'; journalReference: string
}
export type BalanceEvidence = { receiptId: string; receiptHash: string; credits: number; observedAt: string; official: true }
type AutoQuarantine = Omit<Quarantine, 'position' | 'playerId'> & {
  position: number; playerId: string; mode: typeof autoPolicyVersion | typeof autoBalancePolicyVersion
  diagnostic: Diagnostic; balanceEvidence?: BalanceEvidence
}
export type BalanceRecoveryIntent = {
  requestId: string; playerId: string; position: number; originalRequestHash: string
  diagnostic: Diagnostic; requiredCredits: number
}

export type PreparedStagingImport = {
  sourceSelectionHash: string; parentSelectionHash: string; journalHash: string; batchHash: string
  items: readonly ImportItem[]
}

export interface Dependencies {
  /** One previously prepared offline batch, never a new provider consultation. */
  preparedImport?: PreparedStagingImport
  /** Explicit private bindings, absent unless supplied by the operational caller. */
  valueBindings?: ValueBindings
  /** New generation only: write an Observation without selecting public Current. */
  stagingGeneration?: string
  /** Frozen complementary selection, resolved against the immutable parent selection. */
  offline?: { parentHash: string; players: Player[] }
  /** Experimental explicit opt-in; operational activation still requires all write gates. */
  continuous?: true
  /** Explicit opt-in; never inferred from an absent database row. */
  writeIsolation?: WriteIsolation
  /** Trusted binding must prove the ORIGINAL attempt ended, not merely that its process exited. */
  verifyWriteTermination?(isolation: WriteIsolation): Promise<WriteTermination | null>
  /** Test clock only; real bindings must retain the default 1100ms pacing. */
  wait?: (milliseconds: number) => Promise<void>
  /** Offline-only, one paid probe per new BALANCE attempt. Read is local and never probes. */
  balanceRecovery?: {
    probe(intent: BalanceRecoveryIntent, playerRequests: number): Promise<BalanceEvidence>
    read(intent: BalanceRecoveryIntent): Promise<BalanceEvidence | null>
  }
  preflight(players: Player[], progress: { completed: string[]; writes: EconomicWrite[]; requests: number }): Promise<void>
  existing(player: Player): Promise<boolean>
  /** Pure local validation before reserving a search request. No external effects. */
  validateSearch?(player: Player): void
  search(player: Player): Promise<Response>
  choose(player: Player, data: unknown): string | null
  profile(id: string): Promise<Response>
  // Must reuse existing strict matcher + Live Football adapter, not name-only matching.
  adapt(player: Player, providerId: string, response: Response): EconomicWrite['state'] | null
  write: (plan: EconomicWrite) => Promise<unknown>
  readBack(plan: EconomicWrite): Promise<'CONFIRMED' | 'NOT_STARTED' | 'UNKNOWN' | 'CONFLICT'>
  checkpoint(position: number): Promise<void>
}

/** Immutable hash-chained journal; a stale exclusive lock requires operator review. */
export async function runGlobal(bytes: Buffer, expectedHash: string, root: string, deps: Dependencies, limit = 17408,
  approval?: QuarantineApproval, autoPolicy?: AutoQuarantinePolicy, balancePolicy?: AutoBalanceRecoveryPolicy) {
  const preparedImport = deps.preparedImport && structuredClone(deps.preparedImport)
  const valueBindings = deps.valueBindings && validateValueBindings(deps.valueBindings)
  if (approval) assert(valueBindings, 'VALUE_BINDINGS_REQUIRED')
  assert(!autoPolicy || autoPolicy.enabled === true && autoPolicy.version === autoPolicyVersion, 'AUTO_POLICY')
  assert(!balancePolicy || balancePolicy.enabled === true && balancePolicy.version === autoBalancePolicyVersion &&
    deps.offline && deps.balanceRecovery, 'BALANCE_POLICY_OFFLINE_ONLY')
  assert(!deps.stagingGeneration || /^g[1-9][0-9]*$/.test(deps.stagingGeneration), 'STAGING_GENERATION')
  assert(!deps.offline || !deps.stagingGeneration, 'OFFLINE_STAGING_COLLISION')
  assert.equal(sha(bytes), expectedHash, 'SELECTION_HASH')
  assert(Number.isSafeInteger(limit) && limit >= 0 && limit <= 17408, 'BUDGET')
  const selection = JSON.parse(bytes.toString()) as { players?: Player[]; excludedIds: string[]; playerIds?: string[]; parentSelectionHash?: string; importBinding?: unknown }
  const players = deps.offline?.players ?? selection.players
  const requestHash = preparedImport?.parentSelectionHash ?? deps.offline?.parentHash ?? expectedHash
  assert(Array.isArray(players) && Array.isArray(selection.excludedIds), 'SELECTION')
  if (deps.offline) {
    assert.equal(selection.parentSelectionHash, requestHash, 'OFFLINE_PARENT_HASH')
    assert.deepEqual(selection.playerIds, players.map(p => p.playerId), 'OFFLINE_SELECTION_ORDER')
    assert(!selection.players, 'OFFLINE_EMBEDDED_PLAYERS')
  }
  assert.equal(new Set(players.map(p => p.playerId)).size, players.length, 'DUPLICATE_PLAYER')
  const key = (p: Player) => `${p.leagueId}\0${p.clubId}\0${p.playerId}`
  players.forEach((p, i) => {
    assert([p.playerId, p.clubId, p.leagueId].every(x => /^[a-zA-Z0-9_-]{1,80}$/.test(x)), 'CONTEXT')
    assert(!selection.excludedIds.includes(p.playerId), 'ALREADY_CONSULTED')
    if (i) assert(key(players[i - 1]) < key(p), 'ORDER')
  })
  if (preparedImport) {
    assert(valueBindings && deps.stagingGeneration && !deps.offline && !approval && !autoPolicy && !balancePolicy &&
      !deps.continuous && !deps.writeIsolation && limit === 0, 'IMPORT_STAGING_ONLY')
    const { items, ...binding } = preparedImport
    assert(binding.sourceSelectionHash === valueBindings.offlineSelectionHash &&
      binding.parentSelectionHash === valueBindings.parentSelectionHash && /^[a-f0-9]{64}$/.test(binding.journalHash), 'IMPORT_SOURCE_BINDING')
    assert.deepEqual(selection.importBinding, { ...binding, generation: deps.stagingGeneration }, 'IMPORT_SELECTION_BINDING')
    assert(items.length > 0 && items.length <= 100, 'IMPORT_SINGLE_BATCH_ONLY')
    const batches = buildImportBatches(items)
    assert(batches.length === 1 && batches[0].hash === binding.batchHash, 'IMPORT_BATCH_HASH')
    assert.deepEqual(items.map(item => item.playerId), players.map(player => player.playerId), 'IMPORT_PLAYER_ORDER')
    assert.deepEqual(items.map(item => item.position), batches[0].items.map(item => item.position), 'IMPORT_POSITION_ORDER')
    for (const item of items) {
      validateImportItem(item, requestHash)
      Object.freeze(item.plan.state.metadata); Object.freeze(item.plan.state); Object.freeze(item.plan); Object.freeze(item)
    }
  }
  await mkdir(root, { recursive: true })
  const lock = await open(join(root, 'execution.lock'), 'wx', 0o600)
  const events: Event[] = []
  const hashes: string[] = []
  let previous: string | null = null
  let poisoned = false
  let stage: Stage = 'JOURNAL', requestId: string | null = null, outcomeIndeterminate = false
  let activeLimit = limit
  let failed = false, primary: unknown
  try {
    const files = (await readdir(root)).filter(f => /^\d{8}\.json$/.test(f)).sort()
    for (const [i, file] of files.entries()) {
      assert.equal(file, `${String(i + 1).padStart(8, '0')}.json`, 'JOURNAL_GAP')
      const envelope = JSON.parse(await readFile(join(root, file), 'utf8'))
      assert.equal(envelope.hash, sha(JSON.stringify(envelope.record)), 'CORRUPTION')
      assert.equal(envelope.record.previous, previous, 'CHAIN')
      assert.equal(envelope.record.selectionHash, expectedHash, 'SELECTION_CHANGED')
      events.push(envelope.record.event); hashes.push(envelope.hash); previous = envelope.hash
    }
    const append = async (event: Event) => {
      const record = { version: 1, selectionHash: expectedHash, previous, event }
      const hash = sha(JSON.stringify(record))
      const file = join(root, `${String(events.length + 1).padStart(8, '0')}.json`)
      const temp = `${file}.tmp`
      // A failed append poisons this run; never perform another external effect.
      try {
        const handle = await open(temp, 'wx', 0o600)
        try { await handle.writeFile(JSON.stringify({ record, hash })); await handle.sync() } finally { await handle.close() }
        await rename(temp, file)
      } catch (error) { poisoned = true; throw error }
      events.push(event); hashes.push(hash); previous = hash
    }
    const find = (kind: string, id: string) => events.find(e => e.kind === kind && e.id === id)
    if (preparedImport) {
      for (const event of events) {
        assert(['WRITE', 'DONE', 'CHECKPOINT'].includes(event.kind), 'IMPORT_JOURNAL_MODE')
        if (event.kind === 'WRITE') {
          const item = preparedImport.items.find(item => item.requestId === event.id)
          assert(item && sha(JSON.stringify(event.payload)) === item.inputHash, 'IMPORT_JOURNAL_PLAN_CHANGED')
        }
        if (event.kind === 'DONE') {
          const item = preparedImport.items.find(item => item.requestId === event.id)
          assert(item && find('WRITE', event.id), 'IMPORT_JOURNAL_DONE_WITHOUT_WRITE')
        }
      }
    }
    const pendingQueue = () => events.flatMap((e, i) => {
      if (!['IDENTITY_PENDING', 'QUARANTINED', 'REJECTED_RESPONSE', 'WRITE_ISOLATED'].includes(e.kind)) return []
      const position = players.findIndex(p => {
        const base = `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}`
        return e.id === base || e.id === `${base}-search` || e.id === `${base}-profile`
      }) + 1
      assert(position > 0, 'PENDING_PLAYER')
      return [{ playerId: players[position - 1].playerId, position, requestId: e.id,
        type: e.kind, reconciliation: 'PENDING' as const, retryBlocked: true,
        evidenceHash: hashes[i], journalReference: `${String(i + 1).padStart(8, '0')}.json`,
        reason: e.kind === 'IDENTITY_PENDING' ? 'IDENTITY_OR_DATA_INSUFFICIENT' : e.kind }]
    })
    for (const e of events.filter(e => e.kind === 'IDENTITY_PENDING')) {
      const payload = e.payload as { position: number; playerId: string; responseHash: string; reason: string }
      assert(players[payload.position - 1]?.playerId === payload.playerId && e.id === `lfglobal-${requestHash.slice(0, 16)}-${payload.playerId}`, 'IDENTITY_PENDING_SCOPE')
      assert.equal(payload.reason, 'IDENTITY_OR_DATA_INSUFFICIENT')
      assert(events.some((r, i) => r.kind === 'RESPONSE' && (r.id === `${e.id}-search` || r.id === `${e.id}-profile`) && hashes[i] === payload.responseHash), 'IDENTITY_PENDING_EVIDENCE')
      assert(!find('WRITE', e.id) && !find('DONE', e.id), 'IDENTITY_PENDING_CONFLICT')
      assert.equal(events.filter(r => r.kind === 'IDENTITY_PENDING' && r.id === e.id).length, 1, 'IDENTITY_PENDING_DUPLICATE')
    }
    const validateIsolation = (isolation: WriteIsolation) => {
      assert(isolation.originalState === 'WRITE_INDETERMINATE' && isolation.reconciliation === 'PENDING' && isolation.retryBlocked === true, 'WRITE_ISOLATION_STATE')
      assert(Number.isSafeInteger(isolation.position) && players[isolation.position - 1]?.playerId === isolation.playerId, 'WRITE_ISOLATION_PLAYER')
      assert.equal(isolation.requestId, `lfglobal-${requestHash.slice(0, 16)}-${isolation.playerId}`, 'WRITE_ISOLATION_REQUEST')
      const index = events.findIndex(e => e.kind === 'WRITE' && e.id === isolation.requestId)
      assert(index >= 0 && hashes[index] === isolation.originalAttemptHash && !find('DONE', isolation.requestId), 'WRITE_ISOLATION_ATTEMPT')
      const plan = events[index].payload as EconomicWrite
      assert.equal(plan.requestId, isolation.requestId, 'WRITE_ISOLATION_PLAN_REQUEST')
      assert.equal(events.filter(e => e.kind === 'WRITE' && (e.payload as EconomicWrite).state.playerId === isolation.playerId).length, 1, 'WRITE_ISOLATION_DUPLICATE')
      assert.equal(plan.state.playerId, isolation.playerId)
      assert.equal(economicFingerprint(plan.state), isolation.contentHash, 'WRITE_ISOLATION_CONTENT')
      // Hash the original complete write input; this is NOT a replacement for historical hashes.
      assert.equal(sha(JSON.stringify(plan)), isolation.inputHash, 'WRITE_ISOLATION_INPUT')
      assert(validInstant(isolation.approvedAt) && Date.parse(isolation.approvedAt) <= Date.now(), 'WRITE_ISOLATION_TIMESTAMP')
    }
    const isolated = events.filter(e => e.kind === 'WRITE_ISOLATED')
    assert.equal(new Set(isolated.map(e => e.id)).size, isolated.length, 'DUPLICATE_WRITE_ISOLATION')
    for (const e of isolated) { validateIsolation(e.payload as WriteIsolation); assert.equal(e.id, (e.payload as WriteIsolation).requestId) }
    if (deps.stagingGeneration || deps.offline) assert(!events.some(e => e.kind === 'WRITE' && (e.payload as EconomicWrite).selectCurrent), 'LEGACY_WRITE_IN_STAGING_JOURNAL')
    if (deps.writeIsolation) {
      validateIsolation(deps.writeIsolation)
      const prior = find('WRITE_ISOLATED', deps.writeIsolation.requestId)
      if (prior) assert.deepEqual(prior.payload, deps.writeIsolation, 'WRITE_ISOLATION_CHANGED')
      else await append({ kind: 'WRITE_ISOLATED', id: deps.writeIsolation.requestId, payload: deps.writeIsolation })
    }
    for (const e of events.filter(e => e.kind === 'WRITE_ISOLATED')) {
      const isolation = e.payload as WriteIsolation
      requestId = e.id; stage = 'READ_BACK'; outcomeIndeterminate = true
      const proof = await deps.verifyWriteTermination?.(isolation)
      assert(proof && proof.requestId === e.id && proof.originalAttemptHash === isolation.originalAttemptHash &&
        proof.contentHash === isolation.contentHash && proof.inputHash === isolation.inputHash && validInstant(proof.verifiedAt) && Date.parse(proof.verifiedAt) <= Date.now() &&
        /^[a-zA-Z0-9._/-]{1,160}$/.test(proof.evidenceRef), 'WRITE_TERMINATION_UNPROVEN')
      assert(proof.outcome === 'COMMIT_ACKNOWLEDGED' || proof.outcome === 'ROLLBACK_ACKNOWLEDGED', 'WRITE_TERMINATION_OUTCOME')
      const plan = find('WRITE', e.id)!.payload as EconomicWrite
      const readBack = await deps.readBack(plan)
      assert.equal(readBack, proof.outcome === 'COMMIT_ACKNOWLEDGED' ? 'CONFIRMED' : 'NOT_STARTED', 'WRITE_ISOLATION_READ_BACK_CONFLICT')
      outcomeIndeterminate = false
    }
    assert(events.filter(e => e.kind === 'REQUEST').length <= limit, 'REQUEST_LIMIT')
    const validateBalanceEvidence = (intent: BalanceRecoveryIntent, evidence: BalanceEvidence) => {
      assert(/^\d{6}$/.test(evidence.receiptId) && /^[a-f0-9]{64}$/.test(evidence.receiptHash), 'BALANCE_EVIDENCE_HASH')
      assert(evidence.official === true && Number.isSafeInteger(evidence.credits) && evidence.credits >= intent.requiredCredits,
        'BALANCE_INSUFFICIENT')
      assert(validInstant(evidence.observedAt) && Date.parse(evidence.observedAt) <= Date.now(), 'BALANCE_EVIDENCE_TIME')
      assert(Date.parse(evidence.observedAt) >= Date.parse(intent.diagnostic.timestamp), 'BALANCE_EVIDENCE_CHRONOLOGY')
    }
    const balanceIntents = events.filter(e => e.kind === 'BALANCE_RECOVERY_INTENT')
    assert.equal(new Set(balanceIntents.map(e => e.id)).size, balanceIntents.length, 'DUPLICATE_BALANCE_RECOVERY')
    for (const event of balanceIntents) {
      const intent = event.payload as BalanceRecoveryIntent
      const index = events.findIndex(e => e.kind === 'REQUEST' && e.id === event.id)
      assert(index >= 0 && hashes[index] === intent.originalRequestHash && intent.requestId === event.id &&
        players[intent.position - 1]?.playerId === intent.playerId && isBalanceDiagnostic(intent.diagnostic) &&
        intent.diagnostic.requestId === event.id && Number.isSafeInteger(intent.requiredCredits) &&
        intent.requiredCredits >= 0 && !find('RESPONSE', event.id), 'BALANCE_RECOVERY_SCOPE')
      assert(balancePolicy && deps.balanceRecovery, 'BALANCE_RECOVERY_OPT_IN_REQUIRED')
      const evidence = await deps.balanceRecovery.read(intent)
      assert(evidence, 'BALANCE_RECEIPT_UNCERTAIN_NO_RETRY')
      validateBalanceEvidence(intent, evidence)
      if (!find('QUARANTINED', event.id)) {
        const priorFailures = events.filter(e => e.kind === 'QUARANTINED' || e.kind === 'REJECTED_RESPONSE')
        const priorPositions = priorFailures.map(e => (e.payload as { position?: number }).position ??
          players.findIndex(p => e.id.includes(`-${p.playerId}-`)) + 1)
        const lastDone = events.findLastIndex(e => e.kind === 'DONE')
        const consecutiveFailures = events.slice(lastDone + 1).filter(e =>
          e.kind === 'QUARANTINED' || e.kind === 'REJECTED_RESPONSE').length
        assert(quarantineLimits([...priorPositions, intent.position], consecutiveFailures + 1), 'AUTO_BALANCE_LIMIT')
        const payload: AutoQuarantine = { approved: true, selectionHash: expectedHash, position: intent.position,
          playerId: intent.playerId, requestId: event.id, originalRequestHash: intent.originalRequestHash,
          approvedAt: new Date().toISOString(), approvalReference: autoBalancePolicyVersion,
          originalState: 'UNKNOWN', reconciliation: 'PENDING', retryBlocked: true, reservedRequests: 1,
          reason: 'RESPONSE_NOT_PRESERVED', journalReference: `${String(index + 1).padStart(8, '0')}.json`,
          mode: autoBalancePolicyVersion, diagnostic: intent.diagnostic, balanceEvidence: evidence }
        await append({ kind: 'QUARANTINED', id: event.id, payload })
      }
    }
    const validateQuarantine = (q: QuarantineApproval | AutoQuarantine) => {
      const automatic = 'mode' in q
      const allowed = ['approved', 'selectionHash', 'position', 'playerId', 'requestId', 'originalRequestHash', 'approvedAt', 'approvalReference',
        'originalState', 'reconciliation', 'retryBlocked', 'reservedRequests', 'reason', 'journalReference',
        ...(automatic ? ['mode', 'diagnostic', ...(q.mode === autoBalancePolicyVersion ? ['balanceEvidence'] : [])] : [])]
      assert(Object.keys(q).every(key => allowed.includes(key)), 'QUARANTINE_UNEXPECTED_FIELD')
      const index = events.findIndex(e => e.kind === 'REQUEST' && e.id === q.requestId)
      assert(index >= 0 && hashes[index] === q.originalRequestHash, 'QUARANTINE_ATTEMPT_HASH')
      const manual = !automatic && approvedManualAttempt(q, expectedHash, requestHash, valueBindings)
      const scoped = automatic ? q.mode === autoPolicyVersion && autoPolicy?.enabled ||
        q.mode === autoBalancePolicyVersion && balancePolicy?.enabled : !!manual
      assert(q.approved === true && q.selectionHash === expectedHash && scoped &&
        players[q.position - 1]?.playerId === q.playerId, 'QUARANTINE_SCOPE')
      assert(validInstant(q.approvedAt) && Date.parse(q.approvedAt) <= Date.now() && /^[a-zA-Z0-9_-]{1,80}$/.test(q.approvalReference), 'QUARANTINE_APPROVAL')
      const base = `lfglobal-${requestHash.slice(0, 16)}-${q.playerId}`
      assert(q.requestId === `${base}-search` || automatic && q.requestId === `${base}-profile` ||
        !automatic && manual && manual.kind === 'PROFILE_503', 'QUARANTINE_REQUEST')
      if (automatic) {
        assert.equal(q.diagnostic.requestId, q.requestId)
        if (q.mode === autoBalancePolicyVersion) {
          assert(isBalanceDiagnostic(q.diagnostic), 'AUTO_BALANCE_DIAGNOSTIC')
          const intent = balanceIntents.find(e => e.id === q.requestId)?.payload as BalanceRecoveryIntent | undefined
          assert(intent && q.balanceEvidence, 'AUTO_BALANCE_INTENT')
          validateBalanceEvidence(intent, q.balanceEvidence)
        } else {
          assert.equal(failureClass(q.diagnostic), 'B_QUERY_UNKNOWN', 'AUTO_DIAGNOSTIC')
        }
        assert(validInstant(q.diagnostic.timestamp) && Date.parse(q.diagnostic.timestamp) <= Date.parse(q.approvedAt), 'AUTO_TIMESTAMP')
        assert.equal(q.diagnostic.stage, q.requestId.endsWith('-search') ? 'LIVE_SEARCH' : 'LIVE_PROFILE')
      }
      assert(!find('RESPONSE', q.requestId) && !find('DONE', base) &&
        !events.some(e => e.kind === 'WRITE' && (e.payload as EconomicWrite).state.playerId === q.playerId), 'QUARANTINE_CONFLICT')
    }
    const quarantines = events.filter(e => e.kind === 'QUARANTINED')
    const extraManual = quarantines.filter(e => !(e.payload as AutoQuarantine).mode &&
      approvedManualAttempt(e.payload as QuarantineApproval, expectedHash, requestHash, valueBindings)?.extraManualSlot).length
    assert(quarantines.filter(e => !(e.payload as AutoQuarantine).mode).length <= 5 + extraManual &&
      new Set(quarantines.map(e => e.id)).size === quarantines.length, 'DUPLICATE_QUARANTINE')
    for (const event of quarantines) {
      const q = event.payload as Quarantine | AutoQuarantine
      validateQuarantine(q)
      if ('mode' in q && q.mode === autoBalancePolicyVersion) {
        const intent = balanceIntents.find(e => e.id === q.requestId)?.payload as BalanceRecoveryIntent | undefined
        assert(intent, 'AUTO_BALANCE_INTENT')
        assert.deepEqual(await deps.balanceRecovery?.read(intent), q.balanceEvidence, 'AUTO_BALANCE_RECEIPT_CHANGED')
      }
      assert.equal(event.id, q.requestId)
      assert(q.originalState === 'UNKNOWN' && q.reconciliation === 'PENDING' && q.retryBlocked === true && q.reservedRequests === 1 &&
        q.reason === 'RESPONSE_NOT_PRESERVED', 'QUARANTINE_STATE')
      assert.equal(q.journalReference, `${String(events.findIndex(e => e.kind === 'REQUEST' && e.id === q.requestId) + 1).padStart(8, '0')}.json`)
    }
    const autoPositions: number[] = quarantines.map(e => (e.payload as Quarantine | AutoQuarantine).position)
    const failedPositions = new Set<number>(autoPositions)
    let consecutive = 0
    for (const e of events) {
      if (e.kind === 'QUARANTINED') {
        consecutive++
        assert(consecutive <= 2 || !(e.payload as AutoQuarantine).mode, 'AUTO_CONSECUTIVE_LIMIT')
      } else if (e.kind === 'DONE') consecutive = 0
    }
    assert(quarantineLimits(autoPositions, Math.min(consecutive, 2)), 'AUTO_WINDOW_LIMIT')
    if (!approval && !quarantines.length) {
      try { approval = JSON.parse(await readFile(join(root, 'quarantine-approval.json'), 'utf8')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    if (approval) {
      const prior = find('QUARANTINED', approval.requestId)
      if (prior) {
        for (const key of Object.keys(approval) as (keyof QuarantineApproval)[]) assert.deepEqual((prior.payload as Quarantine)[key], approval[key], 'QUARANTINE_APPROVAL_CHANGED')
      }
      validateQuarantine(approval)
      if (!prior) {
        const payload: Quarantine = { ...approval, originalState: 'UNKNOWN', reconciliation: 'PENDING', retryBlocked: true,
          reservedRequests: 1, reason: 'RESPONSE_NOT_PRESERVED',
          journalReference: `${String(events.findIndex(e => e.kind === 'REQUEST' && e.id === approval!.requestId) + 1).padStart(8, '0')}.json` }
        await append({ kind: 'QUARANTINED', id: approval.requestId, payload })
      }
    }
    const rejectedEvents = events.filter(e => e.kind === 'REJECTED_RESPONSE')
    assert.equal(new Set(rejectedEvents.map(e => e.id)).size, rejectedEvents.length, 'DUPLICATE_REJECTED')
    for (const e of rejectedEvents) {
      const r = e.payload as RejectedResponse
      validateRejected(r); assert(validInstant(r.observedAt) && Date.parse(r.observedAt) <= Date.now(), 'OBSERVED_AT')
      assert(find('REQUEST', e.id) && !find('RESPONSE', e.id) && !find('QUARANTINED', e.id), 'REJECTED_CONFLICT')
      const p = players.findIndex(p => e.id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-${r.evidence.endpoint === 'player' ? 'profile' : 'search'}`)
      assert(p >= 0, 'REJECTED_CONTEXT'); autoPositions.push(p + 1); failedPositions.add(p + 1)
      assert(!events.some(e => e.kind === 'WRITE' && (e.payload as EconomicWrite).state.playerId === players[p].playerId), 'REJECTED_WRITE')
      assert(!find('DONE', `lfglobal-${requestHash.slice(0, 16)}-${players[p].playerId}`), 'REJECTED_DONE')
    }
    assert(quarantineLimits(autoPositions, 0), 'RESPONSE_WINDOW_LIMIT')
    consecutive = 0
    for (const e of events) {
      if (e.kind === 'DONE') consecutive = 0
      else if (e.kind === 'REJECTED_RESPONSE' || e.kind === 'QUARANTINED') {
        consecutive++
        assert(consecutive <= 2 || e.kind === 'QUARANTINED' && !(e.payload as AutoQuarantine).mode, 'RESPONSE_CONSECUTIVE_LIMIT')
      }
    }
    for (const event of events.filter(e => e.kind === 'REQUEST')) assert(find('RESPONSE', event.id) || find('QUARANTINED', event.id) || find('REJECTED_RESPONSE', event.id), 'UNKNOWN_REQUEST_REQUIRES_RECONCILIATION')
    stage = 'PREFLIGHT'
    await deps.preflight(players, {
      completed: events.filter(e => e.kind === 'DONE').map(e => e.id),
      writes: events.filter(e => e.kind === 'WRITE').map(e => e.payload as EconomicWrite),
      requests: events.filter(e => e.kind === 'REQUEST').length,
    })
    let lastCall = 0
    const quarantineSignal = new Error('AUTO_QUARANTINED_NO_RETRY')
    const request = async (id: string, call: () => Promise<Response>) => {
      assert(!preparedImport, 'IMPORT_COLLECTION_FORBIDDEN')
      const saved = find('RESPONSE', id)
      if (saved) return saved.payload as Response
      assert(!find('REQUEST', id), 'UNKNOWN_REQUEST_REQUIRES_RECONCILIATION')
      assert(events.filter(e => e.kind === 'REQUEST').length < activeLimit, 'REQUEST_LIMIT')
      const delay = Math.max(0, 1100 - (Date.now() - lastCall))
      if (delay) await (deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay)
      requestId = id; stage = 'JOURNAL'; outcomeIndeterminate = false
      await append({ kind: 'REQUEST', id, payload: null })
      lastCall = Date.now()
      stage = id.endsWith('-search') ? 'LIVE_SEARCH' : 'LIVE_PROFILE'; outcomeIndeterminate = true
      let response: Response
      try {
        response = await call() // zero retry
        assert(validInstant(response.observedAt), 'OBSERVED_AT')
      } catch (error) {
        const diagnostic = diagnose(error, { requestId: id, stage, outcomeIndeterminate: true })
        if (balancePolicy && isBalanceDiagnostic(diagnostic)) {
          assert(deps.balanceRecovery, 'BALANCE_RECOVERY_BINDING')
          const position = players.findIndex(p => id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-search` ||
            id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-profile`) + 1
          assert(position > 0, 'BALANCE_RECOVERY_PLAYER')
          const preceding = failedPositions.has(position - 1) ? consecutive : 0
          assert(quarantineLimits([...autoPositions, position], preceding + 1), 'AUTO_BALANCE_LIMIT')
          const playerRequests = events.filter(e => e.kind === 'REQUEST').length
          assert(playerRequests < activeLimit, 'BALANCE_RECOVERY_BUDGET')
          const index = events.findIndex(e => e.kind === 'REQUEST' && e.id === id)
          const intent: BalanceRecoveryIntent = { requestId: id, playerId: players[position - 1].playerId,
            position, originalRequestHash: hashes[index], diagnostic,
            requiredCredits: activeLimit - 1 - playerRequests }
          const recoveryEvent = { kind: 'BALANCE_RECOVERY_INTENT', id, payload: intent }
          stage = 'JOURNAL'; await append(recoveryEvent); balanceIntents.push(recoveryEvent)
          activeLimit-- // Reserve the paid balance request even if its result is uncertain.
          const evidence = await deps.balanceRecovery.probe(intent, playerRequests)
          validateBalanceEvidence(intent, evidence)
          const payload: AutoQuarantine = { approved: true, selectionHash: expectedHash, position,
            playerId: intent.playerId, requestId: id, originalRequestHash: intent.originalRequestHash,
            approvedAt: new Date().toISOString(), approvalReference: autoBalancePolicyVersion,
            originalState: 'UNKNOWN', reconciliation: 'PENDING', retryBlocked: true, reservedRequests: 1,
            reason: 'RESPONSE_NOT_PRESERVED', journalReference: `${String(index + 1).padStart(8, '0')}.json`,
            mode: autoBalancePolicyVersion, diagnostic, balanceEvidence: evidence }
          validateQuarantine(payload)
          await append({ kind: 'QUARANTINED', id, payload })
          autoPositions.push(position); failedPositions.add(position); consecutive = preceding + 1
          outcomeIndeterminate = false
          throw quarantineSignal
        }
        if (!autoPolicy || failureClass(diagnostic) !== 'B_QUERY_UNKNOWN') throw error
        const playerId = players.find(p => id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-search` || id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-profile`)!.playerId
        const position = players.findIndex(p => p.playerId === playerId) + 1
        const preceding = failedPositions.has(position - 1) ? consecutive : 0
        assert(quarantineLimits([...autoPositions, position], preceding + 1), 'AUTO_QUARANTINE_LIMIT')
        const index = events.findIndex(e => e.kind === 'REQUEST' && e.id === id)
        const payload: AutoQuarantine = { approved: true, selectionHash: expectedHash, position, playerId, requestId: id,
          originalRequestHash: hashes[index], approvedAt: new Date().toISOString(), approvalReference: autoPolicyVersion,
          originalState: 'UNKNOWN', reconciliation: 'PENDING', retryBlocked: true, reservedRequests: 1,
          reason: 'RESPONSE_NOT_PRESERVED', journalReference: `${String(index + 1).padStart(8, '0')}.json`, mode: autoPolicyVersion, diagnostic }
        validateQuarantine(payload)
        stage = 'JOURNAL'; await append({ kind: 'QUARANTINED', id, payload })
        autoPositions.push(position); failedPositions.add(position); consecutive = preceding + 1
        outcomeIndeterminate = false // The request remains UNKNOWN; only the local append has been confirmed.
        throw quarantineSignal
      }
      // Bindings must return sanitized identity/economic fields only, never credentials/raw URLs.
      stage = 'JOURNAL'
      if (response.outcome === 'REJECTED_RESPONSE') {
        validateRejected(response)
        const position = players.findIndex(p => id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-search` || id === `lfglobal-${requestHash.slice(0, 16)}-${p.playerId}-profile`) + 1
        const preceding = failedPositions.has(position - 1) ? consecutive : 0
        assert(quarantineLimits([...autoPositions, position], preceding + 1), 'RESPONSE_FAILURE_LIMIT')
        await append({ kind: 'REJECTED_RESPONSE', id, payload: response })
        autoPositions.push(position); failedPositions.add(position); consecutive = preceding + 1
        outcomeIndeterminate = false
        throw quarantineSignal
      }
      await append({ kind: 'RESPONSE', id, payload: response })
      outcomeIndeterminate = false
      return response
    }
    const persistPlan = async (plan: EconomicWrite) => {
      requestId = plan.requestId; stage = 'JOURNAL'
      await append({ kind: 'WRITE', id: plan.requestId, payload: plan })
      stage = 'WRITE_PLAYER'; outcomeIndeterminate = true
      await deps.write(plan)
      stage = 'READ_BACK'
      assert.equal(await deps.readBack(plan), 'CONFIRMED', 'READ_BACK_DIVERGENGENCE')
      outcomeIndeterminate = false
    }
    for (const [index, player] of players.entries()) {
      const id = `lfglobal-${requestHash.slice(0, 16)}-${player.playerId}`
      try {
      if (find('WRITE_ISOLATED', id) || find('IDENTITY_PENDING', id)) {
        // The verified terminated attempt stays pending, never retried or marked DONE.
      } else
      if (!find('REJECTED_RESPONSE', `${id}-search`) && !find('REJECTED_RESPONSE', `${id}-profile`) && !find('QUARANTINED', `${id}-search`) && !find('QUARANTINED', `${id}-profile`) && !find('DONE', id)) {
        const intent = find('WRITE', id)
        if (intent) {
          requestId = id; stage = 'READ_BACK'; outcomeIndeterminate = true
          const outcome = await deps.readBack(intent.payload as EconomicWrite)
          assert.equal(outcome, 'CONFIRMED', 'UNCERTAIN_WRITE_REQUIRES_REVIEW')
          outcomeIndeterminate = false
        } else {
          requestId = id; stage = 'EXISTING'; outcomeIndeterminate = false
          assert(!await deps.existing(player), 'EXISTING_VALUE_OR_CONSULTATION')
          if (preparedImport) {
            await persistPlan(preparedImport.items[index].plan)
          } else {
            deps.validateSearch?.(player)
            const search = await request(`${id}-search`, () => deps.search(player))
            stage = 'MATCHING'
            const providerId = deps.choose(player, search.data)
            let insufficient = providerId === null
            if (providerId !== null) {
              const response = await request(`${id}-profile`, () => deps.profile(providerId))
              stage = 'MATCHING'
              const state = deps.adapt(player, providerId, response)
              insufficient = state === null || state.presence === 'ABSENT'
              if (state !== null && state.presence !== 'ABSENT') {
                assert.equal(state.playerId, player.playerId)
                assert.equal(state.providerPlayerId, providerId)
                assert.equal(state.provider, 'LIVE_FOOTBALL'); assert.equal(state.field, 'MARKET_VALUE')
                assert.equal(state.context, 'REAL_WORLD'); assert.equal(state.confidence, 'HIGH')
                assert.equal(state.matchState, 'MATCHED')
                economicFingerprint(state)
                if (state.presence === 'VALUE') assert.equal(state.currency, 'EUR')
                const plan: EconomicWrite = { state, observedAt: response.observedAt, requestId: id,
                  selectCurrent: !deps.stagingGeneration && !deps.offline, expectedRevision: null, selectionReason: 'AUTHORIZED_GLOBAL', policyVersion: 'global-v1' }
                await persistPlan(plan)
              }
            }
            if (deps.continuous && insufficient) {
              const responseIndex = events.findLastIndex(e => e.kind === 'RESPONSE' && (e.id === `${id}-search` || e.id === `${id}-profile`))
              assert(responseIndex >= 0, 'IDENTITY_PENDING_RESPONSE')
              stage = 'JOURNAL'
              await append({ kind: 'IDENTITY_PENDING', id, payload: { playerId: player.playerId, position: index + 1,
                responseHash: hashes[responseIndex], reason: 'IDENTITY_OR_DATA_INSUFFICIENT' } })
            }
          }
        }
        stage = 'JOURNAL'
        if (!find('IDENTITY_PENDING', id)) {
        await append({ kind: 'DONE', id, payload: { position: index + 1 } })
        }
        consecutive = 0
      }
      } catch (error) { if (error !== quarantineSignal) throw error }
      if ((index + 1) % 25 === 0 || index === players.length - 1) {
        const checkpointId = String(index + 1)
        if (!find('CHECKPOINT', checkpointId)) {
          requestId = null; stage = 'CHECKPOINT'; outcomeIndeterminate = false
          await deps.checkpoint(index + 1)
          stage = 'JOURNAL'
          await append({ kind: 'CHECKPOINT', id: checkpointId, payload: { batch: Math.ceil((index + 1) / 100), traversedPosition: index + 1,
            completed: events.filter(e => e.kind === 'DONE').length, quarantined: events.filter(e => e.kind === 'QUARANTINED').length,
            ...(deps.continuous ? { pendingQueue: pendingQueue() } : {}),
            ...(events.some(e => e.kind === 'WRITE_ISOLATED') ? { writeIsolated: events.filter(e => e.kind === 'WRITE_ISOLATED').length } : {}),
            ...(events.some(e => e.kind === 'REJECTED_RESPONSE') ? { rejected: events.filter(e => e.kind === 'REJECTED_RESPONSE').length } : {}) } })
        }
      }
    }
    const quarantined = events.filter(e => e.kind === 'QUARANTINED').length
    const processed = events.filter(e => e.kind === 'DONE').length
    const queue = pendingQueue()
    return { processed, requests: events.filter(e => e.kind === 'REQUEST').length, retries: 0,
      ...(deps.continuous ? { pendingQueue: queue, pendingByType: Object.fromEntries([...new Set(queue.map(p => p.type))].map(type => [type, queue.filter(p => p.type === type).length])) } : {}),
      ...(events.some(e => e.kind === 'WRITE_ISOLATED') ? { writeIsolated: events.filter(e => e.kind === 'WRITE_ISOLATED').length } : {}),
      ...(queue.length || quarantined || rejectedEvents.length || events.some(e => e.kind === 'REJECTED_RESPONSE' || e.kind === 'WRITE_ISOLATED') ? { status: 'PARTIAL' as const, quarantined, pending: players.length - processed, traversedPosition: players.length,
        ...(events.some(e => e.kind === 'REJECTED_RESPONSE') ? { rejected: events.filter(e => e.kind === 'REJECTED_RESPONSE').length } : {}) } : {}) }
  } catch (error) {
    failed = true; primary = error
    capture(error, { requestId, stage, outcomeIndeterminate })
    throw error
  } finally {
    try {
      await lock.close()
      if (!poisoned) await unlink(join(root, 'execution.lock'))
    } catch (error) {
      if (failed) captureCleanup(primary, error)
      else throw error
    }
  }
}
