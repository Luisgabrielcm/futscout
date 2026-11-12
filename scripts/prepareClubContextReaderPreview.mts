/** Creates a new local fixture database and a SELECT-only runtime, never reads Production. */
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool } from "pg"
import { canonicalJson, validateClubContexts, type ClubContexts } from "../lib/clubContexts"
import { clubContextReadEaIds, clubContextReadPilot, expectedClubContextPilotSelection } from "../lib/clubContextReadGate"

if (process.env.CLUB_CONTEXT_READER_PREVIEW_LOCAL !== "1") throw Error("LOCAL_PREVIEW_OPT_IN_REQUIRED")
const prior = JSON.parse(await readFile("../club-contexts-pilot/audit/output/club-contexts-pilot/validation.private.json", "utf8"))
assert.equal(prior.status, "PILOT_READY"); assert.match(prior.database, /^clubctxpilot_\d+$/)
const admin = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:54339/postgres", max: 1 })
const identity = (await admin.query(`SELECT (pg_control_system()).system_identifier::text AS cluster,
  host(inet_server_addr()) AS host,inet_server_port() AS port`)).rows[0]
assert.equal(identity.host, "127.0.0.1"); assert.equal(identity.port, 54339)
assert.notEqual(identity.cluster, "7677620954387669023"); assert.equal(identity.cluster, prior.cluster)
const suffix = Date.now()
const database = `clubctxreadpreview_${suffix}`
const role = `clubctxread_${suffix}`
await admin.query(`CREATE DATABASE "${database}" TEMPLATE "${prior.database}"`)
await admin.query(`CREATE ROLE "${role}" LOGIN; ALTER ROLE "${role}" SET default_transaction_read_only=on`)
await admin.end()
const fixtureUrl = `postgresql://postgres@127.0.0.1:54339/${database}`
const db = new Pool({ connectionString: fixtureUrl, max: 1 })
try {
  // Synthetic values only: complete fixture profiles so the actual profile UI renders.
  const columns = (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PlayerAttributes' AND data_type='integer' ORDER BY ordinal_position`)).rows.map(row => row.column_name as string)
  for (const column of columns) assert.match(column, /^[A-Za-z][A-Za-z0-9]*$/)
  await db.query(`INSERT INTO "PlayerAttributes" (id,"playerId","updatedAt",${columns.map(c => `"${c}"`).join(',')})
    SELECT 'synthetic-attributes-'||id,id,now(),${columns.map(() => '70').join(',')} FROM "Player"
    ON CONFLICT ("playerId") DO NOTHING`)
  const rows = (await db.query('SELECT id,"eaPlayerId",payload,"contentHash" FROM "PlayerClubContextRevision" ORDER BY "eaPlayerId"')).rows
  assert.deepEqual(rows.map(row => row.eaPlayerId).sort(), clubContextReadEaIds)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM "PlayerClubContextSelection"')).rows[0].count, 0)
  for (const row of rows) {
    const expected = expectedClubContextPilotSelection(row.eaPlayerId)!
    validateClubContexts(row.payload as ClubContexts, row.eaPlayerId)
    assert.equal(row.id, expected.revisionId); assert.equal(row.contentHash, expected.contentHash)
    const fixture = JSON.parse(await readFile("tests/fixtures/clubContextsPilot.json", "utf8")) as { eaPlayerId: string; contexts: ClubContexts }[]
    assert.equal(canonicalJson(row.payload), canonicalJson(fixture.find(f => f.eaPlayerId === row.eaPlayerId)!.contexts))
    await db.query('INSERT INTO "PlayerClubContextSelection" ("eaPlayerId","revisionId","decisionReference",version) VALUES ($1,$2,$3,1)',
      [row.eaPlayerId, row.id, expected.decisionReference])
  }
  await db.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}";
    GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`)
  const target = { database, cluster: identity.cluster, url: `postgresql://${role}@127.0.0.1:54339/${database}`,
    manifestHash: clubContextReadPilot.manifestHash, fixtureOnly: true, economics: "SYNTHETIC_FIXTURES_NOT_REAL_PLAYER_VALUES",
    readOnly: true, productionConnections: 0 }
  const folder = resolve("audit/output/club-contexts-readers-preview")
  await mkdir(folder, { recursive: true })
  await writeFile(resolve(folder, "target.private.json"), JSON.stringify(target, null, 2))
  console.log(JSON.stringify({ status: "ISOLATED_READER_PREVIEW_READY", database, readOnly: true, eaIds: clubContextReadEaIds, productionConnections: 0 }))
} finally { await db.end() }
