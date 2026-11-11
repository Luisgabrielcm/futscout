import { createHash, randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"

export type EaMaleCandidate = {
  eaPlayerId: string
  name: string
  dateOfBirth: string
  primaryPosition: string
  overall: number
  potential: number
  attributes: Record<string, number>
  club: { eaTeamId: string } | null
  clubStatus: "KNOWN_CLUB" | "CLUB_NOT_REGISTERED" | "FREE_AGENT_EA" | "SPECIAL_OR_UNKNOWN_TEAM"
  issues: string[]
  contentHash: string
}

export type EaMaleBatch = {
  id: string
  status: "PREPARED_NO_WRITE"
  clubStatus: EaMaleCandidate["clubStatus"]
  count: number
  eaPlayerIds: string[]
  batchHash: string
  publicationAllowed: false
}

export type EaMaleManifest = {
  source: { commit: string; binarySha256: string; rosterDate: string | null; rightsForPublicUse: string }
  selectionHash: string
  candidates: EaMaleCandidate[]
  batches: EaMaleBatch[]
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")
const rating = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 99
const attributeFields = [
  "pace", "acceleration", "sprintSpeed", "shooting", "positioning", "finishing", "shotPower", "longShots",
  "volleys", "penalties", "passing", "vision", "crossing", "freeKickAccuracy", "shortPassing", "longPassing",
  "curve", "dribbling", "agility", "balance", "reactions", "ballControl", "dribblingStat", "composure",
  "defending", "interceptions", "headingAccuracy", "defensiveAwareness", "standingTackle", "slidingTackle",
  "physical", "jumping", "stamina", "strength", "aggression",
] as const
const keeperFields = ["gkDiving", "gkHandling", "gkKicking", "gkPositioning", "gkReflexes"] as const

function fail(code: string): never { throw new Error(code) }
export type EaMaleImportTarget =
  | { kind: "disposable" }
  | { kind: "production"; database: string; databaseOid: string; clusterId: string; user: string }

export type EaMalePublicationApproval = {
  selectionHash: string
  sourceBinarySha256: string
  rightsForPublicUse: "APPROVED"
  undatedRosterAcknowledged: true
}

async function requireTarget(tx: PoolClient, expected: EaMaleImportTarget): Promise<void> {
  if (expected.kind === "disposable") {
    const target = await tx.query<{ database: string; host: string }>(
      'SELECT current_database() AS database, host(inet_server_addr()) AS host')
    if (target.rows[0]?.database !== "fc27_test" || target.rows[0]?.host !== "127.0.0.1")
      fail("DISPOSABLE_DATABASE_REQUIRED")
    return
  }
  if (!expected.database || !/^\d+$/.test(expected.databaseOid) || !/^\d+$/.test(expected.clusterId) || !expected.user)
    fail("PRODUCTION_TARGET_ATTESTATION_REQUIRED")
  const target = await tx.query<{ database: string; databaseOid: string; clusterId: string; user: string }>(
    `SELECT current_database() AS database,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid",
      (pg_control_system()).system_identifier::text AS "clusterId", current_user AS "user"`)
  const actual = target.rows[0]
  if (!actual || actual.database !== expected.database || actual.databaseOid !== expected.databaseOid ||
    actual.clusterId !== expected.clusterId || actual.user !== expected.user) fail("PRODUCTION_TARGET_MISMATCH")
}
function slugFor(candidate: EaMaleCandidate): string {
  const base = candidate.name.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `${base || "jogador"}-${candidate.eaPlayerId}`
}

export function validateEaMaleManifest(manifest: EaMaleManifest): Map<string, EaMaleCandidate> {
  if (!/^[a-f0-9]{64}$/.test(manifest.source.binarySha256) || !/^[a-f0-9]{64}$/.test(manifest.selectionHash))
    fail("SOURCE_HASH_INVALID")
  const byId = new Map<string, EaMaleCandidate>()
  for (const candidate of manifest.candidates) {
    if (!/^\d+$/.test(candidate.eaPlayerId) || byId.has(candidate.eaPlayerId)) fail("SOURCE_ID_INVALID_OR_DUPLICATE")
    const { contentHash, ...content } = candidate
    if (sha256(JSON.stringify(content)) !== contentHash) fail("CANDIDATE_HASH_MISMATCH")
    if (!candidate.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.dateOfBirth) ||
      !rating(candidate.overall) || !rating(candidate.potential) ||
      [...attributeFields, ...keeperFields].some(field => !rating(candidate.attributes[field]))) fail("CANDIDATE_DATA_INVALID")
    byId.set(candidate.eaPlayerId, candidate)
  }
  if (sha256(manifest.candidates.map(candidate => candidate.contentHash).join("\n")) !== manifest.selectionHash)
    fail("SELECTION_HASH_MISMATCH")
  const batched = new Set<string>()
  for (const batch of manifest.batches) {
    if (batch.status !== "PREPARED_NO_WRITE" || batch.publicationAllowed !== false ||
      batch.count !== batch.eaPlayerIds.length || batch.count < 1 || batch.count > 100) fail("BATCH_INVALID")
    const rows = batch.eaPlayerIds.map(id => {
      const candidate = byId.get(id)
      if (!candidate || batched.has(id) || candidate.clubStatus !== batch.clubStatus ||
        candidate.clubStatus === "SPECIAL_OR_UNKNOWN_TEAM") fail("BATCH_MEMBERSHIP_INVALID")
      batched.add(id)
      return candidate
    })
    if (sha256(rows.map(row => row.contentHash).join("\n")) !== batch.batchHash) fail("BATCH_HASH_MISMATCH")
  }
  if ([...byId.values()].some(row => row.clubStatus !== "SPECIAL_OR_UNKNOWN_TEAM" && !batched.has(row.eaPlayerId)))
    fail("BATCH_COVERAGE_INCOMPLETE")
  return byId
}

/** Staging-only: imported rows remain hidden. Public promotion requires a separate, approved step. */
export async function stageEaMaleBatch(pool: Pick<Pool, "connect">, manifest: EaMaleManifest,
  batchId: string, target: EaMaleImportTarget = { kind: "disposable" }): Promise<"STAGED" | "ALREADY_STAGED"> {
  const byId = validateEaMaleManifest(manifest)
  const batch = manifest.batches.find(item => item.id === batchId) ?? fail("BATCH_NOT_FOUND")
  const tx: PoolClient = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ea-male-import:${batch.id}`])
    const prior = await tx.query<{ batchHash: string; status: string }>(
      'SELECT "batchHash", status FROM "EaMaleImportBatch" WHERE "batchId" = $1', [batch.id])
    if (prior.rows.length) {
      if (prior.rows[0].batchHash !== batch.batchHash || prior.rows[0].status !== "STAGED") fail("BATCH_RECEIPT_CONFLICT")
      const count = await tx.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "EaMaleImportEntry" WHERE "batchId" = $1', [batch.id])
      if (Number(count.rows[0].count) !== batch.count) fail("BATCH_RECEIPT_INCOMPLETE")
      await tx.query("COMMIT")
      return "ALREADY_STAGED"
    }
    await tx.query(
      'INSERT INTO "EaMaleImportBatch" ("batchId", "batchHash", "selectionHash", "sourceBinaryHash", "sourceCommit", "clubStatus", status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [batch.id, batch.batchHash, manifest.selectionHash, manifest.source.binarySha256,
        manifest.source.commit, batch.clubStatus, "STAGED"])
    for (const externalId of batch.eaPlayerIds) {
      const row = byId.get(externalId)!
      const existing = await tx.query('SELECT id FROM "Player" WHERE "externalId" = $1', [externalId])
      if (existing.rowCount) fail("PLAYER_EA_ID_ALREADY_PRESENT")
      const slug = slugFor(row)
      const slugOwner = await tx.query('SELECT id FROM "Player" WHERE slug = $1', [slug])
      if (slugOwner.rowCount) fail("PLAYER_SLUG_CONFLICT")
      let clubId: string | null = null
      if (row.clubStatus === "KNOWN_CLUB" || row.clubStatus === "CLUB_NOT_REGISTERED") {
        if (!row.club?.eaTeamId) fail("CLUB_ID_MISSING")
        const found = await tx.query<{ id: string; eaImportVisibility: string }>(
          'SELECT id,"eaImportVisibility" FROM "Club" WHERE "externalId" = $1', [row.club.eaTeamId])
        if (found.rows.length !== 1 || !["PUBLIC", "STAGED"].includes(found.rows[0].eaImportVisibility))
          fail("CLUB_MAPPING_CHANGED")
        clubId = found.rows[0].id
      }
      const playerId = randomUUID()
      await tx.query('INSERT INTO "Player" (id, "externalId", slug, name, "dateOfBirth", position, "officialOverall", potential, "clubId", "eaImportVisibility", "eaFreeAgentEvidence", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())',
        [playerId, externalId, slug, row.name, row.dateOfBirth, row.primaryPosition, row.overall,
          row.potential, clubId, "STAGED", row.clubStatus === "FREE_AGENT_EA" ? "SOURCE_POSSIBLE" : "UNKNOWN"])
      const columns = ["id", "playerId", ...attributeFields, "createdAt", "updatedAt"]
      const placeholders = columns.map((_, index) => index === 0 ? "$1" : index === 1 ? "$2" :
        index >= columns.length - 2 ? "now()" : `$${index + 1}`)
      await tx.query(`INSERT INTO "PlayerAttributes" (${columns.map(col => `"${col}"`).join(",")}) VALUES (${placeholders.join(",")})`,
        [randomUUID(), playerId, ...attributeFields.map(field => row.attributes[field])])
      if (row.primaryPosition === "GOL") {
        await tx.query('INSERT INTO "PlayerGoalkeeperAttributes" (id, "playerId", diving, handling, kicking, positioning, reflexes, provider, "observedAt", "payloadHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,now(),now())',
          [randomUUID(), playerId, ...keeperFields.map(field => row.attributes[field]),
            "ea-fc27-bundled-db", row.contentHash])
      }
      await tx.query('INSERT INTO "EaMaleImportEntry" ("batchId", "externalId", "playerId", "contentHash", "clubExternalId", "clubStatus", status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [batch.id, externalId, playerId, row.contentHash, row.club?.eaTeamId ?? null, row.clubStatus, "STAGED"])
      await tx.query('INSERT INTO "EaMaleImportEvent" ("eventId", "batchId", "externalId", action, "contentHash") VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), batch.id, externalId, "STAGED", row.contentHash])
    }
    const check = await tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "EaMaleImportEntry" WHERE "batchId" = $1 AND status = $2', [batch.id, "STAGED"])
    if (Number(check.rows[0].count) !== batch.count) fail("BATCH_READBACK_MISMATCH")
    await tx.query("COMMIT")
    return "STAGED"
  } catch (error) {
    await tx.query("ROLLBACK")
    throw error
  } finally { tx.release() }
}

/** Makes one verified, club-linked staged batch visible atomically. */
export async function publishEaMaleBatch(pool: Pick<Pool, "connect">, manifest: EaMaleManifest,
  batchId: string, target: EaMaleImportTarget,
  approval: EaMalePublicationApproval): Promise<"PUBLISHED" | "ALREADY_PUBLISHED"> {
  const byId = validateEaMaleManifest(manifest)
  const batch = manifest.batches.find(item => item.id === batchId) ?? fail("BATCH_NOT_FOUND")
  if (batch.clubStatus !== "KNOWN_CLUB" && batch.clubStatus !== "CLUB_NOT_REGISTERED")
    fail("CLUB_CONTEXT_NOT_PUBLISHABLE")
  if (approval.rightsForPublicUse !== "APPROVED" || approval.undatedRosterAcknowledged !== true ||
    approval.selectionHash !== manifest.selectionHash ||
    approval.sourceBinarySha256 !== manifest.source.binarySha256) fail("PUBLICATION_APPROVAL_MISMATCH")
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ea-male-import:${batch.id}`])
    const receipt = await tx.query<{ batchHash: string; selectionHash: string; status: string }>(
      'SELECT "batchHash", "selectionHash", status FROM "EaMaleImportBatch" WHERE "batchId"=$1 FOR UPDATE', [batch.id])
    if (receipt.rows.length !== 1 || receipt.rows[0].batchHash !== batch.batchHash ||
      receipt.rows[0].selectionHash !== manifest.selectionHash || receipt.rows[0].status !== "STAGED")
      fail("BATCH_RECEIPT_CONFLICT")
    const entries = await tx.query<{ externalId: string; playerId: string; contentHash: string; clubExternalId: string | null; status: string;
      playerExternalId: string; visibility: string; playerClubId: string | null; mappedClubId: string | null;
      clubVisibility: string | null }>(
      `SELECT e."externalId",e."playerId",e."contentHash",e."clubExternalId",e.status,
        p."externalId" AS "playerExternalId",p."eaImportVisibility" AS visibility,p."clubId" AS "playerClubId",
        c.id AS "mappedClubId",c."eaImportVisibility" AS "clubVisibility"
       FROM "EaMaleImportEntry" e JOIN "Player" p ON p.id=e."playerId"
       LEFT JOIN "Club" c ON c."externalId"=e."clubExternalId"
       WHERE e."batchId"=$1 ORDER BY e."externalId" FOR UPDATE OF e,p`, [batch.id])
    if (entries.rows.length !== batch.count) fail("BATCH_RECEIPT_INCOMPLETE")
    const entriesById = new Map(entries.rows.map(row => [row.externalId, row]))
    let already = 0
    for (const externalId of batch.eaPlayerIds) {
      const source = byId.get(externalId)!
      const row = entriesById.get(externalId)
      if (!row || row.contentHash !== source.contentHash || row.playerExternalId !== externalId ||
        row.clubExternalId !== source.club?.eaTeamId || !row.mappedClubId || row.clubVisibility !== "PUBLIC" ||
        row.playerClubId !== row.mappedClubId) fail("IMPORT_IDENTITY_OR_CLUB_MISMATCH")
      if (row.status === "PUBLISHED" && row.visibility === "PUBLIC") { already++; continue }
      if (row.status !== "STAGED" || row.visibility !== "STAGED") fail("IMPORT_VISIBILITY_CONFLICT")
    }
    if (already === batch.count) { await tx.query("COMMIT"); return "ALREADY_PUBLISHED" }
    if (already !== 0) fail("PARTIAL_PUBLICATION_CONFLICT")
    for (const externalId of batch.eaPlayerIds) {
      const row = entriesById.get(externalId)!
      const changed = await tx.query(
        'UPDATE "Player" SET "eaImportVisibility"=$1,"updatedAt"=now() WHERE id=$2 AND "externalId"=$3 AND "eaImportVisibility"=$4',
        ["PUBLIC", row.playerId, externalId, "STAGED"])
      if (changed.rowCount !== 1) fail("IMPORT_PLAYER_CHANGED")
      const entryChanged = await tx.query('UPDATE "EaMaleImportEntry" SET status=$1,"publishedAt"=now() WHERE "externalId"=$2 AND status=$3',
        ["PUBLISHED", externalId, "STAGED"])
      if (entryChanged.rowCount !== 1) fail("IMPORT_ENTRY_CHANGED")
      await tx.query('INSERT INTO "EaMaleImportEvent" ("eventId","batchId","externalId",action,"contentHash") VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), batch.id, externalId, "PUBLISHED", row.contentHash])
    }
    const check = await tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "EaMaleImportEntry" e JOIN "Player" p ON p.id=e."playerId" WHERE e."batchId"=$1 AND e.status=$2 AND p."eaImportVisibility"=$3',
      [batch.id, "PUBLISHED", "PUBLIC"])
    if (Number(check.rows[0]?.count) !== batch.count) fail("PUBLICATION_READBACK_MISMATCH")
    await tx.query("COMMIT")
    return "PUBLISHED"
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}

