import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool } from "pg"
import { rollbackEaMaleEntry, stageEaMaleBatch, stageEaMaleClubBatch, validateEaMaleManifest,
  type EaMaleClubLeagueMapping, type EaMaleClubPlan, type EaMaleManifest } from "../../services/eaMaleImportBatches"

const url = process.env.FUTSCOUT_EA_MALE_IMPORT_TEST_URL
if (!url) throw Error("DISPOSABLE_URL_REQUIRED")
const target = new URL(url)
if (target.hostname !== "127.0.0.1" || target.port !== "54329" || target.pathname !== "/fc27_test")
  throw Error("DISPOSABLE_LOCAL_TARGET_ONLY")
const clubsDir = process.env.FUTSCOUT_EA_IMPORT_CLUBS_DIR
const playersDir = process.env.FUTSCOUT_EA_IMPORT_PLAYERS_DIR
const mappingFile = process.env.FUTSCOUT_EA_IMPORT_LEAGUE_MAP_FILE
if (!clubsDir || !playersDir || !mappingFile) throw Error("PRIVATE_INPUTS_REQUIRED")
const sha = (value: string) => createHash("sha256").update(value).digest("hex")
const [clubSummaryText, rawJsonl, mappingRaw, playerSummaryText, candidatesText, batchesText] = await Promise.all([
  readFile(resolve(clubsDir, "summary.private.json"), "utf8"),
  readFile(resolve(clubsDir, "club-registration-plan.private.jsonl"), "utf8"),
  readFile(resolve(mappingFile), "utf8"),
  readFile(resolve(playersDir, "summary.private.json"), "utf8"),
  readFile(resolve(playersDir, "candidates.private.jsonl"), "utf8"),
  readFile(resolve(playersDir, "batches.private.jsonl"), "utf8"),
])
const clubSummary = JSON.parse(clubSummaryText) as { clubPlanHash: string; sourceSha256: string }
const plan: EaMaleClubPlan = { rawJsonl, sha256: clubSummary.clubPlanHash,
  sourceBinarySha256: clubSummary.sourceSha256 }
const mapping: EaMaleClubLeagueMapping = { rawJson: mappingRaw, sha256: sha(mappingRaw) }
const resolution = JSON.parse(mappingRaw) as { rows: Array<{ eaTeamId: string; targetLeagueId: string | null;
  targetLeagueName: string | null; supportingEaClubIds: string[]; classification: string }> }
const mapped = resolution.rows.filter(row => row.classification === "LEAGUE_IDENTIFIED_BY_EA_ANCHOR")
assert.equal(mapped.length, 55)
const manifest: EaMaleManifest = { ...JSON.parse(playerSummaryText),
  candidates: candidatesText.trim().split(/\r?\n/).map(line => JSON.parse(line)),
  batches: batchesText.trim().split(/\r?\n/).map(line => JSON.parse(line)) }
assert.equal(validateEaMaleManifest(manifest).size, 978)

const pool = new Pool({ connectionString: url, max: 2 })
try {
  const leagues = new Map<string, string>()
  const anchors = new Map<string, string>()
  for (const row of mapped) {
    assert.ok(row.targetLeagueId && row.targetLeagueName)
    if (leagues.has(row.targetLeagueId)) assert.equal(leagues.get(row.targetLeagueId), row.targetLeagueName)
    leagues.set(row.targetLeagueId, row.targetLeagueName)
    for (const id of row.supportingEaClubIds) {
      if (anchors.has(id)) assert.equal(anchors.get(id), row.targetLeagueId)
      anchors.set(id, row.targetLeagueId)
    }
  }
  for (const [id, name] of leagues) await pool.query(
    'INSERT INTO "League" (id,name,slug,country,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now())',
    [id, name, `test-league-${id}`, "Não informado"])
  for (const [eaId, leagueId] of anchors) await pool.query(
    'INSERT INTO "Club" (id,"externalId",name,slug,"leagueId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
    [randomUUID(), eaId, `Existing EA anchor ${eaId}`, `anchor-${eaId}`, leagueId])
  const sentinel = randomUUID()
  await pool.query('INSERT INTO "Player" (id,"externalId",slug,name,position,"officialOverall","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
    [sentinel, "999999999", "existing-sentinel", "Existing Sentinel", "ATA", 70])

  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "ALREADY_STAGED")
  for (const batch of manifest.batches) assert.equal(await stageEaMaleBatch(pool, manifest, batch.id), "STAGED")
  assert.equal(await stageEaMaleBatch(pool, manifest, manifest.batches[0].id), "ALREADY_STAGED")
  const number = async (sql: string, params: unknown[] = []) => Number((await pool.query<{ count: string }>(sql, params)).rows[0].count)
  assert.equal(await number('SELECT count(*)::text AS count FROM "Club" WHERE "eaImportVisibility"=$1', ["STAGED"]), 55)
  assert.equal(await number('SELECT count(*)::text AS count FROM "Player" WHERE "eaImportVisibility"=$1', ["STAGED"]), 978)
  assert.equal(await number('SELECT count(*)::text AS count FROM "Player" WHERE "eaImportVisibility"=$1', ["PUBLIC"]), 1)
  assert.equal(await number('SELECT count(*)::text AS count FROM "EaMaleImportEntry"'), 978)
  assert.equal(await number('SELECT count(*)::text AS count FROM "EaMaleImportBatch"'), 10)
  assert.equal(await number('SELECT count(*)::text AS count FROM "PlayerEconomicCurrent"'), 0)
  const held = resolution.rows.filter(row => row.classification !== "LEAGUE_IDENTIFIED_BY_EA_ANCHOR")
    .map(row => row.eaTeamId)
  assert.equal(await number('SELECT count(*)::text AS count FROM "Club" WHERE "externalId"=ANY($1::text[])', [held]), 0)
  const existing = (await pool.query<{ name: string; officialOverall: number }>(
    'SELECT name,"officialOverall" FROM "Player" WHERE id=$1', [sentinel])).rows[0]
  assert.deepEqual(existing, { name: "Existing Sentinel", officialOverall: 70 })
  const firstId = manifest.batches[0].eaPlayerIds[0]
  await rollbackEaMaleEntry(pool, firstId)
  await rollbackEaMaleEntry(pool, firstId)
  assert.equal(await number('SELECT count(*)::text AS count FROM "Player" WHERE "externalId"=$1 AND "eaImportVisibility"=$2',
    [firstId, "ROLLED_BACK"]), 1)
  console.log(JSON.stringify({ status: "DISPOSABLE_STAGING_PASS", clubs: 55, players: 978,
    batches: 10, publicNewPlayers: 0, existingSentinelPreserved: true, idempotency: true, rollback: true }))
} finally { await pool.end() }
