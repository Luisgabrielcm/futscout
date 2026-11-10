import { randomUUID } from "node:crypto"
import type { Pool } from "pg"
import { parseResearchPayload, prepareResearchCommand, researchHash, type ResearchCommand, type ResearchPayload } from "../lib/researchEconomic"

type RevisionRow = { id: string; playerId: string; eaId: string; clubId: string; field: string; revision: number;
  requestHash: string; action: string; payload: ResearchPayload | null; classification: string;
  sourceUrl: string; sourcePublishedOn: string | null }
type HeadRow = { revisionId: string; revision: number }

/** No ambient credentials or HTTP endpoint. A trusted caller injects a dedicated pool. */
export function createResearchEconomicWriter(pool: Pick<Pool, "connect" | "query">) {
  return async (command: ResearchCommand) => {
    const prepared = prepareResearchCommand(command)
    const client = await pool.connect()
    let committed = false
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
      await client.query("SET LOCAL statement_timeout = '8s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'")
      const busy = (await client.query<{ admitted: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS admitted",
        [`research-economic:${command.playerId}:${command.field}`])).rows[0]
      if (!busy?.admitted) throw Error("RESEARCH_WRITE_BUSY")
      const priorRequest = (await client.query<RevisionRow>(
        'SELECT * FROM "ResearchEconomicRevision" WHERE "requestId"=$1', [command.requestId])).rows[0]
      if (priorRequest) {
        if (priorRequest.requestHash !== prepared.requestHash) throw Error("RESEARCH_REQUEST_REUSED")
        const head = (await client.query<HeadRow>(
          'SELECT "revisionId",revision FROM "ResearchEconomicHead" WHERE "playerId"=$1 AND field=$2',
          [command.playerId, command.field])).rows[0]
        await client.query("COMMIT")
        committed = true
        return { id: priorRequest.id, revision: priorRequest.revision, replay: true,
          publishedNow: head?.revisionId === priorRequest.id }
      }
      const player = (await client.query<{ id: string }>(
        'SELECT id FROM "Player" WHERE id=$1 AND "externalId"=$2 AND "clubId"=$3',
        [command.playerId, command.eaId, command.clubId])).rows[0]
      if (!player) throw Error("RESEARCH_PLAYER_OR_CLUB_MISMATCH")
      const manual = (await client.query<{ present: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM "AdminEconomicHead" WHERE "playerId"=$1 AND section=$2) AS present',
        [command.playerId, command.field])).rows[0]
      if (command.action !== "RECORD" && manual?.present) throw Error("RESEARCH_MANUAL_PRIORITY")
      const head = (await client.query<HeadRow>(
        'SELECT "revisionId",revision FROM "ResearchEconomicHead" WHERE "playerId"=$1 AND field=$2 FOR UPDATE',
        [command.playerId, command.field])).rows[0]
      if (command.action !== "RECORD" && (head?.revision ?? 0) !== command.expectedHeadRevision)
        throw Error("RESEARCH_HEAD_CONFLICT")
      const last = (await client.query<{ revision: number }>(
        'SELECT revision FROM "ResearchEconomicRevision" WHERE "playerId"=$1 AND field=$2 ORDER BY revision DESC LIMIT 1',
        [command.playerId, command.field])).rows[0]
      const revision = (last?.revision ?? 0) + 1
      let payload = prepared.payload
      let classification = command.classification, sourceUrl = command.sourceUrl
      let sourcePublishedOn = command.sourcePublishedOn
      if (command.action === "ROLLBACK" && command.rollbackToId) {
        const target = (await client.query<RevisionRow>(
          'SELECT * FROM "ResearchEconomicRevision" WHERE id=$1 AND "playerId"=$2 AND field=$3 AND action IN (\'PUBLISH\',\'ROLLBACK\')',
          [command.rollbackToId, command.playerId, command.field])).rows[0]
        if (!target) throw Error("RESEARCH_ROLLBACK_TARGET_INVALID")
        payload = target.payload === null ? null : parseResearchPayload(command.field, "ROLLBACK", target.payload)
        classification = target.classification as typeof classification
        sourceUrl = target.sourceUrl
        sourcePublishedOn = target.sourcePublishedOn
      }
      const id = randomUUID(), priorId = head?.revisionId ?? null
      const contentHash = researchHash({ playerId: command.playerId, eaId: command.eaId, clubId: command.clubId,
        field: command.field, revision, action: command.action, payload, classification,
        sourceUrl, sourcePublishedOn, capturedOn: command.capturedOn, priorId })
      await client.query(`INSERT INTO "ResearchEconomicRevision"
        (id,"playerId","eaId","clubId",field,revision,"requestId","requestHash",action,payload,
         classification,"sourceUrl","sourcePublishedOn","capturedOn","priorId","contentHash")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
      [id,command.playerId,command.eaId,command.clubId,command.field,revision,command.requestId,
        prepared.requestHash,command.action,payload === null ? null : JSON.stringify(payload),classification,
        sourceUrl,sourcePublishedOn,command.capturedOn,priorId,contentHash])
      if (command.action !== "RECORD") {
        if (head) {
          const updated = await client.query(
            'UPDATE "ResearchEconomicHead" SET "revisionId"=$1,revision=$2 WHERE "playerId"=$3 AND field=$4 AND revision=$5',
            [id,revision,command.playerId,command.field,head.revision])
          if (updated.rowCount !== 1) throw Error("RESEARCH_HEAD_CONFLICT")
        } else await client.query(
          'INSERT INTO "ResearchEconomicHead" ("playerId",field,"revisionId",revision) VALUES ($1,$2,$3,$4)',
          [command.playerId,command.field,id,revision])
        const confirmed = (await client.query<HeadRow>(
          'SELECT "revisionId",revision FROM "ResearchEconomicHead" WHERE "playerId"=$1 AND field=$2',
          [command.playerId,command.field])).rows[0]
        if (confirmed?.revisionId !== id) throw Error("RESEARCH_READ_BACK_FAILED")
      }
      await client.query("COMMIT")
      committed = true
      const persisted = (await pool.query<{ id: string }>(
        'SELECT id FROM "ResearchEconomicRevision" WHERE "requestId"=$1', [command.requestId])).rows[0]
      if (persisted?.id !== id) throw Error("RESEARCH_COMMIT_NOT_CONFIRMED")
      return { id, revision, replay: false, publishedNow: command.action !== "RECORD" && payload !== null }
    } catch (error) {
      if (!committed) try { await client.query("ROLLBACK") } catch { /* Reconcile by requestId after an uncertain commit. */ }
      throw error
    } finally { client.release() }
  }
}

/** Bounded batches stop on the first conflict; completed requestIds can be replayed safely. */
export async function writeResearchEconomicBatch(pool: Pick<Pool, "connect" | "query">, commands: readonly ResearchCommand[]) {
  if (!commands.length || commands.length > 100 || new Set(commands.map(c => c.requestId)).size !== commands.length)
    throw Error("RESEARCH_BATCH_INVALID")
  const write = createResearchEconomicWriter(pool)
  const results = []
  for (const command of commands) results.push(await write(command))
  return results
}
