// Opt-in disposable PostgreSQL 14 test. Never loads env/credentials or accepts an external URL.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"
import { Client } from "pg"

const bin = "C:/Program Files/PostgreSQL/14/bin"
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), "fs-ea-history-pg14-"))
const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"])
  if (process.env[key]) env[key] = process.env[key]
async function command(name: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(path.join(bin, name + ".exe"), args, { env, windowsHide: true, stdio: "ignore" })
    child.once("error", reject)
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${name}:${code}`)))
  })
}
async function main() {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  let started = false
  const db = new Client({ host: "127.0.0.1", port, user: "ea_history_test", database: "postgres", ssl: false })
  try {
    await command("initdb", ["-D", cluster, "-U", "ea_history_test", "-A", "trust", "--no-locale", "-E", "UTF8"])
    await command("pg_ctl", ["-D", cluster, "-l", path.join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
    started = true
    await db.connect()
    const proof = (await db.query("SELECT current_setting('data_directory') dir, inet_server_port() port, current_user usr")).rows[0]
    assert.equal(path.resolve(proof.dir).toLowerCase(), path.resolve(cluster).toLowerCase())
    assert.equal(proof.port, port)
    assert.equal(proof.usr, "ea_history_test")
    await db.query('CREATE TABLE "Player" (id TEXT PRIMARY KEY); CREATE TABLE "EaPlayerCatalogObservation" (id TEXT PRIMARY KEY, "playerId" TEXT, "externalId" TEXT, "observationId" TEXT)')
    await db.query(fs.readFileSync("prisma/migrations/20261004000000_ea_rating_snapshots_v1/migration.sql", "utf8"))
    await db.query(`INSERT INTO "Player" VALUES ('p1'); INSERT INTO "EaPlayerRatingSnapshot"
      (id,"playerId","externalId","sourceContext","primaryPosition",overall,attributes,"contentHash")
      VALUES ('s1','p1','ea1','FC27','MC',85,'{"outfield":{"pace":80}}',repeat('a',64))`)
    await db.query(`INSERT INTO "EaPlayerCatalogObservation" VALUES ('o1','p1','ea1','source1','s1'),('o2','p1','ea1','source2','s1')`)
    assert.equal((await db.query('SELECT count(*)::int n FROM "EaPlayerRatingSnapshot"')).rows[0].n, 1)
    for (const sql of [
      `UPDATE "EaPlayerRatingSnapshot" SET overall=86`, `DELETE FROM "EaPlayerRatingSnapshot"`,
      `DELETE FROM "Player"`,
      `UPDATE "EaPlayerCatalogObservation" SET "externalId"='other' WHERE id='o1'`,
    ]) await assert.rejects(db.query(sql), error => ["23514", "23503"].includes((error as { code: string }).code))
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await db.query(`INSERT INTO "EaPlayerRatingSnapshot" SELECT 's2',"playerId","externalId","sourceContext",
      "dateOfBirth","primaryPosition",86,attributes,repeat('b',64),"snapshotVersion","createdAt" FROM "EaPlayerRatingSnapshot" WHERE id='s1'`)
    await assert.rejects(db.query(`INSERT INTO "EaPlayerCatalogObservation" VALUES ('bad','other','ea1','source3','s2')`))
    await db.query("ROLLBACK")
    assert.equal((await db.query('SELECT count(*)::int n FROM "EaPlayerRatingSnapshot"')).rows[0].n, 1)
    console.log("EA_HISTORY_NATIVE_PASS: reuse, immutability, identity link, retention, rollback")
  } finally {
    await db.end().catch(() => {})
    if (started) await command("pg_ctl", ["-D", cluster, "-m", "immediate", "-w", "stop"])
    const resolved = path.resolve(cluster)
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
    assert.ok(path.basename(resolved).startsWith("fs-ea-history-pg14-"))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "EA_HISTORY_NATIVE_FAILED"); process.exitCode = 1 })
