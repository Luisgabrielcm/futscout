import { performance } from 'node:perf_hooks'
import type { PrismaClient, Prisma } from '../../app/generated/prisma/client'
import { capture, attachTransactionTrace } from './diagnostics'

export type TransactionTrace = { schemaVersion: 1; requestId: string; startedAt: string;
  events: { phase: 'BEGIN' | 'EXECUTE' | 'COMMIT' | 'READ_BACK'; status: 'REQUESTED' | 'ENTERED' | 'RETURNED' | 'CONFIRMED' | 'FAILED'; elapsedMs: number }[];
  p2028Subtype: 'START_TIMEOUT' | 'EXPIRED' | 'CLOSED' | 'UNKNOWN' | null;
  readBackOutcome?: 'CONFIRMED' | 'ABSENT_AT_SNAPSHOT' | 'CONFLICT' | 'UNKNOWN';
  connection: { total: number; idle: number; waiting: number } | null }
export function newTransactionTrace(requestId: string, connection: TransactionTrace['connection'] = null) {
  const started = performance.now()
  const trace: TransactionTrace = { schemaVersion: 1, requestId, startedAt: new Date().toISOString(), events: [], p2028Subtype: null, connection }
  const mark = (phase: TransactionTrace['events'][number]['phase'], status: TransactionTrace['events'][number]['status']) => {
    trace.events.push({ phase, status, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000 })
  }
  return { trace, mark }
}
export function p2028Subtype(error: unknown): TransactionTrace['p2028Subtype'] {
  const e = error as { code?: unknown; message?: unknown; meta?: { error?: unknown } } | null
  if (e?.code !== 'P2028') return null
  // Some installed Prisma paths put the subtype only in message, not meta.error. Never persist either string.
  const reason = [e.meta?.error, e.message].filter((v): v is string => typeof v === 'string').join(' ')
  if (/Unable to start a transaction in the given time/i.test(reason)) return 'START_TIMEOUT'
  if (/expired transaction|transaction.*expired|timeout.*transaction/i.test(reason)) return 'EXPIRED'
  if (/transaction.*closed|transaction.*not found/i.test(reason)) return 'CLOSED'
  return 'UNKNOWN'
}
/** Observe callback boundaries without changing transaction options, SQL, errors or lifecycle hooks. */
export function traceClient(client: Pick<PrismaClient, '$transaction'>, observer: ReturnType<typeof newTransactionTrace>) {
  return new Proxy(client, { get(target, key) {
    if (key !== '$transaction') return Reflect.get(target, key)
    return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      observer.mark('BEGIN', 'REQUESTED')
      try {
        const result = await Reflect.apply(target.$transaction, target, [async (tx: Prisma.TransactionClient) => {
          observer.mark('BEGIN', 'CONFIRMED')
          observer.mark('EXECUTE', 'ENTERED') // BEGIN has succeeded, but its exact SQL duration is not observable here.
          const result = await callback(tx)
          observer.mark('EXECUTE', 'RETURNED'); observer.mark('COMMIT', 'REQUESTED')
          return result
        }, options])
        observer.mark('COMMIT', 'CONFIRMED')
        return result
      } catch (error) {
        observer.trace.p2028Subtype = p2028Subtype(error)
        const last = observer.trace.events.at(-1)!
        observer.mark(last.phase, 'FAILED')
        capture(error, { requestId: observer.trace.requestId, stage: 'WRITE_PLAYER', outcomeIndeterminate: true })
        attachTransactionTrace(error, observer.trace)
        throw error
      }
    }
  } })
}
