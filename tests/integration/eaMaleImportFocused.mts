import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { Pool } from "pg"
import { publishEaMaleBatch, publishEaMaleClubBatch, rollbackEaMaleClub, rollbackEaMaleEntry,
  stageEaMaleBatch, stageEaMaleClubBatch, type EaMaleManifest } from "../../services/eaMaleImportBatches"

const url = process.env.FUTSCOUT_EA_MALE_IMPORT_TEST_URL
if (!url) throw new Error("DISPOSABLE_URL_REQUIRED")
const target = new URL(url)
if (target.hostname !== "127.0.0.1" || target.port !== "54329" || target.pathname !== "/fc27_test")
  throw new Error("DISPOSABLE_LOCAL_TARGET_ONLY")
const sha = (text: string) => createHash("sha256").update(text).digest("hex")
const fields = ["pace", "acceleration", "sprintSpeed", "shooting", "positioning", "finishing", "shotPower", "longShots",
  "volleys", "penalties", "passing", "vision", "crossing", "freeKickAccuracy", "shortPassing", "longPassing",
  "curve", "dribbling", "agility", "balance", "reactions", "ballControl", "dribblingStat", "composure",
  "defending", "interceptions", "headingAccuracy", "defensiveAwareness", "standingTackle", "slidingTackle",
  "physical", "jumping", "stamina", "strength", "aggression", "gkDiving", "gkHandling", "gkKicking",
  "gkPositioning", "gkReflexes"]
const content = { eaPlayerId: "123456789", name: "Synthetic Player", dateOfBirth: "2000-01-01",
  primaryPosition: "ATA", overall: 70, potential: 72,
  attributes: Object.fromEntries(fields.map(field => [field, 50])), club: { eaTeamId: "456" },
  clubStatus: "KNOWN_CLUB" as const, issues: [] as string[] }
const candidate = { ...content, contentHash: sha(JSON.stringify(content)) }
const manifest: EaMaleManifest = { source: { commit: "synthetic", binarySha256: "a".repeat(64),
  rosterDate: null, rightsForPublicUse: "UNVERIFIED" }, selectionHash: sha(candidate.contentHash),
  candidates: [candidate], batches: [{ id: "synthetic-001", status: "PREPARED_NO_WRITE", clubStatus: "KNOWN_CLUB",
    count: 1, eaPlayerIds: [candidate.eaPlayerId], batchHash: sha(candidate.contentHash), publicationAllowed: false }] }
const pool = new Pool({ connectionString: url, max: 2 })
try {
  const leagueId = randomUUID(), clubId = randomUUID(), originalId = randomUUID()
  await pool.query('INSERT INTO "League" (id,"externalId",name,slug,country,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
    [leagueId, "7", "Synthetic League", "synthetic-league", "Testland"])
  await pool.query('INSERT INTO "Club" (id,"externalId",name,slug,"leagueId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
    [clubId, "456", "Existing Club", "existing-club", leagueId])
  await pool.query('INSERT INTO "Player" (id,"externalId",slug,name,position,"officialOverall","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
    [originalId, "999999", "original-player", "Original Player", "ATA", 80])
  assert.equal(await stageEaMaleBatch(pool, manifest, "synthetic-001"), "STAGED")
  assert.equal(await stageEaMaleBatch(pool, manifest, "synthetic-001"), "ALREADY_STAGED")
  const hidden = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM "Player" WHERE "externalId"=$1 AND "eaImportVisibility"=$2',
    [candidate.eaPlayerId, "STAGED"])
  assert.equal(hidden.rows[0].count, "1")
  const approval = { selectionHash: manifest.selectionHash, sourceBinarySha256: manifest.source.binarySha256,
    rightsForPublicUse: "APPROVED" as const, undatedRosterAcknowledged: true as const }
  assert.equal(await publishEaMaleBatch(pool, manifest, "synthetic-001", { kind: "disposable" }, approval), "PUBLISHED")
  assert.equal(await publishEaMaleBatch(pool, manifest, "synthetic-001", { kind: "disposable" }, approval), "ALREADY_PUBLISHED")
  const clubRows = Array.from({ length: 127 }, (_, i) => ({ eaTeamId: String(i + 1000), name: `Synthetic Club ${i}`,
    leagueId: "7", leagueName: "Synthetic League", country: "Testland", missingMalePlayersLinked: 1,
    identityStatus: i === 126 ? "HOMONYM_REVIEW" : "EA_ID_ABSENT" }))
  const rawJsonl = clubRows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: sha(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  assert.equal(await stageEaMaleClubBatch(pool, plan, 1), "STAGED")
  assert.equal(await stageEaMaleClubBatch(pool, plan, 1), "ALREADY_STAGED")
  const clubApproval = { sourcePlanHash: plan.sha256, sourceBinarySha256: plan.sourceBinarySha256,
    rightsForPublicUse: "APPROVED" as const, undatedRosterAcknowledged: true as const }
  assert.equal(await publishEaMaleClubBatch(pool, plan, 1, { kind: "disposable" }, clubApproval), "PUBLISHED")
  assert.equal(await publishEaMaleClubBatch(pool, plan, 1, { kind: "disposable" }, clubApproval), "ALREADY_PUBLISHED")
  await rollbackEaMaleClub(pool, "1100")
  await rollbackEaMaleClub(pool, "1100")
  await rollbackEaMaleEntry(pool, candidate.eaPlayerId)
  await rollbackEaMaleEntry(pool, candidate.eaPlayerId)
  const original = await pool.query<{ name: string; visibility: string }>(
    'SELECT name,"eaImportVisibility" AS visibility FROM "Player" WHERE id=$1', [originalId])
  assert.deepEqual(original.rows[0], { name: "Original Player", visibility: "PUBLIC" })
  const economic = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM "PlayerEconomicCurrent"')
  assert.equal(economic.rows[0].count, "0")
  console.log("PG17_FOCUSED_IMPORT_PASS")
} finally { await pool.end() }
