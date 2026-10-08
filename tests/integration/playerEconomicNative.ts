// Opt-in, fresh loopback PostgreSQL 14 cluster. No dotenv or externally supplied URLs.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"
import { Client } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../app/generated/prisma/client"
import { adaptLiveFootballMarketValue as adapt } from "../../lib/economicData/liveFootball"
import { createPlayerEconomicWriter, type EconomicWrite } from "../../services/playerEconomicPersistence"

const bin = "C:/Program Files/PostgreSQL/14/bin"
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), "fs-economic-pg14-"))
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
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  let started = false, prisma: PrismaClient | undefined
  const config = { host: "127.0.0.1", port, user: "economic_test", database: "postgres", ssl: false as const }
  const db = new Client(config)
  try {
    await command("initdb", ["-D", cluster, "-U", "economic_test", "-A", "trust", "--no-locale", "-E", "UTF8"])
    await command("pg_ctl", ["-D", cluster, "-l", path.join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
    started = true
    await db.connect()
    const proof = (await db.query("SELECT current_setting('data_directory') dir, inet_server_port() port, current_user usr, current_setting('server_version_num') version")).rows[0]
    assert.equal(path.resolve(proof.dir).toLowerCase(), path.resolve(cluster).toLowerCase())
    assert.equal(proof.port, port); assert.equal(proof.usr, "economic_test")
    assert.ok(Number(proof.version) >= 140000 && Number(proof.version) < 150000)
    await db.query('CREATE TABLE "Player" (id TEXT PRIMARY KEY, "marketValue" BIGINT, "marketCurrency" TEXT)')
    await db.query(fs.readFileSync("prisma/migrations/20261006000000_player_economic_data_v1/migration.sql", "utf8"))
    await db.query(`INSERT INTO "Player" VALUES ('p1',777,'USD'),('p2',888,'EUR')`)
    prisma = new PrismaClient({ adapter: new PrismaPg(config) })
    const write = createPlayerEconomicWriter(prisma, [{ provider: "LIVE_FOOTBALL", context: "REAL_WORLD", field: "MARKET_VALUE", evidenceRef: "native-fixture-only" }])
    let request = 0
    function plan(marketValue: unknown, expectedRevision: number | null): EconomicWrite {
      return { state: adapt({ playerId: "p1", providerPlayerId: "lf1", field: "MARKET_VALUE", marketValue, currency: "EUR", confidence: "HIGH", matchState: "MATCHED" }).state,
        requestId: `r${++request}`, observedAt: "2026-10-06T00:00:00Z", selectCurrent: true, expectedRevision,
        selectionReason: "PRIMARY", policyVersion: "fixture-v1" }
    }
    const first = await write(plan("220.000.000€", null))
    assert.equal(first.current?.revision, 1)
    const repeat = await write(plan("220.000.000€", 1))
    assert.equal(first.stateId, repeat.stateId); assert.notEqual(first.observationId, repeat.observationId)
    assert.equal(repeat.current?.revision, 2)
    const changed = await write(plan("200.000.000€", 2))
    assert.notEqual(first.stateId, changed.stateId); assert.equal(changed.current?.revision, 3)
    // Stale CAS rolls back the new state AND observation; zero retries.
    await assert.rejects(write(plan("199.000.000€", 1)), /CAS_CONFLICT/)
    assert.equal(await prisma.playerEconomicState.count(), 2)
    assert.equal(await prisma.playerEconomicObservation.count(), 3)
    assert.equal((await prisma.playerEconomicCurrent.findFirstOrThrow()).revision, 3)
    for (const [value, revision] of [[0, 3], [null, 4], [undefined, 5]] as const) await write(plan(value, revision))
    assert.equal(await prisma.playerEconomicState.count(), 5)
    assert.equal(await prisma.playerEconomicObservation.count(), 6)
    const invalid = plan(123, 6)
    invalid.state.confidence = "LOW"
    await assert.rejects(write(invalid), /IDENTITY_REJECTED/)
    await assert.rejects(createPlayerEconomicWriter(prisma)(plan(123, 6)), /PROVIDER_UNAUTHORIZED/)
    assert.equal(await prisma.playerEconomicState.count(), 5)
    const repeatedRequest = plan(0, 6)
    repeatedRequest.requestId = "r1"
    await assert.rejects(write(repeatedRequest))
    assert.equal(await prisma.playerEconomicObservation.count(), 6)
    for (const sql of [
      `UPDATE "PlayerEconomicState" SET amount=1`, `DELETE FROM "PlayerEconomicState"`,
      `UPDATE "PlayerEconomicObservation" SET "observedAt"=now()`, `DELETE FROM "PlayerEconomicObservation"`,
      `TRUNCATE "PlayerEconomicObservation" CASCADE`, `DELETE FROM "Player" WHERE id='p1'`,
      `UPDATE "PlayerEconomicCurrent" SET revision=revision+2`,
      `INSERT INTO "PlayerEconomicCurrent" SELECT 'p2',field,"observationId",1,"selectedAt","selectionReason","policyVersion" FROM "PlayerEconomicCurrent"`,
      `INSERT INTO "PlayerEconomicCurrent" SELECT "playerId",'WAGE_WEEKLY',"observationId",1,"selectedAt","selectionReason","policyVersion" FROM "PlayerEconomicCurrent"`,
    ]) await assert.rejects(db.query(sql))
    assert.equal(await prisma.playerEconomicState.count(), 5)
    assert.equal(await prisma.playerEconomicObservation.count(), 6)
    assert.deepEqual((await db.query('SELECT "marketValue"::text v,"marketCurrency" c FROM "Player" WHERE id=$1', ['p1'])).rows[0], { v: "777", c: "USD" })
    console.log("ECONOMIC_NATIVE_PASS: actual Prisma writer, dedup, observations, change, CAS rollback, zero/null/absent, identity, immutability, retention, legacy preserved")
  } finally {
    await prisma?.$disconnect()
    await db.end()
    if (started) await command("pg_ctl", ["-D", cluster, "-m", "immediate", "-w", "stop"])
    const resolved = path.resolve(cluster)
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
    assert.ok(path.basename(resolved).startsWith("fs-economic-pg14-"))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "ECONOMIC_NATIVE_FAILED"); process.exitCode = 1 })
