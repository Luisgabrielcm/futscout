import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { TRANSFER_PILOT_PLAYERS, requireTransferPilotPlayers, type TransferPilotEvidence } from "./transferObservationPilot"
import type { TransferObservationResult } from "../types/transferObservation"
import type { TransferPersistenceInput } from "./transferProjectionPersistence"

// Integrity pin of the structured, audited Phase B artifact, not reconstructed prose.
export const TRANSFER_PILOT_ARTIFACT_SHA256 = "a6e47e4bd7dd29653d42ddd296f0d98b7949097ed583f2c68c0df25bd2813ffa"
export function readAuditedTransferPayloads(bytes: Buffer): TransferObservationResult[] {
  if (createHash("sha256").update(bytes).digest("hex") !== TRANSFER_PILOT_ARTIFACT_SHA256) throw new Error("TRANSFER_ARTIFACT_INTEGRITY_FAILED")
  const artifact = JSON.parse(bytes.toString("utf8"))
  const pilot = artifact.pilot
  if (!pilot?.unchanged || !pilot.report?.complete || pilot.report.writes !== 0 ||
      !isDeepStrictEqual(pilot.before, pilot.after) || pilot.report.rows.length !== 6) throw new Error("TRANSFER_ARTIFACT_AUDIT_FAILED")
  return pilot.report.rows.map((row: { status: string; observation: TransferObservationResult }, i: number) => {
    const o = row.observation, id = TRANSFER_PILOT_PLAYERS[i].providerPlayerId
    if (row.status !== "COMPLETED" || o?.requestedPlayerId !== id || o.validation !== "VALID_IDENTITY" ||
        o.returnedPlayerIdentity?.id !== id || o.requestMetadata.providerPlayerId !== id ||
        o.requestMetadata.endpoint !== "/transfers" || o.requestMetadata.status !== 200) throw new Error("TRANSFER_ARTIFACT_IDENTITY_FAILED")
    return o
  })
}
export function buildTransferPilotInputs(evidence: TransferPilotEvidence, observations: readonly TransferObservationResult[],
  players: readonly { id: string; updatedAt: Date }[], hashes: TransferPersistenceInput["sourceHashes"], now: Date): TransferPersistenceInput[] {
  requireTransferPilotPlayers(evidence.players)
  if (observations.length !== 6 || observations.some((o, i) => o.requestedPlayerId !== TRANSFER_PILOT_PLAYERS[i].providerPlayerId)) throw new Error("TRANSFER_ALLOW_LIST_REJECTED")
  return evidence.players.map((p, i) => {
    const current = players.find(x => x.id === p.playerId)
    if (!current) throw new Error("TRANSFER_PLAYER_MISSING")
    return { player: { playerId: p.playerId, providerPlayerId: p.providerPlayerId, identityConfirmed: true, ownershipUnique: true,
      eaClubId: p.clubId, eaTeamId: p.localTeamId }, observation: observations[i], context: evidence,
      now, expectedUpdatedAt: current.updatedAt.toISOString(), sourceHashes: hashes }
  })
}

export async function runTransferPersistenceUnits<T>(inputs: readonly TransferPersistenceInput[], execute: (input: TransferPersistenceInput) => Promise<T>) {
  if (inputs.length !== 6 || inputs.some((x, i) => x.player.playerId !== TRANSFER_PILOT_PLAYERS[i].playerId ||
      x.player.providerPlayerId !== TRANSFER_PILOT_PLAYERS[i].providerPlayerId)) throw new Error("TRANSFER_ALLOW_LIST_REJECTED")
  const completed: T[] = []
  for (const input of inputs) {
    try { completed.push(await execute(input)) }
    catch (error) { return { completed, failedPlayerId: input.player.playerId, notStarted: inputs.slice(completed.length + 1).map(x => x.player.playerId),
      failureStage: "PLAYER_TRANSACTION_OR_COMMIT",
      failureCode: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PERSISTENCE_FAILED_AUDIT_REQUIRED",
      requiresAuditBeforeRetry: true, retries: 0 } }
  }
  return { completed, failedPlayerId: null, notStarted: [], failureStage: null, requiresAuditBeforeRetry: false, retries: 0 }
}
