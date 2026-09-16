import { observationEvent, planTransferObservationAppend, prepareTransferHistory, requireConfirmedTransferPlayer, transferEvidenceHash } from "../lib/transferHistory"
import { resolveTransferTeamObservation, TransferObservationError } from "../lib/transferObservations"
import { evaluateCurrentClubEvidence } from "./currentClubEvidence"
import { transferFailureCode } from "./apiFootballTransferReader"
import { CURRENT_CLUB_POLICY, type ConfirmedTransferPlayer, type TransferReview } from "../types/currentClub"
import type { TransferClub, TransferLineupEvidence, TransferObservationResult, TransferRosterEvidence } from "../types/transferObservation"

export type TransferBatchContext = { clubs: readonly TransferClub[]; rosters: readonly TransferRosterEvidence[]; lineups: readonly TransferLineupEvidence[] }
export function evaluateTransferHistory(player: ConfirmedTransferPlayer, observation: TransferObservationResult, context: TransferBatchContext, now: Date) {
  requireConfirmedTransferPlayer(player)
  if (!["VALID_IDENTITY", "EMPTY_NO_EVIDENCE"].includes(observation.validation) || observation.provider !== "api-football" || observation.requestedPlayerId !== player.providerPlayerId ||
      (observation.returnedPlayerIdentity?.id !== player.providerPlayerId && observation.validation !== "EMPTY_NO_EVIDENCE") ||
      (observation.validation === "EMPTY_NO_EVIDENCE" && (observation.returnedPlayerIdentity !== null || observation.transfers.length))) throw new TransferObservationError("INVALID_PROVIDER_IDENTITY")
  const fetchedAt = observation.requestMetadata.fetchedAt
  if (now.getTime() - Date.parse(fetchedAt) > 7 * 86400000) throw new TransferObservationError("TRANSFER_OBSERVATION_EXPIRED")
  const records = prepareTransferHistory({ player, events: observation.transfers, fetchedAt }, now)
  const events = records.map(r => observationEvent(r, now))
  const historyPlan = planTransferObservationAppend([], records, now)
  const resolutions = events.flatMap(e => [resolveTransferTeamObservation(e.fromProviderTeamId, e.fromTeamNameRaw, context.clubs),
    resolveTransferTeamObservation(e.toProviderTeamId, e.toTeamNameRaw, context.clubs)])
  const decision = evaluateCurrentClubEvidence({ localPlayer: { providerPlayerId: player.providerPlayerId, identityConfirmed: true,
    clubId: player.eaClubId ?? "", localTeamId: player.eaTeamId, realLifeTeamId: player.realLifeTeamId },
    transferObservations: events, observedAt: fetchedAt, validRosters: context.rosters, officialLineups: context.lineups, resolvedTeams: resolutions, now })
  const reviews: TransferReview[] = []
  const addReview = (kind: TransferReview["kind"], reason: string, providerTeamId: number | null = null) => {
    const key = transferEvidenceHash([player.playerId, kind, reason, providerTeamId, decision.evidenceHash])
    if (!reviews.some(r => r.key === key)) reviews.push({ key, playerId: player.playerId, kind, reason, providerTeamId, evidenceHash: decision.evidenceHash })
  }
  for (const r of resolutions) if (r.status !== "RESOLVED") addReview(r.status === "CONFLICT" ? "CONFLICT" : "TEAM_IDENTITY_REVIEW", r.status, r.providerTeamId)
  if (historyPlan.append.some(r => r.possibleRevisionHashes.length)) addReview("TRANSFER_REVISION_REVIEW", "POSSIBLE_REVISION")
  if (decision.decision === "CONFLICT") addReview("CONFLICT", decision.reason)
  else if (decision.evidenceState !== "CORROBORATED") addReview("CURRENT_CLUB_REVIEW", decision.reason)
  // A proposal is not an authorization. EA clubId is explicitly never the write target.
  const proposedUpdate = decision.currentClubCandidate && ["TRANSFER_CANDIDATE", "LOAN_CANDIDATE", "RETURN_FROM_LOAN_CANDIDATE"].includes(decision.decision)
    ? { target: "PlayerCurrentClubState" as const, playerId: player.playerId, ...decision.currentClubCandidate,
      effectiveSince: decision.effectiveSince, evidenceHash: decision.evidenceHash, policyVersion: decision.policyVersion,
      requiresSeparateAuthorization: true as const, writable: false as const } : null
  return { player, events, resolutions, historyPlan, decision, reviews, proposedUpdate, writes: 0 as const }
}

