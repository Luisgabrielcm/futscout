import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { prisma } from "../lib/prisma"
import { parseManualPayload, type ClausePayload, type ContractPayload, type ManualPayload, type ManualSection, type SalaryPayload } from "../lib/adminEconomic"
import { adminPool } from "./adminAuth.server"
import type { PublishedWage } from "../lib/wagePublication"

export type ManualEconomic = { salary?: SalaryPayload; contract?: ContractPayload; clause?: ClausePayload; revisions: Partial<Record<ManualSection, number>> }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const canonical = (value: unknown): string => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

export async function readManualEconomics(playerIds: readonly string[], strict = false): Promise<Map<string, ManualEconomic>> {
  const result = new Map<string, ManualEconomic>()
  const ids = [...new Set(playerIds)]
  if (!ids.length) return result
  try {
    const rows = await prisma.$queryRaw<Array<{ playerId: string; section: ManualSection; revision: number; payload: ManualPayload }>>`
      SELECT "playerId","section","revision","payload" FROM "AdminEconomicPublic"
      WHERE "playerId"=ANY(${ids}::text[])`
    for (const row of rows) {
      try {
        const payload = parseManualPayload(row.section, row.payload)
        const entry = result.get(row.playerId) ?? { revisions: {} }
        if (row.section === "SALARY") entry.salary = payload as SalaryPayload
        if (row.section === "CONTRACT") entry.contract = payload as ContractPayload
        if (row.section === "CLAUSE") entry.clause = payload as ClausePayload
        entry.revisions[row.section] = row.revision
        result.set(row.playerId, entry)
      } catch { /* An invalid section never becomes public. */ }
    }
  } catch (error) {
    if (strict) throw error
    /* Before migration, existing public values remain available. */
  }
  return result
}

export function manualWage(playerId: string, manual: ManualEconomic | undefined): PublishedWage | undefined {
  const salary = manual?.salary
  if (!salary) return undefined
  return { playerId, weeklyEur: Number(salary.weeklyEur), kind: "MANUAL", source: "FutScout",
    classification: { taxType: salary.taxType, composition: salary.composition, method: "MANUAL_ENTRY" },
    period: null, confidence: "LOW", contractVerified: false }
}

export async function searchAdminPlayers(query: string) {
  const q = query.trim()
  if (q.length < 2 || q.length > 80) return []
  const rows = await adminPool().query<{ id: string; externalId: string; name: string; slug: string }>(
    'SELECT id,"externalId",name,slug FROM "Player" WHERE "externalId"=$1 OR name ILIKE $2 ORDER BY CASE WHEN "externalId"=$1 THEN 0 ELSE 1 END,name LIMIT 20',
    [q, `%${q.replace(/[\\%_]/g, "\\$&")}%`])
  return rows.rows
}

export async function readAdminPlayer(playerId: string) {
  const db = adminPool()
  const player = (await db.query<{ id: string; externalId: string; name: string; slug: string }>(
    'SELECT id,"externalId",name,slug FROM "Player" WHERE id=$1', [playerId])).rows[0]
  if (!player?.externalId) return null
  const heads = (await db.query<{ section: ManualSection; revision: number; payload: ManualPayload; id: string }>(
    'SELECT h.section,h.revision,r.payload,r.id FROM "AdminEconomicHead" h JOIN "AdminEconomicRevision" r ON r.id=h."revisionId" WHERE h."playerId"=$1',
    [playerId])).rows
  const history = (await db.query<{ section: ManualSection; revision: number; id: string; action: string; createdAt: Date }>(
    'SELECT section,revision,id,action,"createdAt" FROM "AdminEconomicRevision" WHERE "playerId"=$1 ORDER BY "createdAt" DESC LIMIT 30',
    [playerId])).rows
  return { ...player, sections: Object.fromEntries(heads.map(h => [h.section, h])), history }
}

