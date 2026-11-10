import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import type { Pool } from "pg"
import { publishEaMaleBatch, publishEaMaleClubBatch, stageEaMaleBatch, stageEaMaleClubBatch,
  validateEaMaleManifest, type EaMaleManifest } from "../../../services/eaMaleImportBatches"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const fields = [
  "pace", "acceleration", "sprintSpeed", "shooting", "positioning", "finishing", "shotPower", "longShots",
  "volleys", "penalties", "passing", "vision", "crossing", "freeKickAccuracy", "shortPassing", "longPassing",
  "curve", "dribbling", "agility", "balance", "reactions", "ballControl", "dribblingStat", "composure",
  "defending", "interceptions", "headingAccuracy", "defensiveAwareness", "standingTackle", "slidingTackle",
  "physical", "jumping", "stamina", "strength", "aggression", "gkDiving", "gkHandling", "gkKicking",
  "gkPositioning", "gkReflexes",
]

function fixture(): EaMaleManifest {
  const content = {
    eaPlayerId: "12345", name: "Jogador Exemplo", dateOfBirth: "2000-01-01", primaryPosition: "ATA",
    overall: 70, potential: 75, attributes: Object.fromEntries(fields.map(field => [field, 50])),
    club: { eaTeamId: "456" }, clubStatus: "KNOWN_CLUB" as const, issues: [],
  }
  const candidate = { ...content, contentHash: hash(JSON.stringify(content)) }
  return {
    source: { commit: "fixture", binarySha256: "a".repeat(64), rosterDate: null, rightsForPublicUse: "UNVERIFIED" },
    selectionHash: hash(candidate.contentHash), candidates: [candidate],
    batches: [{ id: "known-001", status: "PREPARED_NO_WRITE", clubStatus: "KNOWN_CLUB",
      count: 1, eaPlayerIds: ["12345"], batchHash: hash(candidate.contentHash), publicationAllowed: false }],
  }
}

test("accepts intact manifest and refuses tampered attributes or special squads", () => {
  const valid = fixture()
  assert.equal(validateEaMaleManifest(valid).size, 1)
  valid.candidates[0].attributes.pace = 99
  assert.throws(() => validateEaMaleManifest(valid), /CANDIDATE_HASH_MISMATCH/)
  const special = fixture()
  special.batches[0].clubStatus = "SPECIAL_OR_UNKNOWN_TEAM"
  assert.throws(() => validateEaMaleManifest(special), /BATCH_MEMBERSHIP_INVALID/)
})

test("creates only a staged player and receipt in one transaction; replay skips writes", async () => {
  const statements: string[] = []
  let committed = false
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
      if (sql.startsWith("SELECT \"batchHash\"")) return { rows: committed ? [{ batchHash: fixture().batches[0].batchHash, status: "STAGED" }] : [] }
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: "1" }] }
      if (sql.startsWith('SELECT id FROM "Club"')) return { rows: [{ id: "club-1" }] }
      if (sql.startsWith('SELECT id FROM "Player"')) return { rows: [], rowCount: 0 }
      if (sql === "COMMIT") committed = true
      return { rows: [], rowCount: 1 }
    },
    release: () => {},
  }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleBatch(pool, fixture(), "known-001"), "STAGED")
  assert.ok(statements.some(sql => sql.startsWith('INSERT INTO "Player"') && sql.includes('"eaImportVisibility"')))
  const inserts = statements.filter(sql => sql.startsWith("INSERT INTO")).length
  assert.equal(await stageEaMaleBatch(pool, fixture(), "known-001"), "ALREADY_STAGED")
  assert.equal(statements.filter(sql => sql.startsWith("INSERT INTO")).length, inserts)
})

test("abort rolls back when EA identity or club changed", async () => {
  const statements: string[] = []
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
      if (sql.startsWith("SELECT \"batchHash\"")) return { rows: [] }
      if (sql.startsWith('SELECT id FROM "Player" WHERE "externalId"')) return { rows: [{ id: "existing" }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    }, release: () => {},
  }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  await assert.rejects(stageEaMaleBatch(pool, fixture(), "known-001"), /PLAYER_EA_ID_ALREADY_PRESENT/)
  assert.equal(statements.at(-1), "ROLLBACK")
})

