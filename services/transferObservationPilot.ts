import { createApiFootballTransferReader, transferFailureCode, type TransferFetch } from "./apiFootballTransferReader"
import { compareTransferObservations, resolveTransferTeamObservation, TransferObservationError } from "../lib/transferObservations"
import { evaluateCurrentClubEvidence } from "./currentClubEvidence"
import type { TransferClub, TransferLineupEvidence, TransferObservationResult, TransferRosterEvidence } from "../types/transferObservation"

// Closed operational cohort from Lote11 Fase A READ ONLY audit, 2026-09-15.
// These are local identity expectations, NOT invented transfer results.
export const TRANSFER_PILOT_PLAYERS = Object.freeze([
  { playerId: "cmt92ovep0002hwucv4tw8ioi", slug: "mohamed-salah", name: "Mohamed Salah", providerPlayerId: 306, clubId: "cmt92ovai0001hwucqa7za5jj", clubName: "Liverpool", localTeamId: 40 },
  { playerId: "cmt954zui000y14ucsq41525y", slug: "rodri", name: "Rodri", providerPlayerId: 44, clubId: "cmt94sibe001a5guc60z2rphl", clubName: "Manchester City", localTeamId: 50 },
  { playerId: "cmt99dftr001qvsucoleqh6z0", slug: "ibrahima-konate", name: "Ibrahima Konaté", providerPlayerId: 1145, clubId: "cmt92ovai0001hwucqa7za5jj", clubName: "Liverpool", localTeamId: 40 },
  { playerId: "cmt99m82g001hugucwa5q4qqz", slug: "marc-cucurella", name: "Marc Cucurella", providerPlayerId: 47380, clubId: "cmt988ik5006oxoucd513b45v", clubName: "Chelsea", localTeamId: 49 },
  { playerId: "cmt99nkx9004euguczxq553wo", slug: "bernardo-silva", name: "Bernardo Silva", providerPlayerId: 636, clubId: "cmt94sibe001a5guc60z2rphl", clubName: "Manchester City", localTeamId: 50 },
  { playerId: "cmt99mh4l0023ugucamjeah3u", slug: "enzo-fernandez", name: "Enzo Fernández", providerPlayerId: 5996, clubId: "cmt988ik5006oxoucd513b45v", clubName: "Chelsea", localTeamId: 49 },
].map(p => Object.freeze(p)))
export type TransferPilotPlayer = (typeof TRANSFER_PILOT_PLAYERS)[number]
export type TransferPilotEvidence = {
  players: TransferPilotPlayer[]; clubs: TransferClub[]; rosters: TransferRosterEvidence[]
  lineups: TransferLineupEvidence[]; warnings: string[]
}
export function requireTransferPilotPlayers(players: readonly TransferPilotPlayer[]) {
  if (players.length !== 6 || TRANSFER_PILOT_PLAYERS.some((expected, i) =>
    Object.entries(expected).some(([key, value]) => players[i]?.[key as keyof TransferPilotPlayer] !== value))) {
    throw new TransferObservationError("TRANSFER_PILOT_IDENTITY_CHANGED")
  }
}
export function parseTransferPilotArgs(args: string[]) {
  if (args.length !== 3 || !["--dry-run", "--preflight"].includes(args[0]) || args[1] !== "--player-ids" ||
      args[2] !== TRANSFER_PILOT_PLAYERS.map(p => p.providerPlayerId).join(",")) throw new TransferObservationError("TRANSFER_PILOT_ARGUMENTS_REJECTED")
  return args[0] === "--preflight" ? "PREFLIGHT" as const : "DRY_RUN" as const
}
export function requireTransferPilotGit(git: { branch: string; status: string; head: string }, expectedHead?: string) {
  if (git.branch !== "beta-next" || git.status.trim() || !/^[a-f0-9]{40}$/.test(git.head) || (expectedHead && git.head !== expectedHead)) {
    throw new TransferObservationError("TRANSFER_PILOT_GIT_GUARD")
  }
}
export type TransferPilotRow = {
  localIdentity: TransferPilotPlayer; status: "COMPLETED" | "FAILED" | "NOT_STARTED"; error: string | null
  observation: TransferObservationResult | null
  decision: ReturnType<typeof evaluateCurrentClubEvidence> | null
  teamResolutions: ReturnType<typeof resolveTransferTeamObservation>[]
  eventComparisons: { left: number; right: number; kind: ReturnType<typeof compareTransferObservations> }[]
}
export async function runTransferObservationPilot(input: { evidence: TransferPilotEvidence; now: Date; apiKey: string },
  deps: { fetch: TransferFetch; beforeRequest: () => void; timeoutMs?: number }) {
  requireTransferPilotPlayers(input.evidence.players)
  const reader = createApiFootballTransferReader({ allowedPlayerIds: TRANSFER_PILOT_PLAYERS.map(p => p.providerPlayerId),
    apiKey: input.apiKey, fetch: deps.fetch, now: () => input.now, timeoutMs: deps.timeoutMs })
  const rows: TransferPilotRow[] = input.evidence.players.map(p => ({ localIdentity: { ...p }, status: "NOT_STARTED", error: null,
    observation: null, decision: null, teamResolutions: [], eventComparisons: [] }))
  for (const row of rows) {
    try {
      deps.beforeRequest()
      const observation = await reader.read(row.localIdentity.providerPlayerId)
      row.observation = observation
      row.teamResolutions = observation.transfers.flatMap(t => [
        resolveTransferTeamObservation(t.fromProviderTeamId, t.fromTeamNameRaw, input.evidence.clubs),
        resolveTransferTeamObservation(t.toProviderTeamId, t.toTeamNameRaw, input.evidence.clubs),
      ])
      observation.transfers.forEach((left, i) => observation.transfers.slice(i + 1).forEach(right => {
        row.eventComparisons.push({ left: left.sourceIndex, right: right.sourceIndex, kind: compareTransferObservations(left, right) })
      }))
      row.decision = evaluateCurrentClubEvidence({ localPlayer: { ...row.localIdentity, identityConfirmed: true },
        transferObservations: observation.transfers, validRosters: input.evidence.rosters,
        officialLineups: input.evidence.lineups, resolvedTeams: row.teamResolutions, now: input.now })
      row.status = "COMPLETED"
    } catch (error) { row.status = "FAILED"; row.error = transferFailureCode(error); reader.stop(); break }
  }
  return { mode: "DRY_RUN" as const, complete: rows.every(r => r.status === "COMPLETED"), rows,
    requestLog: reader.requestLog(), counters: reader.counters(), writes: 0 as const,
    evidence: { rosters: input.evidence.rosters, lineups: input.evidence.lineups, warnings: input.evidence.warnings } }
}