export async function saveManualEconomic(input: { playerId: string; eaId: string; section: ManualSection; payload?: unknown;
  rollbackTo?: string; expectedRevision: number; requestId: string; actor: string }) {
  if (!/^[0-9]+$/.test(input.eaId) || !/^[a-f0-9-]{36}$/.test(input.requestId) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw Error("INVALID_EDIT")
  const db = adminPool()
  const client = await db.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    const player = (await client.query<{ id: string; externalId: string; slug: string }>(
      'SELECT id,"externalId",slug FROM "Player" WHERE id=$1 AND "externalId"=$2', [input.playerId, input.eaId])).rows[0]
    if (!player) throw Error("PLAYER_IDENTITY_MISMATCH")
    const existing = (await client.query<{ id: string; contentHash: string; revision: number; playerId: string; section: ManualSection }>(
      'SELECT id,"contentHash",revision,"playerId",section FROM "AdminEconomicRevision" WHERE "requestId"=$1', [input.requestId])).rows[0]
    if (existing) {
      if (existing.playerId !== input.playerId || existing.section !== input.section) throw Error("REQUEST_ID_REUSED")
      // A completed request is never accepted for a changed payload.
      const original = (await client.query<{ payload: ManualPayload; action: string }>(
        'SELECT payload,action FROM "AdminEconomicRevision" WHERE id=$1', [existing.id])).rows[0]
      const proposed = input.rollbackTo
        ? (await client.query<{ payload: ManualPayload }>('SELECT payload FROM "AdminEconomicRevision" WHERE id=$1 AND "playerId"=$2 AND section=$3',
          [input.rollbackTo,input.playerId,input.section])).rows[0]?.payload
        : parseManualPayload(input.section, input.payload)
      if (!original || (input.rollbackTo ? original.action !== "ROLLBACK" : original.action !== "EDIT") ||
          !proposed || canonical(original.payload) !== canonical(proposed))
        throw Error("REQUEST_ID_REUSED")
      const current = (await client.query<{ revisionId: string }>(
        'SELECT "revisionId" FROM "AdminEconomicHead" WHERE "playerId"=$1 AND section=$2',
        [input.playerId,input.section])).rows[0]
      if (current?.revisionId !== existing.id) throw Error("REQUEST_NOT_CURRENT")
      await client.query("COMMIT")
      return { revision: existing.revision, playerId: input.playerId, slug: player.slug, replay: true }
    }
    const head = (await client.query<{ revision: number; revisionId: string }>(
      'SELECT revision,"revisionId" FROM "AdminEconomicHead" WHERE "playerId"=$1 AND section=$2 FOR UPDATE',
      [input.playerId, input.section])).rows[0]
    if ((head?.revision ?? 0) !== input.expectedRevision) throw Error("ADMIN_REVISION_CONFLICT")
    let payload: ManualPayload
    if (input.rollbackTo) {
      const target = (await client.query<{ payload: ManualPayload }>(
        'SELECT payload FROM "AdminEconomicRevision" WHERE id=$1 AND "playerId"=$2 AND section=$3',
        [input.rollbackTo, input.playerId, input.section])).rows[0]
      if (!target) throw Error("ROLLBACK_TARGET_MISSING")
      payload = parseManualPayload(input.section, target.payload)
    } else payload = parseManualPayload(input.section, input.payload)
    const revision = input.expectedRevision + 1
    const id = randomUUID()
    const contentHash = hash({ playerId: input.playerId, eaId: input.eaId, section: input.section, revision, payload,
      priorId: head?.revisionId ?? null, action: input.rollbackTo ? "ROLLBACK" : "EDIT" })
    await client.query(`INSERT INTO "AdminEconomicRevision"
      (id,"playerId","eaId",section,revision,"requestId",action,payload,"contentHash","priorId",actor)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
    [id,input.playerId,input.eaId,input.section,revision,input.requestId,input.rollbackTo ? "ROLLBACK" : "EDIT",
      JSON.stringify(payload),contentHash,head?.revisionId ?? null,input.actor])
    if (head) {
      const updated = await client.query('UPDATE "AdminEconomicHead" SET "revisionId"=$1,revision=$2 WHERE "playerId"=$3 AND section=$4 AND revision=$5',
        [id,revision,input.playerId,input.section,input.expectedRevision])
      if (updated.rowCount !== 1) throw Error("ADMIN_REVISION_CONFLICT")
    } else await client.query('INSERT INTO "AdminEconomicHead" ("playerId",section,"revisionId",revision) VALUES ($1,$2,$3,$4)',
      [input.playerId,input.section,id,revision])
    const readBack = (await client.query<{ revisionId: string }>(
      'SELECT "revisionId" FROM "AdminEconomicHead" WHERE "playerId"=$1 AND section=$2', [input.playerId,input.section])).rows[0]
    if (readBack?.revisionId !== id) throw Error("ADMIN_READ_BACK_FAILED")
    await client.query("COMMIT")
    const persisted = (await client.query<{ revisionId: string }>(
      'SELECT "revisionId" FROM "AdminEconomicHead" WHERE "playerId"=$1 AND section=$2', [input.playerId,input.section])).rows[0]
    if (persisted?.revisionId !== id) throw Error("ADMIN_COMMIT_NOT_CONFIRMED")
    return { revision, playerId: input.playerId, slug: player.slug, replay: false }
  } catch (error) {
    try { await client.query("ROLLBACK") } catch { /* Commit outcome must be reconciled by requestId. */ }
    throw error
  } finally { client.release() }
}
