// Local disposable PostgreSQL only. Never reads project connection strings.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createResearchEconomicWriter } from "../../services/researchEconomicWriter"

assert(process.argv.includes("--disposable-authorized"))
const root = path.resolve("audit/output")
fs.mkdirSync(root, { recursive: true })
const cluster = fs.mkdtempSync(path.join(root, "research-optional-club-"))
const bin = path.resolve(process.env.FUTSCOUT_PG17_BIN || "audit/output/postgres17-portable-01/distribution/pgsql/bin")
const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"])
  if (process.env[key]) env[key] = process.env[key]
const command = (name: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(path.join(bin, name + ".exe"), args, { env, windowsHide: true, stdio: "ignore" })
  child.once("error", reject)
  child.once("exit", code => code === 0 ? resolve() : reject(Error(name + ":" + code)))
})
let started = false, pool: Pool | undefined
try {
  const listener = net.createServer()
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve))
  const port = (listener.address() as net.AddressInfo).port
  await new Promise<void>(resolve => listener.close(() => resolve()))
  await command("initdb", ["-D", cluster, "-U", "test_owner", "-A", "trust", "--no-locale", "-E", "UTF8"])
  await command("pg_ctl", ["-D", cluster, "-l", path.join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
  started = true
  pool = new Pool({ host: "127.0.0.1", port, user: "test_owner", database: "postgres", ssl: false, max: 3 })
  assert.match((await pool.query("SHOW server_version")).rows[0].server_version, /^17\./)
  await pool.query('CREATE TABLE "Club"(id text PRIMARY KEY); CREATE TABLE "Player"(id text PRIMARY KEY,"externalId" text UNIQUE,"clubId" text REFERENCES "Club"(id),"protectedEconomicValue" integer NOT NULL)')
  await pool.query('INSERT INTO "Club" VALUES (\'club-1\'),(\'club-2\'); INSERT INTO "Player" VALUES(\'p1\',\'123\',\'club-1\',42),(\'p2\',\'456\',NULL,84)')
  for (const migration of ["20261106000000_manual_economic_admin", "20261108000000_researched_economic_publication", "20261108010000_researched_gross_base_reference"])
    await pool.query(fs.readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"))
  const write = createResearchEconomicWriter(pool)
  const base = { playerId: "p1", eaId: "123", clubId: "club-1" as string | null, field: "CONTRACT" as const, action: "PUBLISH" as const,
    payload: { until: "2029", precision: "YEAR" }, classification: "REPORTED" as const, sourceUrl: "https://example.test/contract",
    capturedOn: "2026-11-23", sourcePublishedOn: null, expectedHeadRevision: 0 }
  await write({ ...base, requestId: randomUUID() })
  const oldPublic = (await pool.query('SELECT * FROM "ResearchEconomicPublic"')).rows
  const players = (await pool.query('SELECT * FROM "Player" ORDER BY id')).rows
  const definitions = async () => (await pool!.query(`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN ('"ResearchEconomicRevision"'::regclass,'"ResearchEconomicHead"'::regclass) ORDER BY conname`)).rows
  const constraints = await definitions()
  await pool.query('CREATE ROLE optional_club_reader; GRANT SELECT ON "ResearchEconomicPublic" TO optional_club_reader')
  const sql = fs.readFileSync("prisma/migrations/20261124003000_research_economic_optional_club/migration.sql", "utf8")
  await pool.query("BEGIN")
  await pool.query(sql)
  await pool.query("COMMIT")
  assert.deepEqual(await definitions(), constraints)
  assert.deepEqual((await pool.query('SELECT * FROM "ResearchEconomicPublic"')).rows, oldPublic)
  assert((await pool.query(`SELECT has_table_privilege('optional_club_reader','"ResearchEconomicPublic"','SELECT') allowed`)).rows[0].allowed)
  const absent = { ...base, playerId: "p2", eaId: "456", clubId: null }
  const contract = { ...absent, requestId: randomUUID(), payload: { until: "2031", precision: "YEAR" } }
  const published = await write(contract)
  assert(published.publishedNow)
  assert((await write(contract)).replay)
  const salary = await write({ ...absent, field: "SALARY", requestId: randomUUID(), classification: "ESTIMATED",
    payload: { weeklyAmount: "1000", weeklyEur: "1000", currency: "EUR", taxType: "GROSS", composition: "BASE", season: "2026", fx: null } })
  assert(salary.publishedNow)
  const evidence = await write({ ...absent, field: "CLAUSE", action: "RECORD", requestId: randomUUID(),
    payload: { status: "UNKNOWN", amount: null, currency: null, conditions: null, validUntil: null } })
  assert(!evidence.publishedNow)
  const clause = await write({ ...absent, field: "CLAUSE", requestId: randomUUID(),
    payload: { status: "YES", amount: "50000000", currency: "EUR", conditions: null, validUntil: null } })
  assert.equal(clause.revision, evidence.revision + 1)
  const allPublic = (await pool.query('SELECT * FROM "ResearchEconomicPublic" ORDER BY "playerId",field')).rows
  assert.equal(allPublic.length, 4)
  await pool.query(sql)
  assert.deepEqual((await pool.query('SELECT * FROM "ResearchEconomicPublic" ORDER BY "playerId",field')).rows, allPublic)
  for (const command of [{ ...absent, clubId: "club-1" }, { ...base, clubId: null }, { ...absent, eaId: "789" }])
    await assert.rejects(write({ ...command, requestId: randomUUID() }), /RESEARCH_PLAYER_OR_CLUB_MISMATCH/)
  await assert.rejects(write({ ...contract, requestId: randomUUID(), expectedHeadRevision: 0 }), /RESEARCH_HEAD_CONFLICT/)
  const rollback = await write({ ...absent, field: "CLAUSE", action: "ROLLBACK", requestId: randomUUID(), payload: null,
    rollbackToId: null, expectedHeadRevision: clause.revision })
  assert(!rollback.publishedNow)
  assert.equal((await pool.query('SELECT count(*)::int n FROM "ResearchEconomicPublic" WHERE "playerId"=\'p2\' AND field=\'CLAUSE\'')).rows[0].n, 0)
  const manualId = randomUUID()
  await pool.query(`INSERT INTO "AdminEconomicRevision"(id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash",actor) VALUES($1,'p2','456','SALARY',1,$2,'EDIT','{"weeklyEur":"2000","taxType":"GROSS","composition":"BASE"}',$3,'test-owner')`, [manualId, randomUUID(), "a".repeat(64)])
  await pool.query('INSERT INTO "AdminEconomicHead" VALUES(\'p2\',\'SALARY\',$1,1)', [manualId])
  await assert.rejects(write({ ...absent, field: "SALARY", requestId: randomUUID(), expectedHeadRevision: salary.revision,
    payload: { weeklyAmount: "1000", weeklyEur: "1000", currency: "EUR", taxType: "GROSS", composition: "BASE", season: "2026", fx: null } }), /RESEARCH_MANUAL_PRIORITY/)
  assert.equal((await pool.query('SELECT count(*)::int n FROM "ResearchEconomicPublic" WHERE "playerId"=\'p2\' AND field=\'SALARY\'')).rows[0].n, 0)
  await pool.query('UPDATE "Player" SET "clubId"=\'club-2\' WHERE id=\'p2\'')
  assert.equal((await pool.query('SELECT count(*)::int n FROM "ResearchEconomicPublic" WHERE "playerId"=\'p2\'')).rows[0].n, 0)
  await pool.query('UPDATE "Player" SET "clubId"=NULL WHERE id=\'p2\'')
  assert.deepEqual((await pool.query('SELECT * FROM "Player" ORDER BY id')).rows, players)
  assert.deepEqual((await pool.query('SELECT * FROM "ResearchEconomicPublic" WHERE "playerId"=\'p1\'')).rows, oldPublic)
  console.log(JSON.stringify({ status: "RESEARCH_OPTIONAL_CLUB_DISPOSABLE_PASS", nullClubSalaryContractClause: true,
    idempotency: true, rollback: true, legacyPublicUnchanged: true, constraintsAndGrantsPreserved: true,
    mismatchedClubAndEaRejected: true, manualPriority: true, playerAndEconomicDataUnchanged: true, productionConnections: 0 }))
} finally {
  if (pool) await pool.end()
  if (started) await command("pg_ctl", ["-D", cluster, "-m", "fast", "-w", "stop"])
}
