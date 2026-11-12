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
    sourceTeamLinks: [{ eaTeamId: "456", classification: "MALE_CLUB" }],
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

test("native EA club evidence blocks real-club substitution and unresolved NG-FA before any insert", async () => {
  for (const status of ["KNOWN_CLUB", "FREE_AGENT_EA"] as const) {
    const manifest = fixture()
    const row = manifest.candidates[0]
    row.sourceTeamLinks = [{ eaTeamId: "111592", classification: "SPECIAL" }]
    row.clubStatus = status
    if (status === "FREE_AGENT_EA") row.club = null
    const { contentHash: _old, ...content } = row
    assert.ok(_old)
    row.contentHash = hash(JSON.stringify(content))
    manifest.selectionHash = hash(row.contentHash)
    manifest.batches[0].batchHash = hash(row.contentHash)
    manifest.batches[0].clubStatus = status
    const statements: string[] = []
    const client = { query: async (sql: string) => {
      statements.push(sql)
      if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
      return { rows: [], rowCount: 0 }
    }, release: () => {} }
    await assert.rejects(stageEaMaleBatch({ connect: async () => client } as unknown as Pick<Pool, "connect">,
      manifest, "known-001"), status === "KNOWN_CLUB" ? /GAME_CLUB_NOT_IN_NATIVE_CLUB_LINKS/ : /NG_FA_REPRESENTATION_REQUIRES_REVIEW/)
    assert.equal(statements.some(sql => sql.startsWith("INSERT") || sql.startsWith("UPDATE")), false)
    assert.ok(statements.includes("ROLLBACK"))
  }
})

test("publication rejects native EA club mismatch before connecting", async () => {
  const manifest = fixture()
  const row = manifest.candidates[0]
  row.sourceTeamLinks = [{ eaTeamId: "111592", classification: "SPECIAL" }]
  const { contentHash: _old, ...content } = row
  assert.ok(_old)
  row.contentHash = hash(JSON.stringify(content))
  manifest.selectionHash = hash(row.contentHash); manifest.batches[0].batchHash = hash(row.contentHash)
  await assert.rejects(publishEaMaleBatch({ connect: async () => { throw new Error("MUST_NOT_CONNECT") } }, manifest,
    "known-001", { kind: "disposable" }, { rightsForPublicUse: "APPROVED", undatedRosterAcknowledged: true,
      selectionHash: manifest.selectionHash, sourceBinarySha256: manifest.source.binarySha256 }), /GAME_CLUB_NOT_IN_NATIVE_CLUB_LINKS/)
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
      if (sql.startsWith('SELECT id,"eaImportVisibility" FROM "Club"')) return {
        rows: [{ id: "club-1", eaImportVisibility: "PUBLIC" }] }
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

test("does not stage a player against a rolled-back club", async () => {
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.startsWith("SELECT \"batchHash\"")) return { rows: [] }
    if (sql.startsWith('SELECT id FROM "Player"')) return { rows: [], rowCount: 0 }
    if (sql.startsWith('SELECT id,"eaImportVisibility" FROM "Club"')) return {
      rows: [{ id: "club-1", eaImportVisibility: "ROLLED_BACK" }] }
    return { rows: [], rowCount: 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  await assert.rejects(stageEaMaleBatch(pool, fixture(), "known-001"), /CLUB_MAPPING_CHANGED/)
  assert.equal(statements.at(-1), "ROLLBACK")
  assert.ok(!statements.some(sql => sql.startsWith('INSERT INTO "Player"')))
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

function mappedClubs() {
  const rows = Array.from({ length: 127 }, (_, index) => ({ eaTeamId: String(index + 1),
    name: `Club ${index + 1}`, leagueId: "7", leagueName: "Source League", country: "Testland",
    missingMalePlayersLinked: 1, identityStatus: index === 126 ? "HOMONYM_REVIEW" : "EA_ID_ABSENT" }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const rawJson = JSON.stringify({ sourcePlanHash: plan.sha256, sourceBinaryHash: plan.sourceBinarySha256,
    rows: rows.map((row, index) => ({ eaTeamId: row.eaTeamId, sourceLeagueId: row.leagueId,
      sourceLeagueName: row.leagueName, sourceCountry: row.country, missingMalePlayersLinked: 1,
      targetLeagueId: index < 55 ? "league-7" : null, targetLeagueName: index < 55 ? "Target League" : null,
      supportingEaClubIds: index < 55 ? ["999"] : [],
      classification: index < 55 ? "LEAGUE_IDENTIFIED_BY_EA_ANCHOR" : "LEAGUE_REVIEW_REQUIRED" })) })
  return { plan, mapping: { rawJson, sha256: hash(rawJson) } }
}

test("frozen private league map stages only 55 EA-identified clubs without League.externalId", async () => {
  const { plan, mapping } = mappedClubs()
  const statements: Array<{ sql: string; args: unknown[] }> = []
  const client = { query: async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args })
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=')) return { rows: [{ id: "league-7", name: "Target League", country: "Não informado" }] }
    if (sql.includes('FROM "Club" WHERE "externalId"=ANY')) return { rows: [{ externalId: "999", leagueId: "league-7" }] }
    return { rows: [], rowCount: sql.startsWith("SELECT id") ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(statements.filter(item => item.sql.startsWith('INSERT INTO "Club"')).length, 55)
  assert.ok(statements.filter(item => item.sql.startsWith('INSERT INTO "Club"')).every(item => item.args[4] === "league-7" && item.args[5] === "STAGED"))
  assert.ok(!statements.some(item => item.sql.includes('FROM "League" WHERE "externalId"=')))
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 1, { kind: "disposable" }, mapping), /CLUB_BATCH_EMPTY/)
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "production", database: "x", databaseOid: "1", clusterId: "1", user: "u" }), /PRIVATE_LEAGUE_MAPPING_REQUIRED/)
  const tampered = { ...mapping, sha256: "0".repeat(64) }
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, tampered), /CLUB_LEAGUE_MAPPING_HASH_MISMATCH/)
})

