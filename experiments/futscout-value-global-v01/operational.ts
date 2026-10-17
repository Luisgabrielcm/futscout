import { loadValueBindings, validateValueBindings, type ValueBindings } from './local-bindings'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../app/generated/prisma/client'
import { bindings, existingWriter, liveFootballTransport } from './integration'
import { paidOfficialBalanceProbe } from './balance'
import { postgresGate, productionReadClient } from './postgres-gate'
import { sha } from './runner'
import type { ExecutorResources } from './executor'
import { persistTransactionTrace, capture, attachTransactionTrace } from './diagnostics'
import { newTransactionTrace } from './transaction-trace'
import { generationConnections } from './generation-connections'
import { economicFingerprint } from '../../lib/economicData/value'
import type { EconomicWrite } from '../../services/playerEconomicPersistence'

type StagingConnection = { runtimeUrl: string; writerUrl: string; administrationUrl: string; generation: string; token: number }

export function loadFrozen(root = 'audit/output/value-global-preflight') {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
  const manifest = read(`${root}/manifest.json`)
  assert.equal(sha(readFileSync(`${root}/manifest.json`)), readFileSync(`${root}/manifest.sha256`, 'utf8').trim(), 'MANIFEST_HASH')
  for (const [file, hash] of Object.entries(manifest.hashes)) assert.equal(sha(readFileSync(`${root}/${file}`)), hash, 'FROZEN_ARTIFACT_CHANGED')
  for (const source of [...manifest.ledgerSources, ...manifest.supplementalProof]) assert.equal(sha(readFileSync(source.file)), source.sha256, 'HISTORY_CHANGED')
  return { bytes: readFileSync(`${root}/selection.json`), baseline: read(`${root}/baseline.json`) as Record<string, unknown>[],
    excluded: new Set<string>(read(`${root}/selection.json`).excludedIds),
    database: read('audit/output/economic-data-m1-20261006/after-attempt-4-reconciliation-1.json').identity.database as string }
}
function currentHistory(base: Set<string>) {
  const ids = new Set(base)
  function walk(folder: string) {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const file = `${folder}/${e.name}`
      if (e.isDirectory()) walk(file)
      else if (/\.json$/.test(e.name) && /(receipt|result|response|checkpoint|intent)/i.test(e.name)) {
        const scan = (x: unknown) => {
          if (!x || typeof x !== 'object') return
          const o = x as Record<string, unknown>
          if (typeof o.playerId === 'string') ids.add(o.playerId)
          for (const child of Object.values(o)) if (typeof child === 'object') scan(child)
        }
        scan(JSON.parse(readFileSync(file, 'utf8')))
      }
    }
  }
  for (const e of readdirSync('audit/output', { withFileTypes: true })) {
    if (e.isDirectory() && (e.name.startsWith('live-football') || /value-(recovery|mls-batch|swiss-batch)/.test(e.name))) walk(`audit/output/${e.name}`)
  }
  return ids
}
export function operationalResources(connectionString: string | null, key: string, frozen: ReturnType<typeof loadFrozen>,
  staging?: StagingConnection): ExecutorResources {
  assert(staging || connectionString, 'DATABASE_CONNECTION_REQUIRED')
  const pool = staging ? null : new Pool({ connectionString: connectionString!, max: 1, connectionTimeoutMillis: 10000, query_timeout: 20000 })
  const prisma = pool ? new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) }) : null
  const generation = staging ? generationConnections({ ...staging, grants: [{ provider: 'LIVE_FOOTBALL', field: 'MARKET_VALUE',
    context: 'REAL_WORLD', evidenceRef: 'value-global-v1' }] }) : null
  const writer = generation ? generation.write : existingWriter(prisma!, async () => { const connection = await pool!.connect(); connection.release() }, {
    connection: () => ({ total: pool!.totalCount, idle: pool!.idleCount, waiting: pool!.waitingCount }),
    record: async trace => { await persistTransactionTrace(operationalRoot, trace) },
  })
  const transport = liveFootballTransport(key), probe = paidOfficialBalanceProbe(key)
  let history = new Set(frozen.excluded)
  return {
    ...(generation ? { prepare: async () => { await generation.verify() } } : {}),
    dependencies: (balance, limit) => {
      const gate = postgresGate({ client: () => productionReadClient(staging?.runtimeUrl ?? connectionString!),
        database: frozen.database, baseline: frozen.baseline,
        consultedIds: async () => history, balance, stagingGeneration: staging?.generation })
      const original = gate.preflight
      const readBack = gate.readBack
      gate.readBack = async plan => {
        const observer = newTransactionTrace(plan.requestId)
        observer.mark('READ_BACK', 'REQUESTED')
        try {
          const outcome = await readBack(plan)
          observer.trace.readBackOutcome = outcome === 'NOT_STARTED' ? 'ABSENT_AT_SNAPSHOT' : outcome
          observer.mark('READ_BACK', outcome === 'CONFIRMED' ? 'CONFIRMED' : 'RETURNED')
          await persistTransactionTrace(operationalRoot, observer.trace)
          return outcome
        } catch (error) {
          observer.mark('READ_BACK', 'FAILED')
          capture(error, { requestId: plan.requestId, stage: 'READ_BACK', outcomeIndeterminate: true })
          attachTransactionTrace(error, observer.trace)
          throw error
        }
      }
      gate.preflight = async (players, progress) => {
        history = currentHistory(frozen.excluded)
        await original(players, progress)
      }
      return bindings(transport, writer, gate, limit, staging?.generation)
    },
    probeBalance: async () => {
      const result = await probe()
      assert(result.success && Number.isSafeInteger(result.credits_remaining) && result.credits_remaining >= 0, 'BALANCE_UNKNOWN')
      return { credits: result.credits_remaining, observedAt: new Date().toISOString(), official: true }
    },
    close: async () => { if (generation) await generation.close(); else { try { await prisma!.$disconnect() } finally { await pool!.end() } } },
  }
}
export const operationalRoot = resolve('audit/output/value-global-execution')