/** Individual rollback retains the player and immutable receipt, but makes it invisible. */
export async function rollbackEaMaleEntry(pool: Pick<Pool, "connect">, externalId: string,
  target: EaMaleImportTarget = { kind: "disposable" }): Promise<void> {
  const tx: PoolClient = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    const found = await tx.query<{ playerId: string; status: string; batchId: string; contentHash: string }>(
      'SELECT "playerId", status, "batchId", "contentHash" FROM "EaMaleImportEntry" WHERE "externalId" = $1 FOR UPDATE', [externalId])
    if (found.rows.length !== 1) fail("IMPORT_ENTRY_NOT_FOUND")
    if (found.rows[0].status === "ROLLED_BACK") { await tx.query("COMMIT"); return }
    const changed = await tx.query('UPDATE "Player" SET "eaImportVisibility" = $1, "updatedAt" = now() WHERE id = $2 AND "externalId" = $3 AND "eaImportVisibility" = $4',
      ["ROLLED_BACK", found.rows[0].playerId, externalId, found.rows[0].status === "PUBLISHED" ? "PUBLIC" : "STAGED"])
    if (changed.rowCount !== 1) fail("IMPORT_PLAYER_CHANGED")
    await tx.query('UPDATE "EaMaleImportEntry" SET status = $1, "rolledBackAt" = now() WHERE "externalId" = $2',
      ["ROLLED_BACK", externalId])
    await tx.query('INSERT INTO "EaMaleImportEvent" ("eventId", "batchId", "externalId", action, "contentHash") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), found.rows[0].batchId, externalId, "ROLLED_BACK", found.rows[0].contentHash])
    await tx.query("COMMIT")
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}

type ClubPlanRow = {
  eaTeamId: string; name: string; leagueId: string; leagueName: string; country: string | null
  identityStatus: string; missingMalePlayersLinked: number
}
export type EaMaleClubPlan = { rawJsonl: string; sha256: string; sourceBinarySha256: string }
export type EaMaleClubLeagueMapping = { rawJson: string; sha256: string }
type ResolvedClubRow = ClubPlanRow & { targetLeagueId?: string; targetLeagueName?: string;
  supportingEaClubIds?: string[]; officialCountry?: string; officialEvidenceUrl?: string;
  identityEvidenceUrl?: string }

const officialStage3Clubs = new Map([
  ["264", { country: "Cyprus", league: "Liga Cyprus", sourceLeagueId: "76",
    url: "https://www.cfa.com.cy/Gr/clubprofile/68153713/41001" }],
  ["101097", { country: "Chile", league: "Liga Chile", sourceLeagueId: "1014",
    url: "https://www.campeonatochileno.cl/competition/liga-de-primera/" }],
  ["112116", { country: "Chile", league: "Liga Chile", sourceLeagueId: "1014",
    url: "https://www.campeonatochileno.cl/competition/liga-de-primera/" }],
  ["112705", { country: "Chile", league: "Liga Chile", sourceLeagueId: "1003",
    url: "https://www.campeonatochileno.cl/competition/liga-de-primera/" }],
])
const brazilStage3ClubIds = new Set([
  "383", "517", "567", "568", "569", "598", "1035", "1041", "1043", "1053",
  "1598", "1629", "111975", "112472",
])
const brazilLeague = { name: "Brasileirão Série A", slug: "brasileirao-serie-a",
  country: "Brazil", evidenceUrl: "https://www.cbf.com.br/futebol-brasileiro/times/campeonato-brasileiro/serie-a/2026" }
const stage4Leagues = [
  { ids: ["101101", "101103", "101104", "101105", "111722"], country: "Colombia", name: "Liga BetPlay",
    slug: "liga-betplay", url: "https://dimayor.com.co/liga-betplay-dimayor/" },
  { ids: ["110967", "114577", "115517"], country: "Bolivia", name: "División Profesional",
    slug: "division-profesional-bolivia", url: "https://fbf.com.bo/torneos/division-profesional/" },
  { ids: ["110982", "114578"], country: "Ecuador", name: "LigaPro Serie A",
    slug: "ligapro-serie-a-ecuador", url: "https://ligapro.ec/" },
  { ids: ["111012", "112659"], country: "Peru", name: "Liga 1",
    slug: "liga-1-peru", url: "https://liga1.pe/fixture-y-resultados-del-clausura-liga1-te-apuesto-2026/" },
  { ids: ["111325", "112112", "113143"], country: "Uruguay", name: "Liga AUF Uruguaya",
    slug: "liga-auf-uruguaya", url: "https://www.auf.org.uy/liga-auf-uruguaya/" },
  { ids: ["112853", "115693"], country: "Venezuela", name: "Liga FUTVE",
    slug: "liga-futve", url: "https://ligafutve.org/table/tabla-acumulada-liga-futve-temporada-2026/" },
  { ids: ["131826"], country: "Paraguay", name: "Copa de Primera",
    slug: "copa-de-primera-paraguay", url: "https://www.apf.org.py/noticias/todo-parejo-por-barrio-obrero" },
  { ids: ["112372"], country: "Bulgaria", name: "First League",
    slug: "first-league-bulgaria", url: "https://bfunion.bg/%D0%9F%D1%80%D0%BE%D1%84%D0%B5%D1%81%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%BD%D0%B8-%D1%84%D1%83%D1%82%D0%B1%D0%BE%D0%BB%D0%BD%D0%B8-%D0%BA%D0%BB%D1%83%D0%B1%D0%BE%D0%B2%D0%B5" },
  { ids: ["112638"], country: "Thailand", name: "Thai League 1",
    slug: "thai-league-1", url: "https://thaileague.co.th/standings/176" },
] as const
const stage4ByClub = new Map<string, (typeof stage4Leagues)[number]>(
  stage4Leagues.flatMap(league => league.ids.map(id => [id, league] as const)))
const nacionalIdentityEvidence = "https://www.cmtracker.net/pl/teams/15070300/111325"

function resolvedClubRows(plan: EaMaleClubPlan, mapping: EaMaleClubLeagueMapping | undefined,
  target: EaMaleImportTarget): ResolvedClubRow[] {
  const rows = clubPlanRows(plan)
  if (!mapping) {
    if (target.kind === "production") fail("PRIVATE_LEAGUE_MAPPING_REQUIRED")
    return rows.filter(row => row.identityStatus === "EA_ID_ABSENT")
  }
  if (!/^[a-f0-9]{64}$/.test(mapping.sha256) || sha256(mapping.rawJson) !== mapping.sha256)
    fail("CLUB_LEAGUE_MAPPING_HASH_MISMATCH")
  const data = JSON.parse(mapping.rawJson) as { sourcePlanHash: string; sourceBinaryHash: string;
    phase?: "DOMESTIC_02" | "MEXICO_02" | "OFFICIAL_03" | "BRAZIL_03" | "DOMESTIC_04";
    rows: Array<{ eaTeamId: string; sourceLeagueId: string; sourceLeagueName: string; sourceCountry: string | null;
      targetLeagueId: string | null; targetLeagueName: string | null; supportingEaClubIds: string[];
      classification: string; missingMalePlayersLinked: number; officialCountry?: string;
      officialEvidenceUrl?: string; identityEvidenceUrl?: string }> }
  if (data.sourcePlanHash !== plan.sha256 || data.sourceBinaryHash !== plan.sourceBinarySha256 ||
    data.rows?.length !== rows.length || new Set(data.rows.map(row => row.eaTeamId)).size !== rows.length)
    fail("CLUB_LEAGUE_MAPPING_SOURCE_MISMATCH")
  const phase = data.phase ?? "INITIAL"
  if (!["INITIAL", "DOMESTIC_02", "MEXICO_02", "OFFICIAL_03", "BRAZIL_03", "DOMESTIC_04"].includes(phase)) fail("CLUB_LEAGUE_MAPPING_PHASE_INVALID")
  const domesticLeagueIds = new Set(["17", "32", "54", "61", "2076"])
  const byId = new Map(data.rows.map(row => [row.eaTeamId, row]))
  const selected: ResolvedClubRow[] = []
  for (const row of rows) {
    const resolution = byId.get(row.eaTeamId)
    if (!resolution || resolution.sourceLeagueId !== String(row.leagueId) ||
      resolution.sourceLeagueName !== row.leagueName || resolution.sourceCountry !== row.country ||
      resolution.missingMalePlayersLinked !== row.missingMalePlayersLinked) fail("CLUB_LEAGUE_MAPPING_ROW_MISMATCH")
    const expected = phase === "BRAZIL_03" && brazilStage3ClubIds.has(row.eaTeamId)
      ? "LEAGUE_IDENTIFIED_BY_CBF_2026"
      : phase === "DOMESTIC_04" && stage4ByClub.has(row.eaTeamId)
      ? "LEAGUE_IDENTIFIED_BY_OFFICIAL_2026"
      : phase === "OFFICIAL_03" && officialStage3Clubs.has(row.eaTeamId)
      ? "LEAGUE_IDENTIFIED_BY_OFFICIAL_2026"
      : phase === "DOMESTIC_02" && domesticLeagueIds.has(String(row.leagueId))
      ? "LEAGUE_IDENTIFIED_BY_EA_ANCHOR"
      : phase === "MEXICO_02" && String(row.leagueId) === "341"
        ? "LEAGUE_IDENTIFIED_BY_EA_ID"
        : phase === "INITIAL" && resolution.classification === "LEAGUE_IDENTIFIED_BY_EA_ANCHOR"
          ? "LEAGUE_IDENTIFIED_BY_EA_ANCHOR" : null
    if (resolution.classification !== expected || expected === null) {
      if (expected !== null) fail("CLUB_LEAGUE_MAPPING_SELECTION_CHANGED")
      if (resolution.targetLeagueId !== null || resolution.targetLeagueName !== null ||
        resolution.supportingEaClubIds.length !== 0) fail("CLUB_LEAGUE_MAPPING_HELD_ROW_INVALID")
      continue
    }
    if (phase === "MEXICO_02") {
      if (row.identityStatus !== "EA_ID_ABSENT" || row.country !== "Mexico" ||
        resolution.targetLeagueId !== null || resolution.targetLeagueName !== "Liga MX" ||
        resolution.supportingEaClubIds.length !== 0) fail("CLUB_LEAGUE_MAPPING_EVIDENCE_INVALID")
      selected.push({ ...row, targetLeagueName: "Liga MX" })
      continue
    }
    if (phase === "DOMESTIC_04") {
      const official = stage4ByClub.get(row.eaTeamId)
      const id = resolution.targetLeagueId
      if (!official || !id || !/^[0-9a-f-]{36}$/.test(id) || row.country !== null ||
        !["EA_ID_ABSENT", "HOMONYM_REVIEW"].includes(row.identityStatus) ||
        (row.identityStatus === "HOMONYM_REVIEW") !== (row.eaTeamId === "111325") ||
        resolution.officialCountry !== official.country ||
        resolution.targetLeagueName !== official.name ||
        resolution.officialEvidenceUrl !== official.url ||
        resolution.supportingEaClubIds.length !== 0 ||
        (row.eaTeamId === "111325" && resolution.identityEvidenceUrl !== nacionalIdentityEvidence) ||
        (row.eaTeamId !== "111325" && resolution.identityEvidenceUrl != null))
        fail("CLUB_OFFICIAL_EVIDENCE_INVALID")
      selected.push({ ...row, targetLeagueId: id, targetLeagueName: official.name,
        officialCountry: official.country, officialEvidenceUrl: official.url,
        identityEvidenceUrl: resolution.identityEvidenceUrl })
      continue
    }
    if (phase === "OFFICIAL_03" || phase === "BRAZIL_03") {
      const official = phase === "OFFICIAL_03" ? officialStage3Clubs.get(row.eaTeamId) :
        brazilStage3ClubIds.has(row.eaTeamId) ? { country: brazilLeague.country,
          league: brazilLeague.name, sourceLeagueId: String(row.leagueId), url: brazilLeague.evidenceUrl } : undefined
      let evidence: URL
      try { evidence = new URL(resolution.officialEvidenceUrl ?? "") }
      catch { fail("CLUB_OFFICIAL_EVIDENCE_INVALID") }
      if (!official || row.identityStatus !== "EA_ID_ABSENT" || row.country !== null ||
        row.leagueId !== official.sourceLeagueId ||
        resolution.officialCountry !== official.country ||
        resolution.targetLeagueName !== official.league || !resolution.targetLeagueId ||
        resolution.supportingEaClubIds.length !== 0 || evidence.href !== official.url)
        fail("CLUB_OFFICIAL_EVIDENCE_INVALID")
      selected.push({ ...row, targetLeagueId: resolution.targetLeagueId,
        targetLeagueName: resolution.targetLeagueName, supportingEaClubIds: [],
        officialCountry: official.country, officialEvidenceUrl: evidence.href })
      continue
    }
    if (row.identityStatus !== "EA_ID_ABSENT" || !resolution.targetLeagueId ||
      !resolution.targetLeagueName?.trim() || !Array.isArray(resolution.supportingEaClubIds) ||
      resolution.supportingEaClubIds.length < 1 ||
      new Set(resolution.supportingEaClubIds).size !== resolution.supportingEaClubIds.length ||
      resolution.supportingEaClubIds.some(id => !/^\d+$/.test(id))) fail("CLUB_LEAGUE_MAPPING_EVIDENCE_INVALID")
    selected.push({ ...row, targetLeagueId: resolution.targetLeagueId,
      targetLeagueName: resolution.targetLeagueName, supportingEaClubIds: resolution.supportingEaClubIds })
  }
  if (selected.length !== (phase === "INITIAL" ? 55 : phase === "DOMESTIC_02" ? 16 :
    phase === "MEXICO_02" ? 18 : phase === "OFFICIAL_03" ? 4 :
      phase === "DOMESTIC_04" ? 20 : 14))
    fail("CLUB_LEAGUE_MAPPING_SELECTION_CHANGED")
  return selected
}

function clubPlanRows(plan: EaMaleClubPlan): ClubPlanRow[] {
  if (!/^[a-f0-9]{64}$/.test(plan.sha256) || sha256(plan.rawJsonl) !== plan.sha256 ||
    !/^[a-f0-9]{64}$/.test(plan.sourceBinarySha256)) fail("CLUB_PLAN_HASH_MISMATCH")
  const rows = plan.rawJsonl.trim().split(/\r?\n/).map(line => {
    const row = JSON.parse(line) as ClubPlanRow & { leagueId: string | number }
    return { ...row, leagueId: String(row.leagueId) }
  })
  if (rows.length !== 127 || new Set(rows.map(row => row.eaTeamId)).size !== rows.length ||
    rows.some(row => !/^\d+$/.test(row.eaTeamId) || !/^\d+$/.test(row.leagueId) ||
      !row.name?.trim() || !["EA_ID_ABSENT", "HOMONYM_REVIEW"].includes(row.identityStatus) ||
      !Number.isSafeInteger(row.missingMalePlayersLinked) || row.missingMalePlayersLinked < 0))
    fail("CLUB_PLAN_INVALID")
  return rows
}

async function requireClubLeague(tx: PoolClient, row: ResolvedClubRow): Promise<string> {
  if (!row.targetLeagueId) {
    const leagues = await tx.query<{ id: string; name: string; country: string }>(
      'SELECT id,name,country FROM "League" WHERE "externalId"=$1', [row.leagueId])
    if (leagues.rows.length !== 1 || row.country &&
      leagues.rows[0].country.toLowerCase() !== row.country.toLowerCase() ||
      row.targetLeagueName && leagues.rows[0].name !== row.targetLeagueName)
      fail("CLUB_LEAGUE_MAPPING_UNVERIFIED")
    return leagues.rows[0].id
  }
  const leagues = await tx.query<{ id: string; name: string; country: string }>(
    'SELECT id,name,country FROM "League" WHERE id=$1', [row.targetLeagueId])
  const league = leagues.rows[0]
  const expectedCountry = row.officialCountry ?? row.country
  if (leagues.rows.length !== 1 || league.name !== row.targetLeagueName ||
      league.country !== "Não informado" && expectedCountry && league.country.toLowerCase() !== expectedCountry.toLowerCase())
    fail("CLUB_LEAGUE_MAPPING_UNVERIFIED")
  if (row.officialEvidenceUrl) return league.id
  const anchors = await tx.query<{ externalId: string; leagueId: string }>(
    'SELECT "externalId","leagueId" FROM "Club" WHERE "externalId"=ANY($1::text[])', [row.supportingEaClubIds])
  if (anchors.rows.length !== row.supportingEaClubIds?.length ||
    anchors.rows.some(anchor => anchor.leagueId !== league.id)) fail("CLUB_LEAGUE_ANCHORS_CHANGED")
  return league.id
}

async function ensureMexicoLeague(tx: PoolClient, batch: ResolvedClubRow[]): Promise<void> {
  if (!batch.every(row => row.leagueId === "341" && row.country === "Mexico" &&
    row.targetLeagueName === "Liga MX")) return
  const found = await tx.query<{ externalId: string; name: string; slug: string; country: string }>(
    'SELECT "externalId",name,slug,country FROM "League" WHERE "externalId"=$1 OR slug=$2 OR name=$3 FOR UPDATE',
    ["341", "liga-mx", "Liga MX"])
  if (found.rows.length > 1 || found.rows.length === 1 &&
    (found.rows[0].externalId !== "341" || found.rows[0].name !== "Liga MX" ||
      found.rows[0].slug !== "liga-mx" || found.rows[0].country !== "Mexico"))
    fail("MEXICO_LEAGUE_CONFLICT")
  if (!found.rows.length) await tx.query(
    'INSERT INTO "League" (id,"externalId",name,slug,country,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now())',
    [randomUUID(), "341", "Liga MX", "liga-mx", "Mexico"])
}

async function ensureBrazilLeague(tx: PoolClient, batch: ResolvedClubRow[]): Promise<void> {
  if (!batch.every(row => row.officialCountry === brazilLeague.country &&
    row.targetLeagueName === brazilLeague.name && row.officialEvidenceUrl === brazilLeague.evidenceUrl &&
    row.targetLeagueId === batch[0].targetLeagueId)) return
  const id = batch[0].targetLeagueId
  if (!id) fail("BRAZIL_LEAGUE_ID_MISSING")
  const found = await tx.query<{ id: string; externalId: string | null; name: string; slug: string; country: string }>(
    'SELECT id,"externalId",name,slug,country FROM "League" WHERE id=$1 OR slug=$2 OR name=$3 FOR UPDATE',
    [id, brazilLeague.slug, brazilLeague.name])
  if (found.rows.length > 1 || found.rows.length === 1 &&
    (found.rows[0].id !== id || found.rows[0].externalId !== null ||
      found.rows[0].name !== brazilLeague.name || found.rows[0].slug !== brazilLeague.slug ||
      found.rows[0].country !== brazilLeague.country)) fail("BRAZIL_LEAGUE_CONFLICT")
  if (!found.rows.length) await tx.query(
    'INSERT INTO "League" (id,name,slug,country,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now())',
    [id, brazilLeague.name, brazilLeague.slug, brazilLeague.country])
}

async function ensureStage4Leagues(tx: PoolClient, batch: ResolvedClubRow[]): Promise<void> {
  const byLeague = new Map<string, { id: string; country: string; name: string; slug: string }>()
  for (const row of batch) {
    const official = stage4ByClub.get(row.eaTeamId)
    if (!official) return
    const id = row.targetLeagueId
    if (!id || row.officialEvidenceUrl !== official.url || row.targetLeagueName !== official.name ||
      row.officialCountry !== official.country) fail("STAGE4_LEAGUE_EVIDENCE_INVALID")
    const prior = byLeague.get(official.slug)
    if (prior && prior.id !== id) fail("STAGE4_LEAGUE_ID_CONFLICT")
    byLeague.set(official.slug, { id, name: official.name, slug: official.slug, country: official.country })
  }
  if (byLeague.size !== stage4Leagues.length) fail("STAGE4_LEAGUE_SET_INCOMPLETE")
  for (const league of byLeague.values()) {
    const found = await tx.query<{ id: string; externalId: string | null; name: string; slug: string; country: string }>(
      'SELECT id,"externalId",name,slug,country FROM "League" WHERE id=$1 OR slug=$2 OR name=$3 FOR UPDATE',
      [league.id, league.slug, league.name])
    if (found.rows.length > 1 || found.rows.length === 1 &&
      (found.rows[0].id !== league.id || found.rows[0].externalId !== null ||
        found.rows[0].name !== league.name || found.rows[0].slug !== league.slug ||
        found.rows[0].country !== league.country)) fail("STAGE4_LEAGUE_CONFLICT")
    if (!found.rows.length) await tx.query(
      'INSERT INTO "League" (id,name,slug,country,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now())',
      [league.id, league.name, league.slug, league.country])
  }
}

/** Inserts at most 100 missing EA clubs, hidden until an independent publication step. */
export async function stageEaMaleClubBatch(pool: Pick<Pool, "connect">, plan: EaMaleClubPlan,
  batchIndex: number, target: EaMaleImportTarget = { kind: "disposable" },
  mapping?: EaMaleClubLeagueMapping): Promise<"STAGED" | "ALREADY_STAGED"> {
  const all = resolvedClubRows(plan, mapping, target)
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 1) fail("CLUB_BATCH_INVALID")
  const batch = all.slice(batchIndex * 100, (batchIndex + 1) * 100)
  if (!batch.length) fail("CLUB_BATCH_EMPTY")
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ea-male-clubs:${plan.sha256}:${batchIndex}`])
    await ensureMexicoLeague(tx, batch)
    await ensureBrazilLeague(tx, batch)
    if (mapping && JSON.parse(mapping.rawJson).phase === "DOMESTIC_04") await ensureStage4Leagues(tx, batch)
    let existing = 0
    for (const row of batch) {
      const receipt = await tx.query<{ clubId: string; sourcePlanHash: string; sourceBinaryHash: string;
        leagueExternalId: string; status: string; externalId: string; visibility: string; leagueEaId: string; leagueDbId: string }>(
        `SELECT e."clubId",e."sourcePlanHash",e."sourceBinaryHash",e."leagueExternalId",e.status,
          c."externalId",c."eaImportVisibility" AS visibility,l."externalId" AS "leagueEaId",l.id AS "leagueDbId"
         FROM "EaMaleClubImportEntry" e JOIN "Club" c ON c.id=e."clubId"
         JOIN "League" l ON l.id=c."leagueId" WHERE e."eaTeamId"=$1 FOR UPDATE OF e,c`, [row.eaTeamId])
      if (receipt.rows.length) {
        const found = receipt.rows[0]
        await requireClubLeague(tx, row)
        if (found.sourcePlanHash !== plan.sha256 || found.sourceBinaryHash !== plan.sourceBinarySha256 ||
          found.leagueExternalId !== String(row.leagueId) || found.externalId !== row.eaTeamId ||
          (row.targetLeagueId ? found.leagueDbId !== row.targetLeagueId : found.leagueEaId !== String(row.leagueId)) ||
          found.status !== "STAGED" || found.visibility !== "STAGED")
          fail("CLUB_RECEIPT_CONFLICT")
        existing++
        continue
      }
      if ((await tx.query('SELECT id FROM "Club" WHERE "externalId"=$1', [row.eaTeamId])).rowCount)
        fail("CLUB_EA_ID_ALREADY_PRESENT")
      const leagueId = await requireClubLeague(tx, row)
      const slug = slugFor({ name: row.name, eaPlayerId: row.eaTeamId } as EaMaleCandidate)
      if ((await tx.query('SELECT id FROM "Club" WHERE slug=$1', [slug])).rowCount) fail("CLUB_SLUG_CONFLICT")
      const clubId = randomUUID()
      await tx.query('INSERT INTO "Club" (id,"externalId",name,slug,"leagueId","eaImportVisibility","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
        [clubId, row.eaTeamId, row.name, slug, leagueId, "STAGED"])
      await tx.query('INSERT INTO "EaMaleClubImportEntry" ("eaTeamId","clubId","sourcePlanHash","sourceBinaryHash","leagueExternalId",status) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.eaTeamId, clubId, plan.sha256, plan.sourceBinarySha256, row.leagueId, "STAGED"])
      await tx.query('INSERT INTO "EaMaleClubImportEvent" (id,"eaTeamId",action,"sourcePlanHash") VALUES ($1,$2,$3,$4)',
        [randomUUID(), row.eaTeamId, "STAGED", plan.sha256])
    }
    if (existing !== 0 && existing !== batch.length) fail("CLUB_BATCH_PARTIAL_RESTART")
    await tx.query("COMMIT")
    return existing === batch.length ? "ALREADY_STAGED" : "STAGED"
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}

export async function publishEaMaleClubBatch(pool: Pick<Pool, "connect">, plan: EaMaleClubPlan,
  batchIndex: number, target: EaMaleImportTarget,
  approval: { sourcePlanHash: string; sourceBinarySha256: string; rightsForPublicUse: "APPROVED";
    undatedRosterAcknowledged: true }, mapping?: EaMaleClubLeagueMapping): Promise<"PUBLISHED" | "ALREADY_PUBLISHED"> {
  const all = resolvedClubRows(plan, mapping, target)
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 1) fail("CLUB_BATCH_INVALID")
  if (approval.sourcePlanHash !== plan.sha256 || approval.sourceBinarySha256 !== plan.sourceBinarySha256 ||
    approval.rightsForPublicUse !== "APPROVED" || approval.undatedRosterAcknowledged !== true)
    fail("PUBLICATION_APPROVAL_MISMATCH")
  const batch = all.slice(batchIndex * 100, (batchIndex + 1) * 100)
  if (!batch.length) fail("CLUB_BATCH_EMPTY")
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ea-male-clubs:${plan.sha256}:${batchIndex}`])
    let published = 0
    for (const row of batch) {
      const found = await tx.query<{ clubId: string; sourcePlanHash: string; sourceBinaryHash: string;
        leagueExternalId: string; status: string; externalId: string; name: string;
        visibility: string; leagueEaId: string; leagueDbId: string }>(
        `SELECT e."clubId",e."sourcePlanHash",e."sourceBinaryHash",e."leagueExternalId",e.status,
          c."externalId",c.name,c."eaImportVisibility" AS visibility,l."externalId" AS "leagueEaId",l.id AS "leagueDbId"
         FROM "EaMaleClubImportEntry" e JOIN "Club" c ON c.id=e."clubId"
         JOIN "League" l ON l.id=c."leagueId" WHERE e."eaTeamId"=$1 FOR UPDATE OF e,c`, [row.eaTeamId])
      const current = found.rows[0]
      await requireClubLeague(tx, row)
      if (found.rows.length !== 1 || current.sourcePlanHash !== plan.sha256 ||
        current.sourceBinaryHash !== plan.sourceBinarySha256 || current.leagueExternalId !== String(row.leagueId) ||
        current.externalId !== row.eaTeamId || current.name !== row.name ||
        (row.targetLeagueId ? current.leagueDbId !== row.targetLeagueId : current.leagueEaId !== String(row.leagueId)))
        fail("CLUB_RECEIPT_CONFLICT")
      if (current.status === "PUBLISHED" && current.visibility === "PUBLIC") { published++; continue }
      if (current.status !== "STAGED" || current.visibility !== "STAGED") fail("CLUB_VISIBILITY_CONFLICT")
    }
    if (published === batch.length) { await tx.query("COMMIT"); return "ALREADY_PUBLISHED" }
    if (published !== 0) fail("CLUB_BATCH_PARTIAL_PUBLICATION")
    for (const row of batch) {
      const changed = await tx.query('UPDATE "Club" SET "eaImportVisibility"=$1,"updatedAt"=now() WHERE "externalId"=$2 AND "eaImportVisibility"=$3',
        ["PUBLIC", row.eaTeamId, "STAGED"])
      const entry = await tx.query('UPDATE "EaMaleClubImportEntry" SET status=$1,"publishedAt"=now() WHERE "eaTeamId"=$2 AND status=$3',
        ["PUBLISHED", row.eaTeamId, "STAGED"])
      if (changed.rowCount !== 1 || entry.rowCount !== 1) fail("CLUB_CHANGED")
      await tx.query('INSERT INTO "EaMaleClubImportEvent" (id,"eaTeamId",action,"sourcePlanHash") VALUES ($1,$2,$3,$4)',
        [randomUUID(), row.eaTeamId, "PUBLISHED", plan.sha256])
    }
    await tx.query("COMMIT")
    return "PUBLISHED"
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}