export type TransferBatchCheckpoint = { inputHash: string; observations: TransferObservationResult[]; requestsUsed: number; failure: boolean; integrityHash: string }
export type TransferBatchConfig = { mode: "DRY_RUN"; maxPlayers: number; maxRequests: number; remainingQuota: number; zeroRetry: true }
// Explicit capabilities only. No DB/env/global fetch/default reader/persistence callback.
export async function runTransferHistoryBatch(config: TransferBatchConfig, players: readonly ConfirmedTransferPlayer[], context: TransferBatchContext,
  now: Date, source: { cached(id: number): Promise<TransferObservationResult | null>; request?(id: number): Promise<TransferObservationResult> },
  resume?: TransferBatchCheckpoint) {
  if (config.mode !== "DRY_RUN" || config.zeroRetry !== true || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(config.maxPlayers) || config.maxPlayers < 1 || config.maxPlayers > 100 || players.length > config.maxPlayers ||
      !Number.isSafeInteger(config.maxRequests) || config.maxRequests < 0 || config.maxRequests > 50 ||
      !Number.isSafeInteger(config.remainingQuota) || config.remainingQuota < 0) throw new Error("INVALID_TRANSFER_BATCH_BUDGET")
  players.forEach(requireConfirmedTransferPlayer)
  if (new Set(players.map(p => p.playerId)).size !== players.length || new Set(players.map(p => p.providerPlayerId)).size !== players.length) throw new Error("DUPLICATE_TRANSFER_BATCH_IDENTITY")
  const inputHash = transferEvidenceHash({ players, context, policy: CURRENT_CLUB_POLICY, maxPlayers: config.maxPlayers, maxRequests: config.maxRequests })
  const checkpointHash = (c: Omit<TransferBatchCheckpoint, "integrityHash">) => transferEvidenceHash(c)
  if (resume && (resume.inputHash !== inputHash || resume.failure || !Number.isSafeInteger(resume.requestsUsed) || resume.requestsUsed < 0 ||
      resume.requestsUsed > config.maxRequests || resume.observations.length > players.length ||
      resume.integrityHash !== checkpointHash({ inputHash: resume.inputHash, observations: resume.observations, requestsUsed: resume.requestsUsed, failure: resume.failure }))) throw new Error("TRANSFER_RESUME_REQUIRES_REVIEW")
  // Checksum detects accidental corruption, not authorization. Revalidate raw identity, freshness and decisions.
  const observations = structuredClone(resume?.observations ?? [])
  const completed = observations.map((observation, i) => evaluateTransferHistory(players[i], observation, context, now))
  let requestsUsed = resume?.requestsUsed ?? 0, requestsThisRun = 0
  let stopReason: string | null = null, failedPlayerId: string | null = null
  for (const player of players.slice(completed.length)) {
    try {
      let observation = await source.cached(player.providerPlayerId)
      if (!observation) {
        if (requestsUsed >= config.maxRequests || requestsThisRun >= config.remainingQuota || !source.request) { stopReason = "REQUEST_BUDGET_OR_CACHE_ONLY_MISS"; break }
        requestsUsed++; requestsThisRun++ // Failures consume budget. Never retry in this invocation or resume a failed item.
        observation = await source.request(player.providerPlayerId)
      }
      completed.push(evaluateTransferHistory(player, observation, context, now))
      observations.push(structuredClone(observation))
    } catch (error) { failedPlayerId = player.playerId; stopReason = transferFailureCode(error); break }
  }
  const checkpointData = { inputHash, observations, requestsUsed, failure: failedPlayerId !== null }
  return { completed, failedPlayerId, notStarted: players.slice(completed.length + (failedPlayerId ? 1 : 0)).map(p => p.playerId), stopReason,
    requestsThisRun, requestsUsed, retries: 0 as const, writes: 0 as const,
    checkpoint: { ...checkpointData, integrityHash: checkpointHash(checkpointData) } satisfies TransferBatchCheckpoint }
}