/** Hash-checked local receipts; never treats an incomplete file as a confirmed write. */
export function offlineEvidenceStore(receiptRoot: string, selectionHash: string, parentHash: string,
  originalPosition: ReadonlyMap<string, number>) {
  const receiptDir = join(receiptRoot, 'receipts')
  const receiptPath = (requestId: string) => {
    assert(/^lfglobal-[a-f0-9]{16}-[a-zA-Z0-9_-]{1,80}$/.test(requestId), 'OFFLINE_REQUEST_ID')
    return join(receiptDir, `${requestId}.json`)
  }
  const readBack = async (plan: EconomicWrite): Promise<'CONFIRMED' | 'NOT_STARTED' | 'UNKNOWN' | 'CONFLICT'> => {
    let receipt: Record<string, unknown>
    try { receipt = JSON.parse(await readFile(receiptPath(plan.requestId), 'utf8')) }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'NOT_STARTED' : 'UNKNOWN' }
    const { hash, ...body } = receipt
    if (hash !== sha(JSON.stringify(body))) return 'CONFLICT'
    const storedPlan = body.plan as EconomicWrite | undefined
    if (!storedPlan || sha(JSON.stringify(storedPlan)) !== body.inputHash ||
      economicFingerprint(storedPlan.state) !== body.contentHash) return 'CONFLICT'
    return body.mode === 'OFFLINE_COLLECTION' && body.selectionHash === selectionHash && body.parentHash === parentHash &&
      body.requestId === plan.requestId && body.playerId === plan.state.playerId &&
      body.originalPosition === originalPosition.get(plan.state.playerId) &&
      body.inputHash === sha(JSON.stringify(plan)) && body.contentHash === economicFingerprint(plan.state) &&
      body.observedAt === plan.observedAt && body.selectCurrent === false ? 'CONFIRMED' : 'CONFLICT'
  }
  const write = async (plan: EconomicWrite) => {
    assert.equal(plan.selectCurrent, false, 'OFFLINE_MUST_NOT_PUBLISH')
    assert.equal(plan.state.confidence, 'HIGH', 'OFFLINE_IDENTITY')
    assert(['VALUE', 'NULL'].includes(plan.state.presence), 'OFFLINE_PRESENCE')
    if (plan.state.presence === 'VALUE') assert.equal(plan.state.currency, 'EUR', 'OFFLINE_CURRENCY')
    const position = originalPosition.get(plan.state.playerId)
    assert(position && position > 0, 'OFFLINE_ORIGINAL_POSITION')
    assert.equal(await readBack(plan), 'NOT_STARTED', 'OFFLINE_RECEIPT_ALREADY_EXISTS')
    const body = { mode: 'OFFLINE_COLLECTION', selectionHash, parentHash, requestId: plan.requestId,
      playerId: plan.state.playerId, originalPosition: position, observedAt: plan.observedAt,
      selectCurrent: false, inputHash: sha(JSON.stringify(plan)), contentHash: economicFingerprint(plan.state),
      plan, recordedAt: new Date().toISOString() }
    const file = receiptPath(plan.requestId), temp = `${file}.tmp`
    const handle = await open(temp, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify({ ...body, hash: sha(JSON.stringify(body)) })); await handle.sync() }
    finally { await handle.close() }
    await rename(temp, file)
  }
  return { prepare: async () => { await mkdir(receiptDir, { recursive: true }) }, write, readBack }
}

/** Local evidence only. No PostgreSQL pool/client is created by this binding. */
export function offlineResources(key: string, receiptRoot: string, selectionHash: string, parentHash: string,
  originalPosition: ReadonlyMap<string, number>, valueBindings: ValueBindings = loadValueBindings()): ExecutorResources {
  valueBindings = validateValueBindings(valueBindings)
  const approvedSelectionHash = valueBindings.parentSelectionHash
  assert.equal(parentHash, approvedSelectionHash, 'OFFLINE_PARENT_HASH')
  const transport = liveFootballTransport(key), probe = paidOfficialBalanceProbe(key)
  let latestBalance: { credits: number; observedAt: string; official: boolean } | undefined
  const store = offlineEvidenceStore(receiptRoot, selectionHash, parentHash, originalPosition)
  return {
    prepare: store.prepare,
    dependencies: (balance, limit) => {
      const gate = {
        preflight: async () => {},
        existing: async () => false,
        readBack: store.readBack,
        checkpoint: async () => {},
        balance,
        concurrent: async () => false,
      }
      return { ...bindings(transport, store.write, gate, limit), continuous: true, valueBindings }
    },
    probeBalance: async () => {
      const result = await probe()
      assert(result.success && Number.isSafeInteger(result.credits_remaining) && result.credits_remaining >= 0, 'BALANCE_UNKNOWN')
      latestBalance = { credits: result.credits_remaining, observedAt: new Date().toISOString(), official: true }
      return latestBalance
    },
    close: async () => {},
  }
}
