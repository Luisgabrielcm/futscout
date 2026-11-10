import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool } from "pg"
import { reconcileStagedNationalTeamPlayers, stageNationalTeam,
  validateNationalTeamSource, type NationalTeamSourceRow } from "../../services/nationalTeamStaging"

const url = process.env.FUTSCOUT_NATIONAL_TEAM_TEST_URL
if (!url) throw new Error("DISPOSABLE_URL_REQUIRED")
const target = new URL(url)
if (target.hostname !== "127.0.0.1" || target.port !== "54329" || target.pathname !== "/fc27_nat_test")
  throw new Error("DISPOSABLE_LOCAL_TARGET_ONLY")

const root = resolve("audit/output/fc27-national-teams-20261110")
const rows = (await readFile(resolve(root, "rosters.private.jsonl"), "utf8"))
  .trim().split(/\r?\n/).map(line => JSON.parse(line)) as NationalTeamSourceRow[]
const summary = JSON.parse(await readFile(resolve(root, "summary.private.json"), "utf8"))
validateNationalTeamSource(rows, summary.manifestHash)
const sourcePlayers = (await readFile(resolve("audit/output/fc27-db-kit-20261110/players.private.jsonl"), "utf8"))
  .trim().split(/\r?\n/).map(line => JSON.parse(line)) as { eaPlayerId: string; status: string }[]
const matched = new Set(sourcePlayers.filter(player => player.status === "MATCHED").map(player => player.eaPlayerId))
const linked = new Set(rows.flatMap(row => row.playerEaIds))
assert.equal(linked.size, 1326)
const existing = [...linked].filter(id => matched.has(id))
assert.equal(existing.length, 1073)

const db = new Pool({ connectionString: url, max: 2 })
try {
  const leagueId = randomUUID()
  const clubId = randomUUID()
  await db.query('INSERT INTO "League" (id, name, slug, country, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,now(),now())',
    [leagueId, "Disposable League", "disposable-league", "TEST_ONLY"])
  await db.query('INSERT INTO "Club" (id, name, slug, "leagueId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,now(),now())',
    [clubId, "Disposable Club", "disposable-club", leagueId])
  for (const [index, eaId] of existing.entries()) {
    await db.query('INSERT INTO "Player" (id, "externalId", slug, name, position, "officialOverall", "clubId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())',
      [randomUUID(), eaId, `disposable-${eaId}`, `Existing ${eaId}`, "ATA", 70, index === 0 ? clubId : null])
  }
  for (const team of rows) assert.equal(await stageNationalTeam(db, rows, summary.manifestHash, team.eaTeamId), "STAGED")
  assert.equal(await stageNationalTeam(db, rows, summary.manifestHash, rows[0].eaTeamId), "ALREADY_STAGED")
  const counts = await db.query<{ teams: string; rosters: string; memberships: string; resolved: string; published: string }>(`
    SELECT (SELECT count(*) FROM "NationalTeam")::text AS teams,
      (SELECT count(*) FROM "NationalTeamRoster")::text AS rosters,
      (SELECT count(*) FROM "NationalTeamRosterPlayer")::text AS memberships,
      (SELECT count(*) FROM "NationalTeamRosterPlayer" WHERE "playerId" IS NOT NULL)::text AS resolved,
      (SELECT count(*) FROM "NationalTeamRoster" WHERE status = 'PUBLISHED')::text AS published`)
  assert.deepEqual(counts.rows[0], { teams: "51", rosters: "51", memberships: "1326", resolved: "1073", published: "0" })
  const publicRosters = async () => Number((await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "NationalTeamRoster"
      WHERE status = 'PUBLISHED' AND "rightsStatus" = 'APPROVED' AND "rosterDate" IS NOT NULL`)).rows[0].count)
  assert.equal(await publicRosters(), 0)
  const rollbackClient = await db.connect()
  try {
    await rollbackClient.query("BEGIN")
    await rollbackClient.query(`UPDATE "NationalTeamRoster" SET status = 'PUBLISHED', "rightsStatus" = 'APPROVED',
      "rosterDate" = '2026-01-01T00:00:00Z' WHERE id = $1`,
    [`${rows[0].eaTeamId}:${rows[0].rosterHash}`])
    const temporary = await rollbackClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "NationalTeamRoster"
        WHERE status = 'PUBLISHED' AND "rightsStatus" = 'APPROVED' AND "rosterDate" IS NOT NULL`)
    assert.equal(Number(temporary.rows[0].count), 1)
  } finally { await rollbackClient.query("ROLLBACK"); rollbackClient.release() }
  assert.equal(await publicRosters(), 0)
  const sentinel = await db.query<{ clubId: string }>('SELECT "clubId" FROM "Player" WHERE "externalId" = $1', [existing[0]])
  assert.equal(sentinel.rows[0].clubId, clubId)
  const missing = [...linked].find(id => !matched.has(id))!
  await db.query('INSERT INTO "Player" (id, "externalId", slug, name, position, "officialOverall", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
    [randomUUID(), missing, `later-${missing}`, "Later Player", "MC", 68])
  assert.equal(await reconcileStagedNationalTeamPlayers(db), 1)
  assert.equal(await reconcileStagedNationalTeamPlayers(db), 0)
  const resolved = await db.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM "NationalTeamRosterPlayer" WHERE "playerId" IS NOT NULL')
  assert.equal(Number(resolved.rows[0].count), 1074)
  console.log(JSON.stringify({ postgres: "disposable", teams: 51, rosterLinks: 1326,
    initiallyLinkedPlayers: 1073, pendingPlayerImports: 253, laterReconciled: 1,
    publishedRosters: 0, replay: "PASS", rollback: "PASS", existingClubPreserved: "PASS" }))
} finally { await db.end() }
