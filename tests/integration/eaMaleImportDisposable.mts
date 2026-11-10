import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool } from "pg"
import { rollbackEaMaleEntry, stageEaMaleBatch, validateEaMaleManifest,
  type EaMaleBatch, type EaMaleCandidate, type EaMaleManifest } from "../../services/eaMaleImportBatches"

const url = process.env.FUTSCOUT_EA_MALE_IMPORT_TEST_URL
if (!url) throw new Error("DISPOSABLE_URL_REQUIRED")
const target = new URL(url)
if (target.hostname !== "127.0.0.1" || target.port !== "54329" || target.pathname !== "/fc27_test")
  throw new Error("DISPOSABLE_LOCAL_TARGET_ONLY")

const root = resolve("audit/output/fc27-male-import-prep-20261110")
const lines = async (name: string) => (await readFile(resolve(root, name), "utf8"))
  .trim().split(/\r?\n/).map(row => JSON.parse(row))
const [summary, candidates, batches] = await Promise.all([
  readFile(resolve(root, "summary.private.json"), "utf8").then(JSON.parse),
  lines("candidates.private.jsonl") as Promise<EaMaleCandidate[]>,
  lines("batches.private.jsonl") as Promise<EaMaleBatch[]>,
])
const manifest: EaMaleManifest = { ...summary, candidates, batches }
validateEaMaleManifest(manifest)

const db = new Pool({ connectionString: url, max: 2 })
try {
  const uniqueLeagues = new Map<string, string>()
  const uniqueClubs = new Map<string, NonNullable<EaMaleCandidate["club"]> & { name: string; leagueId: string; leagueName: string }>()
  for (const row of candidates) {
    if (row.clubStatus !== "KNOWN_CLUB" || !row.club) continue
    const club = row.club as NonNullable<EaMaleCandidate["club"]> & { name: string; leagueId: string; leagueName: string }
    uniqueLeagues.set(String(club.leagueId), club.leagueName)
    uniqueClubs.set(club.eaTeamId, club)
  }
  for (const [eaId, name] of uniqueLeagues)
    await db.query('INSERT INTO "League" (id, "externalId", name, slug, country, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
      [randomUUID(), eaId, name, `test-league-${eaId}`, "TEST_ONLY"])
  for (const club of uniqueClubs.values()) {
    const league = await db.query<{ id: string }>('SELECT id FROM "League" WHERE "externalId" = $1', [String(club.leagueId)])
    assert.equal(league.rows.length, 1)
    await db.query('INSERT INTO "Club" (id, "externalId", name, slug, "leagueId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
      [randomUUID(), club.eaTeamId, club.name, `test-club-${club.eaTeamId}`, league.rows[0].id])
  }
  const existingId = randomUUID()
  await db.query('INSERT INTO "Player" (id, "externalId", slug, name, position, "officialOverall", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
    [existingId, "999999999", "existing-sentinel", "Existing Sentinel", "ATA", 70])
  for (const batch of batches) assert.equal(await stageEaMaleBatch(db, manifest, batch.id), "STAGED")
  const staged = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "Player" WHERE "eaImportVisibility" = $1', ["STAGED"])
  assert.equal(Number(staged.rows[0].count), 7019)
  const entries = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "EaMaleImportEntry"')
  assert.equal(Number(entries.rows[0].count), 7019)
  const clubbed = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "EaMaleImportEntry" e JOIN "Player" p ON p.id = e."playerId" WHERE e."clubStatus" = $1 AND p."clubId" IS NOT NULL', ["KNOWN_CLUB"])
  assert.equal(Number(clubbed.rows[0].count), 4220)
  const free = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "Player" WHERE "eaFreeAgentEvidence" = $1 AND "eaImportVisibility" = $2', ["SOURCE_POSSIBLE", "STAGED"])
  assert.equal(Number(free.rows[0].count), 188)
  const economic = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "PlayerEconomicCurrent"')
  assert.equal(Number(economic.rows[0].count), 0)
  assert.equal(await stageEaMaleBatch(db, manifest, batches[0].id), "ALREADY_STAGED")
  const firstId = batches[0].eaPlayerIds[0]
  await rollbackEaMaleEntry(db, firstId)
  await rollbackEaMaleEntry(db, firstId)
  const rolledBack = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "Player" WHERE "externalId" = $1 AND "eaImportVisibility" = $2', [firstId, "ROLLED_BACK"])
  assert.equal(Number(rolledBack.rows[0].count), 1)
  const sentinel = await db.query<{ name: string; officialOverall: number }>('SELECT name, "officialOverall" FROM "Player" WHERE id = $1', [existingId])
  assert.deepEqual(sentinel.rows[0], { name: "Existing Sentinel", officialOverall: 70 })
  const receipts = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "EaMaleImportBatch"')
  assert.equal(Number(receipts.rows[0].count), 72)
  const history = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM "EaMaleImportEvent"')
  assert.equal(Number(history.rows[0].count), 7020)
  console.log(JSON.stringify({ postgres: "disposable", batches: 72, staged: 7019, clubbed: 4220,
    sourcePossibleFreeAgents: 188, receipts: 72, restart: "PASS", duplicatePrevention: "PASS",
    rollback: "PASS", historyEvents: 7020, existingPlayerPreserved: "PASS", economicRows: 0 }))
} finally { await db.end() }