test("refuses any target other than the local disposable database", async () => {
  const statements: string[] = []
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "production", host: "127.0.0.1" }] }
      return { rows: [], rowCount: 1 }
    }, release: () => {},
  }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  await assert.rejects(stageEaMaleBatch(pool, fixture(), "known-001"), /DISPOSABLE_DATABASE_REQUIRED/)
  assert.deepEqual(statements, ["BEGIN ISOLATION LEVEL SERIALIZABLE",
    'SELECT current_database() AS database, host(inet_server_addr()) AS host', "ROLLBACK"])
})

test("publication requires explicit approval tied to the frozen source", async () => {
  let connected = false
  const pool = { connect: async () => { connected = true; throw new Error("SHOULD_NOT_CONNECT") } } as unknown as Pick<Pool, "connect">
  const manifest = fixture()
  await assert.rejects(publishEaMaleBatch(pool, manifest, "known-001", { kind: "disposable" }, {
    selectionHash: "b".repeat(64), sourceBinarySha256: manifest.source.binarySha256,
    rightsForPublicUse: "APPROVED", undatedRosterAcknowledged: true,
  }), /PUBLICATION_APPROVAL_MISMATCH/)
  assert.equal(connected, false)
})

test("publication rejects changed club identity and rolls back", async () => {
  const manifest = fixture()
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleImportBatch"')) return { rows: [{ batchHash: manifest.batches[0].batchHash,
      selectionHash: manifest.selectionHash, status: "STAGED" }] }
    if (sql.includes('FROM "EaMaleImportEntry" e JOIN')) return { rows: [{ externalId: "12345", playerId: "p1",
      contentHash: manifest.candidates[0].contentHash, clubExternalId: "456", status: "STAGED",
      playerExternalId: "12345", visibility: "STAGED", playerClubId: "wrong", mappedClubId: "correct" }] }
    return { rows: [], rowCount: 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  await assert.rejects(publishEaMaleBatch(pool, manifest, "known-001", { kind: "disposable" }, {
    selectionHash: manifest.selectionHash, sourceBinarySha256: manifest.source.binarySha256,
    rightsForPublicUse: "APPROVED", undatedRosterAcknowledged: true,
  }), /IMPORT_IDENTITY_OR_CLUB_MISMATCH/)
  assert.equal(statements.at(-1), "ROLLBACK")
  assert.ok(!statements.some(sql => sql.startsWith('UPDATE "Player"')))
})

test("club staging excludes unresolved homonym and never makes a club public", async () => {
  const rows = Array.from({ length: 127 }, (_, i) => ({ eaTeamId: String(i + 1), name: `Club ${i + 1}`,
    leagueId: "7", leagueName: "Liga", country: "Testland", missingMalePlayersLinked: 1,
    identityStatus: i === 126 ? "HOMONYM_REVIEW" : "EA_ID_ABSENT" }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const statements: { sql: string; args: unknown[] }[] = []
  const client = { query: async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args })
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League"')) return { rows: [{ id: "league-7", country: "Testland" }] }
    return { rows: [], rowCount: sql.startsWith("SELECT id") ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 1), "STAGED")
  const clubs = statements.filter(item => item.sql.startsWith('INSERT INTO "Club"'))
  assert.equal(clubs.length, 26)
  assert.ok(clubs.every(item => item.args[5] === "STAGED"))
  assert.ok(!clubs.some(item => item.args[1] === "127"))
  await assert.rejects(publishEaMaleClubBatch(pool, plan, 1, { kind: "disposable" }, {
    sourcePlanHash: "b".repeat(64), sourceBinarySha256: plan.sourceBinarySha256,
    rightsForPublicUse: "APPROVED", undatedRosterAcknowledged: true,
  }), /PUBLICATION_APPROVAL_MISMATCH/)
})