/** Keeps the club and its receipt, but removes it from public reads. */
export async function rollbackEaMaleClub(pool: Pick<Pool, "connect">, eaTeamId: string,
  target: EaMaleImportTarget = { kind: "disposable" }): Promise<void> {
  if (!/^\d+$/.test(eaTeamId)) fail("CLUB_EA_ID_INVALID")
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    const found = await tx.query<{ clubId: string; sourcePlanHash: string; status: string }>(
      'SELECT "clubId","sourcePlanHash",status FROM "EaMaleClubImportEntry" WHERE "eaTeamId"=$1 FOR UPDATE',
      [eaTeamId])
    if (found.rows.length !== 1) fail("CLUB_RECEIPT_NOT_FOUND")
    const row = found.rows[0]
    if (row.status === "ROLLED_BACK") { await tx.query("COMMIT"); return }
    const linked = await tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Player" WHERE "clubId"=$1 AND "eaImportVisibility"=$2',
      [row.clubId, "PUBLIC"])
    if (Number(linked.rows[0]?.count) !== 0) fail("CLUB_HAS_PUBLIC_PLAYERS")
    const changed = await tx.query('UPDATE "Club" SET "eaImportVisibility"=$1,"updatedAt"=now() WHERE id=$2 AND "externalId"=$3 AND "eaImportVisibility"=$4',
      ["ROLLED_BACK", row.clubId, eaTeamId, row.status === "PUBLISHED" ? "PUBLIC" : "STAGED"])
    const entry = await tx.query('UPDATE "EaMaleClubImportEntry" SET status=$1,"rolledBackAt"=now() WHERE "eaTeamId"=$2 AND status=$3',
      ["ROLLED_BACK", eaTeamId, row.status])
    if (changed.rowCount !== 1 || entry.rowCount !== 1) fail("CLUB_CHANGED")
    await tx.query('INSERT INTO "EaMaleClubImportEvent" (id,"eaTeamId",action,"sourcePlanHash") VALUES ($1,$2,$3,$4)',
      [randomUUID(), eaTeamId, "ROLLED_BACK", row.sourcePlanHash])
    await tx.query("COMMIT")
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}
