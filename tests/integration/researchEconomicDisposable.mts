// Disposable PostgreSQL 17 only. No project database environment is read.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { Client, Pool } from "pg"
import { createResearchEconomicWriter, writeResearchEconomicBatch } from "../../services/researchEconomicWriter"
import { publicEconomicOverlay, publicContractUntil } from "../../lib/publicEconomicOverlay"
import { parseResearchPayload } from "../../lib/researchEconomic"

assert(process.argv.includes("--disposable-authorized"))
const root = path.resolve("audit/output")
const cluster = fs.mkdtempSync(path.join(root, "research-economic-disposable-"))
assert(cluster.startsWith(root + path.sep))
const bin = path.resolve(process.env.FUTSCOUT_PG17_BIN || "audit/output/postgres17-portable-01/distribution/pgsql/bin")
const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"]) if (process.env[key]) env[key] = process.env[key]
const command = (name: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const proc = spawn(path.join(bin, name + ".exe"), args, { env, windowsHide: true, stdio: "ignore" })
  proc.once("error", reject); proc.once("exit", code => code === 0 ? resolve() : reject(Error(name + ":" + code)))
})
let started = false, owner: Client | undefined, pool: Pool | undefined
try {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  await command("initdb", ["-D", cluster, "-U", "test_owner", "-A", "trust", "--no-locale", "-E", "UTF8"])
  await command("pg_ctl", ["-D", cluster, "-l", path.join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
  started = true
  const config = { host: "127.0.0.1", port, user: "test_owner", database: "postgres", ssl: false as const }
  owner = new Client(config); await owner.connect()
  assert.match((await owner.query("SHOW server_version")).rows[0].server_version, /^17\./)
  await owner.query('CREATE TABLE "Club" (id text PRIMARY KEY)')
  await owner.query('CREATE TABLE "Player" (id text PRIMARY KEY,"externalId" text UNIQUE,"clubId" text REFERENCES "Club"(id))')
  await owner.query('INSERT INTO "Club" VALUES ($1)', ["club-1"])
  await owner.query('INSERT INTO "Player" VALUES ($1,$2,$3)', ["player-1", "123", "club-1"])
  await owner.query(fs.readFileSync("prisma/migrations/20261106000000_manual_economic_admin/migration.sql", "utf8"))
  await owner.query(fs.readFileSync("prisma/migrations/20261108000000_researched_economic_publication/migration.sql", "utf8"))
  pool = new Pool({ ...config, max: 3 })
  const write = createResearchEconomicWriter(pool)
  const base = { playerId: "player-1", eaId: "123", clubId: "club-1", sourceUrl: "https://example.test/contract",
    sourcePublishedOn: "2026-11-01", capturedOn: "2026-11-08", classification: "OFFICIAL" as const }
  const evidence = { ...base, field: "CONTRACT" as const, action: "RECORD" as const,
    requestId: randomUUID(), payload: { until: "2029", precision: "YEAR" as const } }
  const recorded = await write(evidence)
  assert.equal(recorded.publishedNow, false)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic"')).rows[0].count, 0)
  const publication = { ...evidence, action: "PUBLISH" as const, requestId: randomUUID(), expectedHeadRevision: 0 }
  const published = await write(publication)
  assert.equal(published.publishedNow, true)
  assert.equal((await write(publication)).replay, true)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic"')).rows[0].count, 1)
  assert.equal(publicContractUntil(publicEconomicOverlay(undefined, { contract: { until: "2029", precision: "YEAR" } }), "pt"), "2029")
  await assert.rejects(write({ ...publication, requestId: randomUUID(), expectedHeadRevision: 0 }), /RESEARCH_HEAD_CONFLICT/)
  await assert.rejects(write({ ...publication, requestId: randomUUID(), clubId: "wrong", expectedHeadRevision: 1 }), /RESEARCH_PLAYER_OR_CLUB_MISMATCH/)
  await assert.rejects(write({ ...publication, field: "SALARY", requestId: randomUUID(),
    payload: { weeklyEur: "100", taxType: "GROSS", composition: "BASE" } }), /RESEARCH_SALARY_NOT_GROSS_TOTAL/)
  const salaryReference = { ...base, field: "SALARY" as const, action: "RECORD" as const, requestId: randomUUID(),
    payload: { weeklyAmount: "100", currency: "EUR" as const, taxType: "GROSS" as const, composition: "BASE" as const } }
  assert.equal((await writeResearchEconomicBatch(pool, [salaryReference])).length, 1)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic" WHERE field=$1', ["SALARY"])).rows[0].count, 0)
  const rollback = { ...publication, action: "ROLLBACK" as const, payload: null,
    rollbackToId: null, requestId: randomUUID(), expectedHeadRevision: 2 }
  await write(rollback)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic"')).rows[0].count, 0)
  assert.equal((await pool.query('SELECT "priorId" FROM "ResearchEconomicRevision" WHERE "requestId"=$1',
    [rollback.requestId])).rows[0].priorId, published.id)
  await write({ ...publication, action: "ROLLBACK", payload: null, rollbackToId: published.id,
    requestId: randomUUID(), expectedHeadRevision: 3 })
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic"')).rows[0].count, 1)
  await owner.query(`INSERT INTO "AdminEconomicRevision" (id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash",actor)
    VALUES ($1,$2,$3,$4,1,$5,'EDIT',$6::jsonb,$7,'test-owner')`,
  [randomUUID(), "player-1", "123", "CONTRACT", randomUUID(), JSON.stringify({ start: null, until: "2030-01-01", renewed: null }), "a".repeat(64)])
  const manualId = (await owner.query('SELECT id FROM "AdminEconomicRevision"')).rows[0].id
  await owner.query('INSERT INTO "AdminEconomicHead" VALUES ($1,$2,$3,1)', ["player-1", "CONTRACT", manualId])
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic"')).rows[0].count, 0)
  await assert.rejects(write({ ...publication, requestId: randomUUID(), expectedHeadRevision: 4 }), /RESEARCH_MANUAL_PRIORITY/)
  await assert.rejects(owner.query('DELETE FROM "ResearchEconomicRevision"'), /IMMUTABLE/)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicRevision"')).rows[0].count, 5)
  await owner.query(fs.readFileSync("prisma/migrations/20261108010000_researched_gross_base_reference/migration.sql", "utf8"))
  assert.deepEqual(parseResearchPayload("SALARY", "PUBLISH", salaryReference.payload), salaryReference.payload)
  const salaryPublication = { ...salaryReference, action: "PUBLISH" as const,
    payload: { ...salaryReference.payload, weeklyEur: "100", season: "2026-2027", fx: null },
    requestId: randomUUID(), expectedHeadRevision: 0 }
  const salaryPublished = await write(salaryPublication)
  assert.equal(salaryPublished.publishedNow, true)
  assert.equal((await write(salaryPublication)).replay, true)
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic" WHERE field=$1',
    ["SALARY"])).rows[0].count, 1)
  const netPublication = { ...salaryPublication, requestId: randomUUID(), expectedHeadRevision: salaryPublished.revision,
    payload: { weeklyAmount: "834.15", currency: "GBP" as const, weeklyEur: "1000", season: "2026-2027",
      taxType: "NET" as const, composition: "GUARANTEED" as const,
      fx: { unitsPerEur: "0.83415", asOf: "2026-11-06", sourceUrl: "https://www.ecb.europa.eu/rates" } } }
  const netPublished = await write(netPublication)
  assert.equal(netPublished.revision, salaryPublished.revision + 1)
  assert.equal((await write(netPublication)).replay, true)
  assert.equal((await pool.query('SELECT payload->>\'weeklyEur\' value FROM "ResearchEconomicPublic" WHERE field=$1',
    ["SALARY"])).rows[0].value, "1000")
  await owner.query(`INSERT INTO "AdminEconomicRevision" (id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash",actor)
    VALUES ($1,$2,$3,$4,1,$5,'EDIT',$6::jsonb,$7,'test-owner')`,
  [randomUUID(), "player-1", "123", "SALARY", randomUUID(), JSON.stringify({ weeklyEur: "200", taxType: "GROSS", composition: "TOTAL" }), "b".repeat(64)])
  const manualSalaryId = (await owner.query('SELECT id FROM "AdminEconomicRevision" WHERE section=$1', ["SALARY"])).rows[0].id
  await owner.query('INSERT INTO "AdminEconomicHead" VALUES ($1,$2,$3,1)', ["player-1", "SALARY", manualSalaryId])
  assert.equal((await pool.query('SELECT count(*)::int count FROM "ResearchEconomicPublic" WHERE field=$1',
    ["SALARY"])).rows[0].count, 0)
  await assert.rejects(write({ ...salaryPublication, requestId: randomUUID(), expectedHeadRevision: netPublished.revision }),
    /RESEARCH_MANUAL_PRIORITY/)
  await assert.rejects(owner.query('DELETE FROM "ResearchEconomicRevision" WHERE id=$1',
    [salaryPublished.id]), /IMMUTABLE/)
  await assert.rejects(write({ ...salaryPublication, action: "ROLLBACK", payload: null,
    rollbackToId: null, requestId: randomUUID(), expectedHeadRevision: netPublished.revision }),
  /RESEARCH_MANUAL_PRIORITY/)
  console.log("PG17 RESEARCH_ECONOMIC_PASS: evidence, publication, manual priority, CAS, idempotency, rollback, history")
} finally {
  await pool?.end(); await owner?.end()
  if (started) await command("pg_ctl", ["-D", cluster, "-m", "immediate", "-w", "stop"])
  assert(cluster.startsWith(root + path.sep))
  fs.rmSync(cluster, { recursive: true, force: true })
}
