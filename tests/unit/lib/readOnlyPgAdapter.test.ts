import test from "node:test"
import assert from "node:assert/strict"
import type { SqlDriverAdapterFactory, SqlQuery } from "@prisma/driver-adapter-utils"
import { readOnlyPgAdapter } from "../../../lib/readOnlyPgAdapter"

const sql = (sql: string): SqlQuery => ({ sql, args: [], argTypes: [] })
function fixture(failSetup = false, failRollback = false) {
  const events: string[] = []
  let count = 0
  const factory: SqlDriverAdapterFactory = { provider: "postgres", adapterName: "test",
    connect: async () => ({ provider: "postgres", adapterName: "test", dispose: async () => {},
      queryRaw: async () => { throw Error("UNSCOPED_QUERY") }, executeRaw: async () => { throw Error("UNSCOPED_EXECUTE") }, executeScript: async () => { throw Error("UNSCOPED_SCRIPT") },
      startTransaction: async () => {
        const id = ++count
        events.push(`${id}:BEGIN`)
        return { provider: "postgres", adapterName: "test", options: { usePhantomQuery: false },
          queryRaw: async query => { events.push(`${id}:${query.sql}`); return { columnNames: [], columnTypes: [], rows: [] } },
          executeRaw: async query => { events.push(`${id}:${query.sql}`); if (failSetup && query.sql === "SET TRANSACTION READ ONLY") throw Error("SETUP_FAILED"); if (failRollback && query.sql === "ROLLBACK") throw Error("ROLLBACK_FAILED"); return 0 },
          commit: async () => { events.push(`${id}:release-commit`) }, rollback: async () => { events.push(`${id}:release-rollback`) } }
      } }) }
  return { events, factory }
}

test("every root query owns a distinct transaction; setup and release are ordered exactly once", async () => {
  const f = fixture(), db = await readOnlyPgAdapter(f.factory).connect()
  await Promise.all([db.queryRaw(sql("SELECT 1")), db.executeRaw(sql("SELECT 2"))])
  for (const id of [1, 2]) {
    const trace = f.events.filter(event => event.startsWith(`${id}:`)).map(event => event.slice(2))
    assert.deepEqual(trace, ["BEGIN", "SET TRANSACTION READ ONLY", `SELECT ${id}`, "COMMIT", "release-commit"])
  }
})

test("app cannot end/reconfigure transactions, run scripts, escape with batches, or reuse closed handles", async () => {
  const f = fixture(), db = await readOnlyPgAdapter(f.factory).connect()
  for (const text of ["COMMIT", "ROLLBACK", "/* control */ END", "-- control\n END WORK", "SET TRANSACTION READ WRITE", "SELECT set_config('transaction_read_only','off',true)", "SELECT 1; COMMIT; DELETE FROM x"])
    await assert.rejects(async () => db.queryRaw(sql(text)), /CONTROL_SQL_DENIED/)
  assert.equal(f.events.length, 0)
  for (const text of ["INSERT INTO x VALUES(1)", "DELETE FROM x", "WITH x AS (DELETE FROM y RETURNING *) SELECT * FROM x", "CREATE TEMP TABLE x(id int)", "SELECT 1 INTO TEMP x"])
    await assert.rejects(async () => db.queryRaw(sql(text)), /WRITE_SQL_DENIED/)
  assert.equal(f.events.length, 0)
  await assert.rejects(db.executeScript("SELECT 1"), /SCRIPTS_DENIED/)
  const tx = await db.startTransaction()
  assert.equal(tx.options.usePhantomQuery, true)
  await assert.rejects(async () => tx.executeRaw(sql("COMMIT")), /CONTROL_SQL_DENIED/)
  await tx.rollback(); await tx.rollback()
  await assert.rejects(async () => tx.queryRaw(sql("SELECT 1")), /TRANSACTION_CLOSED/)
  assert.equal(f.events.filter(event => event.includes("release-")).length, 1)
})

test("failed read-only setup rolls back and releases without exposing a transaction", async () => {
  const f = fixture(true), db = await readOnlyPgAdapter(f.factory).connect()
  await assert.rejects(db.queryRaw(sql("SELECT 1")), /SETUP_FAILED/)
  assert.deepEqual(f.events, ["1:BEGIN", "1:SET TRANSACTION READ ONLY", "1:ROLLBACK", "1:release-rollback"])
})

test("cleanup failure does not hide the original setup error", async () => {
  const f = fixture(true, true), db = await readOnlyPgAdapter(f.factory).connect()
  await assert.rejects(db.queryRaw(sql("SELECT 1")), /SETUP_FAILED/)
  assert.equal(f.events.filter(event => event.includes("release-")).length, 1)
})
