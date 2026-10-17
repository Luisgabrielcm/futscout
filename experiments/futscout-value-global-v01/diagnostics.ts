import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { TransactionTrace } from './transaction-trace'

export type Stage = 'EXECUTOR' | 'PREFLIGHT' | 'EXISTING' | 'LIVE_SEARCH' | 'LIVE_PROFILE' | 'MATCHING' | 'WRITE_PLAYER' | 'READ_BACK' | 'CHECKPOINT' | 'JOURNAL'
type Context = { requestId: string | null; stage: Stage; outcomeIndeterminate: boolean }
type Technical = { errorClass: string; code: string; category: string; assertion?: string }
export type Diagnostic = Context & Technical & { schemaVersion: 1; timestamp: string; causes: Technical[]; cleanup?: Technical[]; transaction?: TransactionTrace }
export function attachTransactionTrace(error: unknown, trace: TransactionTrace) {
  if (error && typeof error === 'object') {
    const prior = captured.get(error)
    if (prior) captured.set(error, { ...prior, transaction: structuredClone(trace) })
  }
}
const captured = new WeakMap<object, Diagnostic>()
const classes = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AssertionError', 'TimeoutError', 'AbortError', 'AggregateError', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError', 'PrismaClientUnknownRequestError'])
const validCode = (x: unknown): x is string => typeof x === 'string' && /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET|ABORT_ERR|HTTP_[1-5][0-9]{2}|P1001|P1002|P2028|P2034|40001|40P01|08001|08003|08006|28P01|53300|57P01|ERR_ASSERTION)$/.test(x)
function technical(error: unknown): Technical {
  const e = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const errorClass = typeof e.name === 'string' && classes.has(e.name) ? e.name : 'Error'
  // Never copy arbitrary message/stack: classify exact allowlisted tokens only.
  const code = validCode(e.code) ? e.code : errorClass === 'TimeoutError' ? 'ETIMEDOUT'
    : errorClass === 'AbortError' ? 'ABORT_ERR' : validCode(e.message) ? e.message : 'UNKNOWN'
  const category = /^(P\d|08|28P01|40001|40P01|53300|57P01)/.test(code) ? 'POSTGRESQL'
    : code === 'HTTP_429' ? 'RATE_LIMIT' : /^HTTP_40[13]$/.test(code) ? 'AUTHENTICATION'
      : code.startsWith('HTTP_') ? 'HTTP' : /TIMEOUT|ETIMEDOUT|ABORT_ERR/.test(code) ? 'TIMEOUT'
        : /ENOTFOUND|EAI_AGAIN/.test(code) ? 'DNS' : /ECONN|UND_ERR_SOCKET/.test(code) ? 'TRANSPORT' : 'UNKNOWN'
  const assertions = ['INVALID_ENVELOPE', 'BALANCE', 'UNSAFE_PROVIDER_FIELD', 'NAME', 'OBSERVED_AT']
  const assertion = code === 'ERR_ASSERTION' && typeof e.message === 'string' && assertions.includes(e.message) ? e.message : undefined
  return { errorClass, code, category, ...(assertion ? { assertion } : {}) }
}
export function diagnose(error: unknown, context: Context): Diagnostic {
  if (context.requestId !== null && !/^lfglobal-[a-f0-9]{16}-[a-zA-Z0-9_-]{1,80}(?:-(?:search|profile))?$/.test(context.requestId)) throw Error('UNSAFE_DIAGNOSTIC_ID')
  const prior = error && typeof error === 'object' ? captured.get(error) : undefined
  if (prior) return { ...prior, ...context }
  const causes: Technical[] = [], seen = new Set<unknown>()
  function visit(e: unknown, depth: number) {
    if (!e || typeof e !== 'object' || seen.has(e) || depth > 3 || causes.length >= 8) return
    seen.add(e); causes.push(technical(e))
    const node = e as { cause?: unknown; errors?: unknown[] }
    visit(node.cause, depth + 1)
    if (Array.isArray(node.errors)) for (const child of node.errors) visit(child, depth + 1)
  }
  visit(error, 0)
  const top = technical(error), identified = causes.find(x => x.code !== 'UNKNOWN') ?? top
  return { schemaVersion: 1, ...context, timestamp: new Date().toISOString(), ...top,
    code: identified.code, category: identified.category, causes: causes.slice(1) }
}
export function capture(error: unknown, context: Context) {
  const diagnostic = diagnose(error, context)
  if (error && typeof error === 'object') captured.set(error, diagnostic)
  return diagnostic
}
export function capturedDiagnostic(error: unknown) {
  return error && typeof error === 'object' ? captured.get(error) : undefined
}
export function captureCleanup(primary: unknown, cleanup: unknown) {
  const diagnostic = capturedDiagnostic(primary) ?? diagnose(primary, { requestId: null, stage: 'EXECUTOR', outcomeIndeterminate: true })
  if (primary && typeof primary === 'object') captured.set(primary, { ...diagnostic,
    cleanup: [...(diagnostic.cleanup ?? []), technical(cleanup)].slice(0, 4) })
}
export function safeTransportError(error: unknown, stage: Stage) {
  const diagnostic = diagnose(error, { requestId: null, stage, outcomeIndeterminate: true })
  const safe = Object.assign(new Error('LIVE_FOOTBALL_REQUEST_FAILED'), { code: diagnostic.code })
  captured.set(safe, diagnostic)
  return safe
}
/** Separate immutable sidecar: never edits the operational journal or settles an UNKNOWN. */
export async function persistDiagnostic(root: string, diagnostic: Diagnostic) {
  return persistSafeRecord(root, 'diagnostics', diagnostic)
}
export async function persistTransactionTrace(root: string, trace: TransactionTrace) {
  return persistSafeRecord(root, 'transaction-traces', trace)
}
async function persistSafeRecord(root: string, folder: string, diagnostic: Diagnostic | TransactionTrace) {
  const directory = join(root, folder)
  await mkdir(directory, { recursive: true })
  const file = join(directory, `${Date.now()}-${randomUUID()}.json`)
  const record = diagnostic
  const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex')
  const handle = await open(`${file}.tmp`, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify({ record, hash })); await handle.sync() } finally { await handle.close() }
  await rename(`${file}.tmp`, file)
  return hash
}
