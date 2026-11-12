/** Explicit local-only integration harness. Creates a fresh database; never resets/reuses one. */
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { Pool } from "pg"
import { canonicalJson, validateClubContexts, type ClubContexts } from "../lib/clubContexts"
import { catalogAttributes } from "../tests/fixtures/catalogPlayer"

if (process.env.PR24_DISPOSABLE !== "1") throw Error("EXPLICIT_DISPOSABLE_TEST_REQUIRED")
const folder = resolve("audit/output/pr24-validation")
const database = `pr24_${Date.now()}`
const url = `postgresql://postgres@127.0.0.1:54339/${database}`
const admin = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:54339/postgres", max: 1 })
const identity = (await admin.query(`SELECT (pg_control_system()).system_identifier::text AS cluster,
  current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port`)).rows[0]
assert.equal(identity.host, "127.0.0.1"); assert.equal(identity.port, 54339)
assert.notEqual(identity.cluster, "7677620954387669023")
await admin.query(`CREATE DATABASE "${database}"`)
await admin.end()
const pool = new Pool({ connectionString: url, max: 1 })
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
const migrations = resolve(folder, database, "migrations")
await mkdir(resolve(migrations, "20261112000100_baseline"), { recursive: true })
await writeFile(resolve(migrations, "migration_lock.toml"), 'provider = "postgresql"\n')
await copyFile(resolve(folder, "baseline.sql"), resolve(migrations, "20261112000100_baseline/migration.sql"))
const config = resolve(folder, database, "prisma.config.ts")
await writeFile(config, `import { defineConfig } from "prisma/config"\nexport default defineConfig({
  schema: ${JSON.stringify(resolve("prisma/schema.prisma"))},
  migrations: { path: ${JSON.stringify(migrations)} },
  datasource: { url: ${JSON.stringify(url)} }
})\n`)
function deploy() {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", config],
    { encoding: "utf8", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, timeout: 60000 })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  return result.stdout
}
deploy()
const proposals: { name: string; eaPlayerId: string; contexts: ClubContexts; contentHash: string }[] =
  JSON.parse(await readFile("audit/output/club-context-proposals/four-context-proposals.private.json", "utf8"))
await pool.query(`INSERT INTO "League" (id,"externalId",name,slug,country,"updatedAt") VALUES ('fixture-league','900001','Fixture league','fixture-league','Brazil',now());
  INSERT INTO "Club" (id,"externalId",name,slug,"leagueId","updatedAt") VALUES
    ('fixture-palmeiras','383','Palmeiras','fixture-palmeiras','fixture-league',now()),
    ('fixture-flamengo','1043','Flamengo','fixture-flamengo','fixture-league',now())`)
for (const row of proposals) {
  const id = `fixture-${row.eaPlayerId}`
  const clubId = row.eaPlayerId === "225964" ? "fixture-flamengo" : "fixture-palmeiras"
  await pool.query(`INSERT INTO "Player" (id,"externalId",slug,name,position,"officialOverall",potential,"clubId","updatedAt")
    VALUES ($1,$2,$3,$4,'MC',76,81,$5,now())`, [id, row.eaPlayerId, id, row.name, clubId])
  const fields = Object.keys(catalogAttributes)
  await pool.query(`INSERT INTO "PlayerAttributes" (id,"playerId",${fields.map(f => `"${f}"`).join(",")},"updatedAt")
    VALUES ($1,$2,${fields.map((_, i) => `$${i + 3}`).join(",")},now())`,
    [`attrs-${id}`, id, ...Object.values(catalogAttributes)])
  for (const [section, payload] of Object.entries({ SALARY: { weeklyEur: "1234.56", taxType: "GROSS", composition: "BASE" },
    CONTRACT: { start: "2025-01-01", until: "2029-12-31", renewed: null } })) {
    const revision = `${id}-${section}`
    await pool.query(`INSERT INTO "AdminEconomicRevision" (id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash",actor)
      VALUES ($1,$2,$3,$4,1,$1,'PUBLISH',$5,$6,'DISPOSABLE_SYNTHETIC_FIXTURE')`, [revision, id, row.eaPlayerId, section, payload, hash(payload)])
    await pool.query(`INSERT INTO "AdminEconomicHead" ("playerId",section,"revisionId",revision) VALUES ($1,$2,$3,1)`, [id, section, revision])
  }
  await pool.query(`INSERT INTO "PlayerEconomicState" (id,"playerId",field,provider,"providerPlayerId",context,"snapshotVersion",presence,
    amount,currency,confidence,"matchState",status,metadata,"contentHash")
    VALUES ($1,$2,'MARKET_VALUE','LIVE_FOOTBALL',$3,'REAL_WORLD','fixture','PRESENT',1234567,'EUR','HIGH','MATCHED','ACTIVE',$4,$5)`,
    [`state-${id}`, id, row.eaPlayerId, { synthetic: true }, "a".repeat(64)])
}
// Synthetic views mirror the two read contracts, without installing unrelated historical migrations.
await pool.query(`CREATE VIEW "AdminEconomicPublic" AS SELECT r."playerId",r.section,r.revision,r.payload
  FROM "AdminEconomicRevision" r JOIN "AdminEconomicHead" h ON h."revisionId"=r.id;
  CREATE VIEW "ResearchEconomicPublic" AS SELECT r."playerId",r.field,r.payload,r.classification,r."sourceUrl",r."sourcePublishedOn"
  FROM "ResearchEconomicRevision" r JOIN "ResearchEconomicHead" h ON h."revisionId"=r.id`)
