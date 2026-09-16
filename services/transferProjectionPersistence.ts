import { isDeepStrictEqual } from "node:util"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { planTransferObservationAppend, prepareTransferHistory, transferEvidenceHash } from "../lib/transferHistory"
import { evaluateTransferHistory, type TransferBatchContext } from "./transferHistoryBatch"
import { persistTransferObservations } from "./transferHistoryPersistence"
import { prismaObservationTransaction, requireTransferScope, type TransferIdentityScope } from "./prismaTransferObservationStore"
import type { ConfirmedTransferPlayer } from "../types/currentClub"
import type { TransferObservationResult } from "../types/transferObservation"

export type TransferPersistenceInput = {
  player: ConfirmedTransferPlayer; observation: TransferObservationResult; context: TransferBatchContext
  now: Date; expectedUpdatedAt: string
  sourceHashes: Record<string, { count: string; hash: string }>
}
export function requireFreshTransferPlan(now: Date, wallClock = new Date()) {
  if (!Number.isFinite(now.getTime()) || now > wallClock || wallClock.getTime() - now.getTime() > 300000) throw new Error("TRANSFER_PLAN_EXPIRED")
}
function projection(input: TransferPersistenceInput, decision: ReturnType<typeof evaluateTransferHistory>["decision"]) {
  return { playerId: input.player.playerId, clubId: decision.currentClubCandidate?.clubId ?? null,
    providerTeamId: decision.candidateTeamId ?? decision.supportingEvidence.find(e => e.kind === "TRANSFER_EVENT")?.teamId ?? null,
    effectiveSince: decision.effectiveSince ? new Date(decision.effectiveSince) : null,
    decision: decision.decision, evidenceHash: decision.evidenceHash, policyVersion: decision.policyVersion,
    evidence: JSON.parse(JSON.stringify(decision)) as Prisma.InputJsonValue, evaluatedAt: input.now, status: "PROPOSED" }
}

async function plan(tx: Prisma.TransactionClient, input: TransferPersistenceInput, scope: TransferIdentityScope) {
  requireTransferScope(scope, input.player.playerId, input.player.providerPlayerId)
  for (const table of ["Club", "ApiFootballTeamRosterCache", "ClubOfficialLineupSnapshot"] as const) {
    const [actual] = await tx.$queryRawUnsafe<{ count: string; hash: string }[]>(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash FROM "${table}" t`)
    if (!isDeepStrictEqual(actual, input.sourceHashes[table])) throw new Error("TRANSFER_SOURCE_SNAPSHOT_CHANGED")
  }
  const current = await tx.player.findUnique({ where: { id: input.player.playerId },
    select: { apiFootballId: true, clubId: true, updatedAt: true } })
  if (!current || current.apiFootballId !== input.player.providerPlayerId || current.clubId !== input.player.eaClubId ||
      current.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("TRANSFER_PLAYER_SNAPSHOT_CHANGED")
  const clubs = await tx.club.findMany({ select: { id: true, name: true, apiFootballId: true } })
  const ordered = (rows: TransferBatchContext["clubs"]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  if (!isDeepStrictEqual(ordered(clubs), ordered(input.context.clubs))) throw new Error("TRANSFER_TEAM_SNAPSHOT_CHANGED")
  const evaluation = evaluateTransferHistory(input.player, input.observation, input.context, input.now)
  const port = prismaObservationTransaction(tx, scope)
  const owners = await port.identityOwners(input.player.providerPlayerId)
  if (owners.length !== 1 || owners[0] !== input.player.playerId) throw new Error("TRANSFER_PROVIDER_OWNERSHIP_CHANGED")
  const existing = await port.list(input.player.playerId)
  if (existing.some(r => r.providerPlayerId !== input.player.providerPlayerId)) throw new Error("TRANSFER_HISTORY_IDENTITY_CONFLICT")
  const history = { player: input.player, events: input.observation.transfers, fetchedAt: input.observation.requestMetadata.fetchedAt }
  const incoming = prepareTransferHistory(history, input.now)
  const append = planTransferObservationAppend(existing, incoming, input.now)
  // Never silently omit persisted source events from the current-club decision.
  if (existing.some(r => !incoming.some(i => i.contentHash === r.contentHash))) throw new Error("TRANSFER_HISTORY_REQUIRES_REVIEW")
  const proposed = projection(input, evaluation.decision)
  const previous = await tx.playerCurrentClubState.findUnique({ where: { playerId: input.player.playerId } })
  if (previous && !isDeepStrictEqual(previous, proposed)) throw new Error("TRANSFER_PROJECTION_REQUIRES_REVIEW")
  const summary = { playerId: input.player.playerId, providerPlayerId: input.player.providerPlayerId,
    observationsToInsert: append.append.length, alreadyExisting: append.duplicateHashes.length,
    revisions: append.append.filter(r => r.possibleRevisionHashes.length).length,
    unknownTeams: evaluation.resolutions.filter(r => r.status !== "RESOLVED"), decision: evaluation.decision,
    projectionToInsert: previous ? 0 : 1, proposed, writable: false as const }
  return { port, history, incoming, existing, append, previous, proposed, summary,
    planHash: transferEvidenceHash({ input, summary, existing }) }
}

export function dryRunTransferPersistence(db: Pick<PrismaClient, "$transaction">, input: TransferPersistenceInput, scope: TransferIdentityScope) {
  requireTransferScope(scope, input.player.playerId, input.player.providerPlayerId)
  return withPrismaReadOnly(db, async tx => {
    const p = await plan(tx, input, scope)
    return { ...p.summary, planHash: p.planHash }
  })
}

// Atomic unit = one player's history + revision metadata + non-promoted projection.
// Existing proposals are never replaced. No retries, no nested physical transaction.
export async function writeTransferPersistence(db: Pick<PrismaClient, "$transaction">, input: TransferPersistenceInput,
  scope: TransferIdentityScope, expectedPlanHash: string, clock: () => Date = () => new Date()) {
  requireFreshTransferPlan(input.now, clock())
  requireTransferScope(scope, input.player.playerId, input.player.providerPlayerId)
  return db.$transaction(async tx => {
    // Prevent concurrent identity/EA-club updates until this unit commits; no Player mutation.
    await tx.$queryRawUnsafe('SELECT id FROM "Player" WHERE id = $1 FOR SHARE', input.player.playerId)
    const p = await plan(tx, input, scope)
    if (p.planHash !== expectedPlanHash) throw new Error("TRANSFER_DRY_RUN_CHANGED")
    const result = await persistTransferObservations(p.history, input.now, { transaction: work => work(p.port) })
    if (result.inserted !== p.append.append.length) throw new Error("TRANSFER_CONCURRENT_INSERT_REQUIRES_REVIEW")
    if (!p.previous) await tx.playerCurrentClubState.create({ data: p.proposed })
    const observations = await p.port.list(input.player.playerId)
    const expected = [...p.existing, ...p.append.append]
    const ordered = (rows: typeof expected) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
    if (!isDeepStrictEqual(ordered(observations), ordered(expected))) throw new Error("TRANSFER_FINAL_READ_BACK_MISMATCH")
    const state = await tx.playerCurrentClubState.findUnique({ where: { playerId: input.player.playerId } })
    if (!isDeepStrictEqual(state, p.proposed)) throw new Error("TRANSFER_PROJECTION_READ_BACK_MISMATCH")
    return { ...result, playerId: input.player.playerId, projectionInserted: p.previous ? 0 : 1,
      decision: p.summary.decision, observations, projection: state, promoted: false as const }
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 60000 })
}
