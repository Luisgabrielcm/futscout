// Test-only adapter. No connection URL, environment lookup, pool or retry policy.
import { performance } from 'node:perf_hooks'
import type { Client } from 'pg'
import { PotentialTransactionFailure, PotentialWriteConflict } from '../../services/futscoutPotentialWriter'
import type { PotentialSqlTransaction, PotentialTransactionStore } from '../../services/futscoutPotentialWriter'

export type NativeTrace = { pid: number; isolation: string; elapsedMs: number; reason?: string; code?: string; rollback: boolean; commitConfirmed: boolean; deadlineExpired: boolean }
export type NativeTestHooks = {
  afterQuery?: (sql: string, tx: PotentialSqlTransaction) => Promise<void>
  beforeWork?: (tx: PotentialSqlTransaction) => Promise<void>
  afterWork?: (tx: PotentialSqlTransaction) => Promise<void>
  lockTimeoutMs?: number
  statementTimeoutMs?: number
  loseCommitAcknowledgment?: boolean
}
export function nativePotentialStore(connectVerified: () => Promise<Client>, traces: NativeTrace[], hooks: NativeTestHooks = {}): PotentialTransactionStore {
  return {
    async transaction(work, options) {
      if (options.isolation !== 'Serializable' || options.timeoutMs !== 30000) throw new Error('TEST_CONTRACT_CHANGED')
      const client = await connectVerified()
      const cancel = await connectVerified()
      const pid = Number((await client.query('SELECT pg_backend_pid() pid')).rows[0].pid)
      const trace: NativeTrace = { pid, isolation: '', elapsedMs: 0, rollback: false, commitConfirmed: false, deadlineExpired: false }
      traces.push(trace)
      const started = performance.now()
      let closed = false, commitSent = false, deadlineLimitedStatement = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let cancellation: Promise<unknown> = Promise.resolve()
      const timeout = () => new PotentialWriteConflict('TRANSACTION_TIMEOUT')
      const check = () => { if (closed || trace.deadlineExpired || performance.now() - started >= options.timeoutMs) throw timeout() }
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          trace.deadlineExpired = true
          cancellation = cancel.query('SELECT pg_cancel_backend($1)', [pid]).catch(() => undefined)
          reject(timeout())
        }, options.timeoutMs)
      })
      // A detached late callback can never enqueue another query after deadline/cleanup.
      const tx: PotentialSqlTransaction = {
        async query<Row extends Record<string, unknown>>(sql: string, values?: unknown[]) {
          check()
          const remaining = Math.max(1, Math.floor(options.timeoutMs - (performance.now() - started)))
          deadlineLimitedStatement = remaining <= (hooks.statementTimeoutMs ?? 30000)
          await client.query("SELECT set_config('statement_timeout',$1,true)", [String(Math.min(hooks.statementTimeoutMs ?? 30000, remaining))])
          check()
          const result = await client.query<Row>(sql, values)
          check()
          if (hooks.afterQuery) await hooks.afterQuery(sql, tx)
          check()
          return { rows: result.rows }
        },
      }
      try {
        const operation = (async () => {
          await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
          await client.query("SELECT set_config('lock_timeout',$1,true)", [String(hooks.lockTimeoutMs ?? 5000)])
          trace.isolation = (await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation
          check()
          if (hooks.beforeWork) await hooks.beforeWork(tx)
          const result = await work(tx)
          if (hooks.afterWork) await hooks.afterWork(tx)
          check()
          commitSent = true
          await client.query('COMMIT')
          trace.commitConfirmed = true
          return result
        })()
        const result = await Promise.race([operation, deadline])
        clearTimeout(timer)
        if (hooks.loseCommitAcknowledgment) throw new PotentialTransactionFailure('COMMIT_INDETERMINATE', 'TEST_LOST_ACK')
        return result
      } catch (error) {
        closed = true
        clearTimeout(timer)
        await cancellation
        const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : undefined
        trace.code = code
        if (code === '57014' && deadlineLimitedStatement) trace.deadlineExpired = true
        trace.reason = trace.deadlineExpired ? 'TRANSACTION_TIMEOUT' : error instanceof PotentialWriteConflict ? error.reason : ({ '40001': 'SERIALIZATION_CONFLICT', '23505': 'UNIQUE_CONFLICT', '40P01': 'DEADLOCK', '55P03': 'LOCK_TIMEOUT', '57014': 'STATEMENT_TIMEOUT' } as Record<string,string>)[code ?? ''] ?? 'DATABASE_ERROR'
        // A COMMIT sent without acknowledgment is not disproved by a later ROLLBACK.
        const knownCommitAbort = code === '40001' || code === '40P01'
        if (!trace.commitConfirmed && (!commitSent || knownCommitAbort)) {
          try { await client.query('ROLLBACK'); trace.rollback = true } catch { /* uncertain */ }
        }
        throw new PotentialTransactionFailure(trace.rollback ? 'ROLLED_BACK' : 'COMMIT_INDETERMINATE', trace.reason)
      } finally {
        closed = true
        clearTimeout(timer)
        trace.elapsedMs = performance.now() - started
        // Connection cleanup cannot downgrade a confirmed commit.
        await Promise.allSettled([client.end(), cancel.end()])
      }
    },
  }
}