test("changed EA club anchor aborts mapped staging before inserting a club", async () => {
  const { plan, mapping } = mappedClubs()
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=')) return { rows: [{ id: "league-7", name: "Target League", country: "Não informado" }] }
    if (sql.includes('FROM "Club" WHERE "externalId"=ANY')) return { rows: [{ externalId: "999", leagueId: "other-league" }] }
    return { rows: [], rowCount: 0 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), /CLUB_LEAGUE_ANCHORS_CHANGED/)
  assert.equal(statements.at(-1), "ROLLBACK")
  assert.ok(!statements.some(sql => sql.startsWith('INSERT INTO "Club"')))
})

test("second domestic phase stages only the 16 clubs with verified EA league anchors", async () => {
  const rows = Array.from({ length: 127 }, (_, index) => ({ eaTeamId: String(index + 1),
    name: `Club ${index + 1}`, leagueId: index < 16 ? "17" : "7", leagueName: "Source League",
    country: "France", missingMalePlayersLinked: 1, identityStatus: "EA_ID_ABSENT" }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const mapped = rows.map((row, index) => ({ eaTeamId: row.eaTeamId,
    sourceLeagueId: row.leagueId, sourceLeagueName: row.leagueName, sourceCountry: row.country,
    missingMalePlayersLinked: 1, targetLeagueId: index < 16 ? "league-17" : null,
    targetLeagueName: index < 16 ? "Ligue 2 BKT" : null,
    supportingEaClubIds: index < 16 ? ["999"] : [],
    classification: index < 16 ? "LEAGUE_IDENTIFIED_BY_EA_ANCHOR" : "HELD" }))
  const rawJson = JSON.stringify({ phase: "DOMESTIC_02", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  const mapping = { rawJson, sha256: hash(rawJson) }
  const inserts: string[] = []
  const client = { query: async (sql: string) => {
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=')) return { rows: [{ id: "league-17", name: "Ligue 2 BKT", country: "Não informado" }] }
    if (sql.includes('FROM "Club" WHERE "externalId"=ANY')) return { rows: [{ externalId: "999", leagueId: "league-17" }] }
    if (sql.startsWith('INSERT INTO "Club"')) inserts.push(sql)
    return { rows: [], rowCount: sql.startsWith('SELECT id FROM "Club"') ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(inserts.length, 16)
  mapped[0].classification = "HELD"
  const changed = JSON.stringify({ phase: "DOMESTIC_02", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" },
    { rawJson: changed, sha256: hash(changed) }), /CLUB_LEAGUE_MAPPING_SELECTION_CHANGED/)
})

test("Mexico phase requires the registered EA league ID, country and name", async () => {
  const rows = Array.from({ length: 127 }, (_, index) => ({ eaTeamId: String(index + 1),
    name: `Club ${index + 1}`, leagueId: index < 18 ? "341" : "7", leagueName: "Source League",
    country: index < 18 ? "Mexico" : "Other", missingMalePlayersLinked: 1,
    identityStatus: "EA_ID_ABSENT" }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const mapped = rows.map((row, index) => ({ eaTeamId: row.eaTeamId,
    sourceLeagueId: row.leagueId, sourceLeagueName: row.leagueName, sourceCountry: row.country,
    missingMalePlayersLinked: 1, targetLeagueId: null, targetLeagueName: index < 18 ? "Liga MX" : null,
    supportingEaClubIds: [], classification: index < 18 ? "LEAGUE_IDENTIFIED_BY_EA_ID" : "HELD" }))
  const rawJson = JSON.stringify({ phase: "MEXICO_02", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  const mapping = { rawJson, sha256: hash(rawJson) }
  const inserts: string[] = []
  const leagueInserts: string[] = []
  let leagueName = "Liga MX"
  let existingLeague = false
  const client = { query: async (sql: string) => {
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE "externalId"=$1 OR slug=')) return { rows: existingLeague ?
      [{ externalId: "341", name: leagueName, slug: "liga-mx", country: "Mexico" }] : [] }
    if (sql.includes('FROM "League" WHERE "externalId"=')) return { rows: [{ id: "league-341", name: leagueName, country: "Mexico" }] }
    if (sql.startsWith('INSERT INTO "League"')) leagueInserts.push(sql)
    if (sql.startsWith('INSERT INTO "Club"')) inserts.push(sql)
    return { rows: [], rowCount: sql.startsWith('SELECT id FROM "Club"') ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(inserts.length, 18)
  assert.equal(leagueInserts.length, 1)
  existingLeague = true
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(leagueInserts.length, 1)
  leagueName = "Wrong League"
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping),
    /MEXICO_LEAGUE_CONFLICT/)
})

test("official stage three accepts only four evidenced clubs and rejects a forged source", async () => {
  const ids = ["264", "101097", "112116", "112705"]
  const rows = Array.from({ length: 127 }, (_, index) => ({
    eaTeamId: ids[index] ?? String(300000 + index), name: `Club ${index}`,
    leagueId: index === 0 ? "76" : index === 1 || index === 2 ? "1014" : index === 3 ? "1003" : "7",
    leagueName: index < 4 ? "Continental" : "Other",
    country: null, missingMalePlayersLinked: 1, identityStatus: "EA_ID_ABSENT",
  }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const mapped = rows.map((row, index) => ({
    eaTeamId: row.eaTeamId, sourceLeagueId: row.leagueId,
    sourceLeagueName: row.leagueName, sourceCountry: row.country,
    missingMalePlayersLinked: 1,
    targetLeagueId: index < 4 ? index === 0 ? "cyprus" : "chile" : null,
    targetLeagueName: index < 4 ? index === 0 ? "Liga Cyprus" : "Liga Chile" : null,
    supportingEaClubIds: [],
    ...(index < 4 ? { officialCountry: index === 0 ? "Cyprus" : "Chile",
      officialEvidenceUrl: index === 0 ? "https://www.cfa.com.cy/Gr/clubprofile/68153713/41001" :
        "https://www.campeonatochileno.cl/competition/liga-de-primera/" } : {}),
    classification: index < 4 ? "LEAGUE_IDENTIFIED_BY_OFFICIAL_2026" : "STAGE3_HELD",
  }))
  const rawJson = JSON.stringify({ phase: "OFFICIAL_03", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  const mapping = { rawJson, sha256: hash(rawJson) }
  const inserts: string[] = []
  const client = { query: async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=')) return { rows: [{ id: args[0],
      name: args[0] === "cyprus" ? "Liga Cyprus" : "Liga Chile", country: "Não informado" }] }
    if (sql.startsWith('INSERT INTO "Club"')) inserts.push(sql)
    return { rows: [], rowCount: sql.startsWith('SELECT id FROM "Club"') ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(inserts.length, 4)
  mapped[0].officialEvidenceUrl = "https://example.com/forged"
  const invalid = JSON.stringify({ phase: "OFFICIAL_03", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" },
    { rawJson: invalid, sha256: hash(invalid) }), /CLUB_OFFICIAL_EVIDENCE_INVALID/)
})

test("Brazil stage three creates only the official domestic league and stages fourteen clubs", async () => {
  const ids = ["383", "517", "567", "568", "569", "598", "1035", "1041", "1043", "1053",
    "1598", "1629", "111975", "112472"]
  const rows = Array.from({ length: 127 }, (_, index) => ({
    eaTeamId: ids[index] ?? String(400000 + index), name: `Club ${index}`,
    leagueId: index < 14 ? "1003" : "7", leagueName: index < 14 ? "Libertadores" : "Other",
    country: null, missingMalePlayersLinked: 1, identityStatus: "EA_ID_ABSENT",
  }))
  const rawJsonl = rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  const plan = { rawJsonl, sha256: hash(rawJsonl), sourceBinarySha256: "a".repeat(64) }
  const cbf = "https://www.cbf.com.br/futebol-brasileiro/times/campeonato-brasileiro/serie-a/2026"
  const mapped = rows.map((row, index) => ({
    eaTeamId: row.eaTeamId, sourceLeagueId: row.leagueId,
    sourceLeagueName: row.leagueName, sourceCountry: row.country,
    missingMalePlayersLinked: 1, targetLeagueId: index < 14 ? "brazil-league" : null,
    targetLeagueName: index < 14 ? "Brasileirão Série A" : null,
    supportingEaClubIds: [],
    ...(index < 14 ? { officialCountry: "Brazil", officialEvidenceUrl: cbf } : {}),
    classification: index < 14 ? "LEAGUE_IDENTIFIED_BY_CBF_2026" : "STAGE3_HELD",
  }))
  const rawJson = JSON.stringify({ phase: "BRAZIL_03", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  const mapping = { rawJson, sha256: hash(rawJson) }
  const inserts: string[] = []
  const client = { query: async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT current_database()")) return { rows: [{ database: "fc27_test", host: "127.0.0.1" }] }
    if (sql.includes('FROM "EaMaleClubImportEntry"')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=$1 OR slug=')) return { rows: [] }
    if (sql.includes('FROM "League" WHERE id=')) return { rows: [{ id: args[0],
      name: "Brasileirão Série A", country: "Brazil" }] }
    if (sql.startsWith('INSERT INTO "League"') || sql.startsWith('INSERT INTO "Club"')) inserts.push(sql)
    return { rows: [], rowCount: sql.startsWith('SELECT id FROM "Club"') ? 0 : 1 }
  }, release: () => {} }
  const pool = { connect: async () => client } as unknown as Pick<Pool, "connect">
  assert.equal(await stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" }, mapping), "STAGED")
  assert.equal(inserts.filter(sql => sql.startsWith('INSERT INTO "League"')).length, 1)
  assert.equal(inserts.filter(sql => sql.startsWith('INSERT INTO "Club"')).length, 14)
  mapped[0].officialEvidenceUrl = "https://example.com/forged"
  const invalid = JSON.stringify({ phase: "BRAZIL_03", sourcePlanHash: plan.sha256,
    sourceBinaryHash: plan.sourceBinarySha256, rows: mapped })
  await assert.rejects(stageEaMaleClubBatch(pool, plan, 0, { kind: "disposable" },
    { rawJson: invalid, sha256: hash(invalid) }), /CLUB_OFFICIAL_EVIDENCE_INVALID/)
  assert.equal(inserts.filter(sql => sql.startsWith('INSERT INTO "Club"')).length, 14)
})
