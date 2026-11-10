import { createHash } from "node:crypto"
import type { Pool, PoolClient } from "pg"

export type NationalTeamSourceRow = {
  eaTeamId: string
  name: string
  countryName: string | null
  countrySlug: string | null
  countryMatchStatus: "EXPLICIT_FLAG_ALIAS" | "OFFICIAL_ASSOCIATION" | "REVIEW_REQUIRED"
  countryEvidence?: string
  sourceCommit: string
  sourceBinarySha256: string
  rosterDate: null
  rosterHash: string
  playerEaIds: string[]
  matchedPlayerCount: number
  absentPlayerCount: number
  publicationAllowed: false
  teamType: "MALE_NATIONAL"
  contentHash: string
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const invalid = (code: string): never => { throw new Error(code) }

export function validateNationalTeamSource(rows: readonly NationalTeamSourceRow[], manifestHash: string): void {
  if (rows.length !== 51 || !/^[a-f0-9]{64}$/.test(manifestHash)) invalid("NATIONAL_TEAM_MANIFEST_INVALID")
  const seenTeams = new Set<string>()
  const seenPlayers = new Set<string>()
  for (const row of rows) {
    const { contentHash, ...content } = row
    if (row.teamType !== "MALE_NATIONAL" || row.publicationAllowed !== false ||
      !/^\d+$/.test(row.eaTeamId) || seenTeams.has(row.eaTeamId) || !row.name.trim() ||
      !/^[a-f0-9]{64}$/.test(row.sourceBinarySha256) || row.rosterDate !== null ||
      (row.countrySlug === null) !== (row.countryName === null) ||
      (row.countryMatchStatus === "OFFICIAL_ASSOCIATION" &&
        (!row.countryEvidence?.startsWith("https://") || !row.countryName || !row.countrySlug)))
      invalid("NATIONAL_TEAM_ROW_INVALID")
    seenTeams.add(row.eaTeamId)
    if (sha256(JSON.stringify(content)) !== contentHash) invalid("NATIONAL_TEAM_CONTENT_HASH_MISMATCH")
    if (sha256(row.playerEaIds.join("\n")) !== row.rosterHash ||
      row.matchedPlayerCount + row.absentPlayerCount !== row.playerEaIds.length) invalid("NATIONAL_TEAM_ROSTER_HASH_MISMATCH")
    const perTeam = new Set<string>()
    for (const id of row.playerEaIds) {
      if (!/^\d+$/.test(id) || perTeam.has(id) || seenPlayers.has(id)) invalid("NATIONAL_TEAM_PLAYER_DUPLICATE")
      perTeam.add(id)
      seenPlayers.add(id)
    }
  }
  if (sha256(rows.map(row => row.contentHash).join("\n")) !== manifestHash)
    invalid("NATIONAL_TEAM_MANIFEST_HASH_MISMATCH")
}

async function requireDisposable(tx: PoolClient) {
  const result = await tx.query<{ database: string; host: string }>(
    "SELECT current_database() AS database, host(inet_server_addr()) AS host")
  if (result.rows[0]?.database !== "fc27_nat_test" || result.rows[0]?.host !== "127.0.0.1")
    invalid("NATIONAL_TEAM_DISPOSABLE_REQUIRED")
}

/** Transactional, idempotent staging only. Neither team nor roster is published here. */
export async function stageNationalTeam(pool: Pick<Pool, "connect">,
  rows: readonly NationalTeamSourceRow[], manifestHash: string,
  eaTeamId: string): Promise<"STAGED" | "ALREADY_STAGED"> {
  validateNationalTeamSource(rows, manifestHash)
  const row = rows.find(item => item.eaTeamId === eaTeamId) ?? invalid("NATIONAL_TEAM_NOT_FOUND")
  const rosterId = `${row.eaTeamId}:${row.rosterHash}`
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireDisposable(tx)
    await tx.query("SET LOCAL statement_timeout = '30s'")
    await tx.query("SET LOCAL lock_timeout = '5s'")
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`national-team:${row.eaTeamId}`])
    const priorTeam = await tx.query<{ name: string; countryKey: string | null }>(
      'SELECT name, "countryKey" FROM "NationalTeam" WHERE "eaTeamId" = $1', [row.eaTeamId])
    if (priorTeam.rows.length && (priorTeam.rows[0].name !== row.name ||
      priorTeam.rows[0].countryKey !== row.countrySlug)) invalid("NATIONAL_TEAM_IDENTITY_CHANGED")
    if (!priorTeam.rows.length) await tx.query(
      'INSERT INTO "NationalTeam" (id, "eaTeamId", name, "countryKey", "countryName") VALUES ($1,$2,$3,$4,$5)',
      [row.eaTeamId, row.eaTeamId, row.name, row.countrySlug, row.countryName])
    const priorRoster = await tx.query<{ status: string }>(
      'SELECT status FROM "NationalTeamRoster" WHERE id = $1', [rosterId])
    if (priorRoster.rows.length) {
      if (priorRoster.rows[0].status !== "STAGED") invalid("NATIONAL_TEAM_ROSTER_STATUS_CONFLICT")
      const count = await tx.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "NationalTeamRosterPlayer" WHERE "rosterId" = $1', [rosterId])
      if (Number(count.rows[0]?.count) !== row.playerEaIds.length) invalid("NATIONAL_TEAM_ROSTER_INCOMPLETE")
      await tx.query("COMMIT")
      return "ALREADY_STAGED"
    }
    await tx.query(
      'INSERT INTO "NationalTeamRoster" (id, "nationalTeamId", "rosterHash", "sourceVersion", "sourceCommit", "sourceBinarySha256", "rosterDate", status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [rosterId, row.eaTeamId, row.rosterHash, "FC27_BUNDLED_MAIN_UNDATED", row.sourceCommit,
        row.sourceBinarySha256, null, "STAGED"])
    const found = await tx.query<{ id: string; externalId: string }>(
      'SELECT id, "externalId" FROM "Player" WHERE "externalId" = ANY($1::text[])', [row.playerEaIds])
    const players = new Map(found.rows.map(item => [item.externalId, item.id]))
    for (const playerEaId of row.playerEaIds) {
      await tx.query(
        'INSERT INTO "NationalTeamRosterPlayer" ("rosterId", "playerEaId", "playerId", "sourceHash") VALUES ($1,$2,$3,$4)',
        [rosterId, playerEaId, players.get(playerEaId) ?? null,
          sha256(`${row.eaTeamId}:${playerEaId}:${row.rosterHash}`)])
    }
    const count = await tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "NationalTeamRosterPlayer" WHERE "rosterId" = $1', [rosterId])
    if (Number(count.rows[0]?.count) !== row.playerEaIds.length) invalid("NATIONAL_TEAM_ROSTER_READBACK_FAILED")
    await tx.query("COMMIT")
    return "STAGED"
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}

/** Attach newly imported players by EA ID; never changes club, nationality or economics. */
export async function reconcileStagedNationalTeamPlayers(pool: Pick<Pool, "connect">): Promise<number> {
  const tx = await pool.connect()
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await requireDisposable(tx)
    const updated = await tx.query(
      'UPDATE "NationalTeamRosterPlayer" r SET "playerId" = p.id FROM "Player" p, "NationalTeamRoster" v WHERE r."playerId" IS NULL AND p."externalId" = r."playerEaId" AND v.id = r."rosterId" AND v.status = $1',
      ["STAGED"])
    await tx.query("COMMIT")
    return updated.rowCount ?? 0
  } catch (error) { await tx.query("ROLLBACK"); throw error }
  finally { tx.release() }
}
