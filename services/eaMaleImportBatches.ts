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
        const found = await tx.query<{ id: string }>('SELECT id FROM "Club" WHERE "externalId" = $1', [row.club.eaTeamId])
        if (found.rows.length !== 1) fail("CLUB_MAPPING_CHANGED")
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

function clubPlanRows(plan: EaMaleClubPlan): ClubPlanRow[] {
  if (!/^[a-f0-9]{64}$/.test(plan.sha256) || sha256(plan.rawJsonl) !== plan.sha256 ||
    !/^[a-f0-9]{64}$/.test(plan.sourceBinarySha256)) fail("CLUB_PLAN_HASH_MISMATCH")
  const rows = plan.rawJsonl.trim().split(/\r?\n/).map(line => JSON.parse(line) as ClubPlanRow)
  if (rows.length !== 127 || new Set(rows.map(row => row.eaTeamId)).size !== rows.length ||
    rows.some(row => !/^\d+$/.test(row.eaTeamId) || !/^\d+$/.test(row.leagueId) ||
      !row.name?.trim() || !["EA_ID_ABSENT", "HOMONYM_REVIEW"].includes(row.identityStatus) ||
      !Number.isSafeInteger(row.missingMalePlayersLinked) || row.missingMalePlayersLinked < 0))
    fail("CLUB_PLAN_INVALID")
  return rows
}

/** Inserts at most 100 missing EA clubs, hidden until an independent publication step. */
export async function stageEaMaleClubBatch(pool: Pick<Pool, "connect">, plan: EaMaleClubPlan,
  batchIndex: number, target: EaMaleImportTarget = { kind: "disposable" }): Promise<"STAGED" | "ALREADY_STAGED"> {
  const all = clubPlanRows(plan).filter(row => row.identityStatus === "EA_ID_ABSENT")
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 1) fail("CLUB_BATCH_INVALID")
  const batch = all.slice(batchIndex * 100, (batchIndex + 1) * 100)
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireTarget(tx, target)
    await tx.query("SET LOCAL statement_timeout = '45s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ea-male-clubs:${plan.sha256}:${batchIndex}`])
    let existing = 0
    for (const row of batch) {
      const receipt = await tx.query<{ clubId: string; sourcePlanHash: string; sourceBinaryHash: string;
        leagueExternalId: string; status: string; externalId: string; visibility: string; leagueEaId: string }>(
        `SELECT e."clubId",e."sourcePlanHash",e."sourceBinaryHash",e."leagueExternalId",e.status,
          c."externalId",c."eaImportVisibility" AS visibility,l."externalId" AS "leagueEaId"
         FROM "EaMaleClubImportEntry" e JOIN "Club" c ON c.id=e."clubId"
         JOIN "League" l ON l.id=c."leagueId" WHERE e."eaTeamId"=$1 FOR UPDATE OF e,c`, [row.eaTeamId])
      if (receipt.rows.length) {
        const found = receipt.rows[0]
        if (found.sourcePlanHash !== plan.sha256 || found.sourceBinaryHash !== plan.sourceBinarySha256 ||
          found.leagueExternalId !== row.leagueId || found.externalId !== row.eaTeamId ||
          found.leagueEaId !== row.leagueId || found.status !== "STAGED" || found.visibility !== "STAGED")
          fail("CLUB_RECEIPT_CONFLICT")
        existing++
        continue
      }
      if ((await tx.query('SELECT id FROM "Club" WHERE "externalId"=$1', [row.eaTeamId])).rowCount)
        fail("CLUB_EA_ID_ALREADY_PRESENT")
      const leagues = await tx.query<{ id: string; country: string }>(
        'SELECT id,country FROM "League" WHERE "externalId"=$1', [row.leagueId])
      if (leagues.rows.length !== 1 || row.country &&
        leagues.rows[0].country.toLowerCase() !== row.country.toLowerCase()) fail("CLUB_LEAGUE_MAPPING_UNVERIFIED")
      const slug = slugFor({ name: row.name, eaPlayerId: row.eaTeamId } as EaMaleCandidate)
      if ((await tx.query('SELECT id FROM "Club" WHERE slug=$1', [slug])).rowCount) fail("CLUB_SLUG_CONFLICT")
      const clubId = randomUUID()
      await tx.query('INSERT INTO "Club" (id,"externalId",name,slug,"leagueId","eaImportVisibility","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
        [clubId, row.eaTeamId, row.name, slug, leagues.rows[0].id, "STAGED"])
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
    undatedRosterAcknowledged: true }): Promise<"PUBLISHED" | "ALREADY_PUBLISHED"> {
  const all = clubPlanRows(plan).filter(row => row.identityStatus === "EA_ID_ABSENT")
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 1) fail("CLUB_BATCH_INVALID")
  if (approval.sourcePlanHash !== plan.sha256 || approval.sourceBinarySha256 !== plan.sourceBinarySha256 ||
    approval.rightsForPublicUse !== "APPROVED" || approval.undatedRosterAcknowledged !== true)
    fail("PUBLICATION_APPROVAL_MISMATCH")
  const batch = all.slice(batchIndex * 100, (batchIndex + 1) * 100)
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
        visibility: string; leagueEaId: string }>(
        `SELECT e."clubId",e."sourcePlanHash",e."sourceBinaryHash",e."leagueExternalId",e.status,
          c."externalId",c.name,c."eaImportVisibility" AS visibility,l."externalId" AS "leagueEaId"
         FROM "EaMaleClubImportEntry" e JOIN "Club" c ON c.id=e."clubId"
         JOIN "League" l ON l.id=c."leagueId" WHERE e."eaTeamId"=$1 FOR UPDATE OF e,c`, [row.eaTeamId])
      const current = found.rows[0]
      if (found.rows.length !== 1 || current.sourcePlanHash !== plan.sha256 ||
        current.sourceBinaryHash !== plan.sourceBinarySha256 || current.leagueExternalId !== row.leagueId ||
        current.externalId !== row.eaTeamId || current.name !== row.name || current.leagueEaId !== row.leagueId)
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