const tables: string[] = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename <> '_prisma_migrations' ORDER BY tablename`)).rows.map(row => row.tablename)
async function existingData() {
  const result: Record<string, string> = {}
  for (const table of tables) result[table] = hash((await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows)
  return result
}
const before = await existingData()
await mkdir(resolve(migrations, "20261112000200_club_contexts"))
await copyFile("prisma/club-contexts.candidate.sql", resolve(migrations, "20261112000200_club_contexts/migration.sql"))
deploy()
assert.deepEqual(await existingData(), before)
const replay = deploy()
assert.match(replay, /No pending migrations/)
assert.equal(Number((await pool.query('SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count), 2)
assert.deepEqual(await existingData(), before)
for (const row of proposals) {
  validateClubContexts(row.contexts, row.eaPlayerId)
  const snapshot = row.contexts.game.snapshot
  await pool.query('INSERT INTO "EaRosterReference" (id,"contentHash",metadata) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [snapshot.id, snapshot.contentHash, snapshot])
  await pool.query('INSERT INTO "PlayerClubContextRevision" (id,"eaPlayerId","rosterReferenceId",payload,"contentHash") VALUES ($1,$2,$3,$4,$5)',
    [`revision-${row.eaPlayerId}`, row.eaPlayerId, snapshot.id, row.contexts, hash(row.contexts)])
  await pool.query('INSERT INTO "PlayerClubContextSelection" ("eaPlayerId","revisionId","decisionReference") VALUES ($1,$2,$3)',
    [row.eaPlayerId, `revision-${row.eaPlayerId}`, "PR24_DISPOSABLE_REVIEW_ONLY"])
}
const tx = await pool.connect()
const checks: string[] = []
await tx.query("BEGIN")
async function refuses(label: string, sql: string, params: unknown[], code: string) {
  await tx.query("SAVEPOINT negative_case")
  let caught = false
  try { await tx.query(sql, params) } catch (error) { caught = true; assert.equal((error as { code: string }).code, code, label) }
  await tx.query("ROLLBACK TO SAVEPOINT negative_case")
  assert.ok(caught, label); checks.push(label)
}
const first = proposals[0]
const snapshot = first.contexts.game.snapshot
await refuses("unknown EA player FK", 'INSERT INTO "PlayerClubContextSelection" ("eaPlayerId","revisionId","decisionReference") VALUES ($1,$2,$3)',
  ["99999999", `revision-${first.eaPlayerId}`, "test"], "23503")
await refuses("cross-player revision FK", 'UPDATE "PlayerClubContextSelection" SET "revisionId"=$1,version=version+1 WHERE "eaPlayerId"=$2',
  [`revision-${proposals[1].eaPlayerId}`, first.eaPlayerId], "23503")
await refuses("immutable snapshot", 'UPDATE "EaRosterReference" SET metadata=metadata WHERE id=$1', [snapshot.id], "P0001")
await refuses("immutable revision", 'DELETE FROM "PlayerClubContextRevision" WHERE id=$1', [`revision-${first.eaPlayerId}`], "P0001")
await refuses("selection version CAS", 'UPDATE "PlayerClubContextSelection" SET version=version WHERE "eaPlayerId"=$1', [first.eaPlayerId], "P0001")
const bad = structuredClone(first.contexts); bad.game.snapshot.id = "absent"
await refuses("snapshot provenance mismatch", 'INSERT INTO "PlayerClubContextRevision" (id,"eaPlayerId","rosterReferenceId",payload,"contentHash") VALUES ($1,$2,$3,$4,$5)',
  ["invalid-ref", first.eaPlayerId, snapshot.id, bad, hash(bad)], "P0001")
const conflated = structuredClone(first.contexts); conflated.game.club = { eaId: "383", name: "Palmeiras" }
await refuses("NG-FA cannot have a game club", 'INSERT INTO "PlayerClubContextRevision" (id,"eaPlayerId","rosterReferenceId",payload,"contentHash") VALUES ($1,$2,$3,$4,$5)',
  ["invalid-club", first.eaPlayerId, snapshot.id, conflated, hash(conflated)], "23514")
await refuses("raw DDL replay fails without partial writes", await readFile("prisma/club-contexts.candidate.sql", "utf8"), [], "42P07")
await tx.query("ROLLBACK"); tx.release()
assert.deepEqual(await existingData(), before)
const duplicate = await pool.query('INSERT INTO "PlayerClubContextRevision" (id,"eaPlayerId","rosterReferenceId",payload,"contentHash") VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
  [`revision-${first.eaPlayerId}`, first.eaPlayerId, snapshot.id, first.contexts, hash(first.contexts)])
assert.equal(duplicate.rowCount, 0)
assert.equal(Number((await pool.query('SELECT count(*) AS count FROM "PlayerClubContextRevision"')).rows[0].count), 4)
const result = { status: "SQL_VALIDATED", database, cluster: identity.cluster, server: "PostgreSQL 14.24",
  existingTablesPreserved: tables.length, existingDataHash: hash(before), prismaMigrationReplay: "NO_PENDING_MIGRATIONS",
  evidenceReplay: "NO_DUPLICATES", checks, proposals: 4, productionConnections: 0 }
await writeFile(resolve(folder, "sql-result.private.json"), JSON.stringify(result, null, 2))
await writeFile(resolve(folder, "target.private.json"), JSON.stringify({ url, database, cluster: identity.cluster }, null, 2))
await pool.end()
console.log(JSON.stringify(result))
