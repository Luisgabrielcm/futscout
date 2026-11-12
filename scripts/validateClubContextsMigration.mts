/** Fresh localhost database only. Exercises the real migration history with synthetic volume. */
import assert from "node:assert/strict"
import { readdir, mkdir, readFile, writeFile, cp, copyFile } from "node:fs/promises"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { Pool } from "pg"
import { canonicalJson } from "../lib/clubContexts"

if (process.env.CLUB_CONTEXTS_DISPOSABLE_TEST !== "1") throw Error("DISPOSABLE_TEST_OPT_IN_REQUIRED")
const migrationName = "20261112001000_club_contexts"
const root = resolve("audit/output/club-contexts-migration")
const database = `clubctx_${Date.now()}`
const url = `postgresql://postgres@127.0.0.1:54339/${database}`
const admin = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:54339/postgres", max: 1 })
const identity = (await admin.query(`SELECT (pg_control_system()).system_identifier::text AS cluster,
  host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version`)).rows[0]
assert.equal(identity.host, "127.0.0.1"); assert.equal(identity.port, 54339)
assert.notEqual(identity.cluster, "7677620954387669023")
await admin.query(`CREATE DATABASE "${database}"`); await admin.end()
const db = new Pool({ connectionString: url, max: 1 })
const folder = resolve(root, database)
const migrations = resolve(folder, "migrations")
await mkdir(migrations, { recursive: true })
const entries = await readdir("prisma/migrations", { withFileTypes: true })
for (const entry of entries.filter(entry => entry.name !== migrationName)) {
  await cp(resolve("prisma/migrations", entry.name), resolve(migrations, entry.name), { recursive: entry.isDirectory() })
}
const config = resolve(folder, "prisma.config.ts")
await writeFile(config, `import { defineConfig } from "prisma/config"\nexport default defineConfig({
  schema: ${JSON.stringify(resolve("prisma/schema.prisma"))},
  migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: ${JSON.stringify(url)} }
})\n`)
function deploy(expectFailure = false) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", config],
    { encoding: "utf8", timeout: 120000, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } })
  if (expectFailure) assert.notEqual(result.status, 0)
  else assert.equal(result.status, 0, result.stderr + result.stdout)
  return result.stdout + result.stderr
}
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
try {
  deploy() // Existing repository history, before the new migration.
  await db.query(`INSERT INTO "Player" (id,"externalId",slug,name,position,"officialOverall",potential,"eaImportVisibility","updatedAt")
    SELECT 'fixture-player-'||n,(900000000+n)::text,'fixture-player-'||n,'Synthetic fixture '||n,'MC',76,81,'PUBLIC',now()
    FROM generate_series(1,23063) n;
    INSERT INTO "AdminEconomicRevision" (id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash",actor)
    SELECT p.id||'-'||v.section,p.id,p."externalId",v.section,1,p.id||'-'||v.section,'EDIT',v.payload,repeat('a',64),'SYNTHETIC_ONLY'
    FROM "Player" p CROSS JOIN (VALUES
      ('SALARY','{"weeklyEur":"1234.56","taxType":"GROSS","composition":"BASE"}'::jsonb),
      ('CONTRACT','{"start":"2025-01-01","until":"2029-12-31","renewed":null}'::jsonb)) v(section,payload);
    INSERT INTO "AdminEconomicHead" ("playerId",section,"revisionId",revision)
    SELECT "playerId",section,id,revision FROM "AdminEconomicRevision";
    INSERT INTO "PlayerEconomicState" (id,"playerId",field,provider,"providerPlayerId",context,"snapshotVersion",presence,
      amount,currency,period,confidence,"matchState",status,metadata,"contentHash")
    SELECT id||'-wage',id,'WAGE_WEEKLY','SYNTHETIC_TEST',"externalId",'REAL_WORLD','fixture','VALUE',1234.56,'EUR','WEEK',
      'HIGH','MATCHED','VALID','{"synthetic":true}'::jsonb,repeat('b',64) FROM "Player";
    INSERT INTO "PlayerEconomicObservation" (id,"stateId","playerId",field,"observedAt","requestId")
    SELECT id||'-obs',id,"playerId",field,now(),id||'-request' FROM "PlayerEconomicState";
    INSERT INTO "PlayerEconomicCurrent" ("playerId",field,"observationId",revision,"selectedAt","selectionReason","policyVersion")
    SELECT "playerId",field,id,1,now(),'SYNTHETIC_TEST','fixture' FROM "PlayerEconomicObservation"`)
  const tables: string[] = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename <> '_prisma_migrations' ORDER BY tablename`)).rows.map(row => row.tablename)
  async function snapshot() {
    const data: Record<string, { rows: number; hash: string }> = {}
    for (const table of tables) {
      const rows = (await db.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
      data[table] = { rows: rows.length, hash: hash(rows) }
    }
    return data
  }
  const before = await snapshot()
  assert.equal(before.Player.rows, 23063); assert.equal(before.AdminEconomicRevision.rows, 46126)
  await mkdir(resolve(migrations, migrationName))
  await copyFile(resolve("prisma/migrations", migrationName, "migration.sql"), resolve(migrations, migrationName, "migration.sql"))
  // Force a late DDL collision in this disposable database to verify BEGIN/COMMIT atomicity.
  await db.query(`CREATE FUNCTION reject_club_context_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'DISPOSABLE_ROLLBACK_SENTINEL'; END; $$`)
  // Prisma may surface the subsequent aborted-transaction error instead of the DDL collision.
  assert.match(deploy(true), /already exists|42723|current transaction is aborted/)
  for (const table of ["EaRosterReference", "PlayerClubContextRevision", "PlayerClubContextSelection"])
    assert.equal((await db.query('SELECT to_regclass($1) AS name', [`public."${table}"`])).rows[0].name, null)
  assert.deepEqual(await snapshot(), before)
  const sentinel = (await db.query(`SELECT pg_get_functiondef('reject_club_context_evidence_mutation()'::regprocedure) AS definition`)).rows[0].definition
  assert.match(sentinel, /DISPOSABLE_ROLLBACK_SENTINEL/)
  await db.query("DROP FUNCTION reject_club_context_evidence_mutation()") // Only the verified test-created blocker.
  const resolved = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--rolled-back", migrationName, "--config", config],
    { encoding: "utf8", timeout: 60000, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } })
  assert.equal(resolved.status, 0, resolved.stdout + resolved.stderr)
  assert.match(deploy(), new RegExp(migrationName))
  assert.deepEqual(await snapshot(), before)
  const migrationSql = await readFile(resolve(migrations, migrationName, "migration.sql"))
  const receiptBefore = (await db.query('SELECT id,migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name,id')).rows
  const receipt = receiptBefore.find(row => row.migration_name === migrationName && row.finished_at)
  assert.ok(receipt?.finished_at)
  assert.equal(receipt.checksum, createHash("sha256").update(migrationSql).digest("hex"))
  assert.match(deploy(), /No pending migrations/)
  assert.deepEqual((await db.query('SELECT id,migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name,id')).rows, receiptBefore)
  assert.deepEqual(await snapshot(), before)
  const names = ["EaRosterReference", "PlayerClubContextRevision", "PlayerClubContextSelection"]
  for (const table of names) assert.equal(Number((await db.query(`SELECT count(*) AS count FROM "${table}"`)).rows[0].count), 0)
  const constraints = (await db.query(`SELECT c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=ANY($1::text[]) ORDER BY c.conname`, [names])).rows
  assert.equal(constraints.length, 11)
  const triggers = (await db.query(`SELECT tgname,pg_get_triggerdef(g.oid) AS definition FROM pg_trigger g
    JOIN pg_class t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal AND t.relname=ANY($1::text[]) ORDER BY tgname`, [names])).rows
  assert.equal(triggers.length, 4)
  const indexes = (await db.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename=ANY($1::text[]) ORDER BY indexname`, [names])).rows
  assert.equal(indexes.length, 5)
  // Operational rollback: readers stay off and additive schema/evidence remain; no data reversal.
  assert.deepEqual(await snapshot(), before)
  const result = { status: "MIGRATION_READY", migration: migrationName, database, cluster: identity.cluster, version: identity.version,
    existingHistoryMigrations: entries.filter(entry => entry.isDirectory() && entry.name !== migrationName).length,
    existingPublicPlayers: before.Player.rows, syntheticFixtureOnly: true, existingTablesPreserved: tables.length,
    beforeAfterHash: hash(before), migrationChecksum: receipt.checksum, prismaReplay: "NO_PENDING_MIGRATIONS",
    receiptsUnchangedOnReplay: true, atomicFailureRolledBack: true, constraints, triggers, indexes, newContextRows: 0,
    readerDefaultChanged: false, productionConnections: 0, legacyTableSnapshots: before }
  await writeFile(resolve(root, "result.private.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ status: result.status, players: result.existingPublicPlayers, tables: tables.length,
    constraints: constraints.length, triggers: triggers.length, indexes: indexes.length, prismaReplay: result.prismaReplay }))
} finally { await db.end() }
