import type { IsolationLevel, SqlDriverAdapter, SqlDriverAdapterFactory, SqlQuery, Transaction } from "@prisma/driver-adapter-utils"

const control = (sql: string): SqlQuery => ({ sql, args: [], argTypes: [] })

// Prisma's HTTP execution path can defensively reaffirm an already read-only tx.
// Allow only this exact strengthening command, never arbitrary SET or root SQL.
function readOnlyAssertion(query: SqlQuery): boolean {
  return query.args.length === 0 && query.argTypes.length === 0 &&
    /^\s*SET\s+TRANSACTION\s+READ\s+ONLY\s*;?\s*$/i.test(query.sql)
}

// Reject mutation and transaction/session controls; PostgreSQL is a second guard.
// Conservative by design: no script/multi-statement API, even via raw Prisma methods.
function applicationQuery(query: SqlQuery): void {
  const sql = query.sql.trim().replace(/;$/, "")
  const head = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, "")
  if (sql.includes(";") || /^END\b/i.test(head) || /\b(?:BEGIN|START|COMMIT|ROLLBACK|ABORT|SAVEPOINT|RELEASE|SET|RESET|DISCARD|COPY|CALL|DO|PREPARE|EXECUTE|DEALLOCATE|SET_CONFIG)\b/i.test(sql))
    throw Error("PREVIEW_READ_ONLY_CONTROL_SQL_DENIED")
  if (/^\s*CLUSTER\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|MERGE|INTO|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|ANALYZE|VACUUM|REFRESH|REINDEX|LOCK)\b/i.test(sql))
    throw Error("PREVIEW_READ_ONLY_WRITE_SQL_DENIED")
  if (!/^(?:SELECT|WITH|SHOW|EXPLAIN)\b/i.test(head))
    throw Error("PREVIEW_READ_ONLY_STATEMENT_DENIED")
}

/** Delegate Prisma 7 encoding/error mapping unchanged; never expose the underlying pool. */
export function readOnlyPgAdapter(factory: SqlDriverAdapterFactory): SqlDriverAdapterFactory {
  return {
    provider: factory.provider, adapterName: factory.adapterName,
    async connect(): Promise<SqlDriverAdapter> {
      const base = await factory.connect()
      async function start(isolation?: IsolationLevel): Promise<Transaction> {
        const tx = await base.startTransaction(isolation)
        try { await tx.executeRaw(control("SET TRANSACTION READ ONLY")) }
        catch (error) {
          try { await tx.executeRaw(control("ROLLBACK")) } catch { /* Preserve setup failure. */ }
          try { await tx.rollback() } catch { /* Cleanup must not replace the original error. */ }
          throw error
        }
        let closed = false
        const check = (query: SqlQuery, allowReadOnlyAssertion = false) => {
          if (closed) throw Error("PREVIEW_READ_ONLY_TRANSACTION_CLOSED")
          if (allowReadOnlyAssertion && readOnlyAssertion(query)) return
          applicationQuery(query)
        }
        async function finish(commit: boolean) {
          if (closed) return
          closed = true
          try { await tx.executeRaw(control(commit ? "COMMIT" : "ROLLBACK")) }
          finally { await (commit ? tx.commit() : tx.rollback()) }
        }
        return {
          provider: tx.provider, adapterName: tx.adapterName,
          // We own SQL commit/rollback; Prisma calls only these lifecycle hooks.
          options: { usePhantomQuery: true },
          queryRaw: query => { check(query); return tx.queryRaw(query) },
          executeRaw: query => { check(query, true); return tx.executeRaw(query) },
          commit: () => finish(true), rollback: () => finish(false),
        }
      }
      async function query<T>(sql: SqlQuery, run: (tx: Transaction) => Promise<T>): Promise<T> {
        applicationQuery(sql)
        const tx = await start()
        try { const result = await run(tx); await tx.commit(); return result }
        catch (error) { try { await tx.rollback() } catch { /* Preserve the database error. */ } throw error }
      }
      return {
        provider: base.provider, adapterName: base.adapterName,
        queryRaw: sql => query(sql, tx => tx.queryRaw(sql)),
        executeRaw: sql => query(sql, tx => tx.executeRaw(sql)),
        startTransaction: start,
        executeScript: async () => { throw Error("PREVIEW_READ_ONLY_SCRIPTS_DENIED") },
        getConnectionInfo: base.getConnectionInfo?.bind(base),
        dispose: () => base.dispose(),
      }
    },
  }
}
