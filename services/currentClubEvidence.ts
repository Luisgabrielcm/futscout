import { compareTransferObservations, orderTransfers, transferDateState } from "../lib/transferObservations"
import type { CurrentClubDecision, CurrentClubPlayer, NormalizedTransferObservation, TransferLineupEvidence,
  TransferRosterEvidence, TransferTeamResolution } from "../types/transferObservation"

const day = 86400000
export function evaluateCurrentClubEvidence(input: {
  localPlayer: CurrentClubPlayer; transferObservations: readonly NormalizedTransferObservation[]
  validRosters: readonly TransferRosterEvidence[]; officialLineups: readonly TransferLineupEvidence[]
  resolvedTeams: readonly TransferTeamResolution[]; now: Date
}) {
  const { localPlayer: p, now } = input, warnings: string[] = []
  const result = (decision: CurrentClubDecision, reason: string, candidateTeamId: number | null = null) =>
    ({ decision, reason, candidateTeamId, warnings, writable: false as const })
  if (!Number.isFinite(now.getTime()) || !p.identityConfirmed) return result("INSUFFICIENT_EVIDENCE", "CONFIRMED_IDENTITY_AND_CLOCK_REQUIRED")
  const events = input.transferObservations
  if (events.some(e => e.provider !== "api-football" || e.providerPlayerId !== p.providerPlayerId)) return result("CONFLICT", "INVALID_PROVIDER_IDENTITY")
  // Re-evaluate dates at the supplied instant; never trust a persisted hint or array order.
  if (events.some(e => ["INVALID_DATE", "MISSING_DATE"].includes(transferDateState(e.dateRaw, now)))) return result("INSUFFICIENT_EVIDENCE", "UNORDERABLE_TRANSFER_EVENTS")
  if (events.some(e => transferDateState(e.dateRaw, now) === "FUTURE_TRANSFER")) warnings.push("FUTURE_TRANSFER")
  const past = orderTransfers(events.filter(e => transferDateState(e.dateRaw, now) === "VALID"), "desc")
  const latest = past[0]
  const rosters = input.validRosters.filter(r => {
    const fetched = Date.parse(r.fetchedAt), expires = Date.parse(r.expiresAt)
    return r.season === now.getUTCFullYear() && fetched <= now.getTime() && expires > now.getTime() &&
      expires > fetched && expires - fetched <= 7 * day && now.getTime() - fetched <= 7 * day
  })
  const lineups = input.officialLineups.filter(l => {
    const date = Date.parse(l.fixtureDate)
    return date <= now.getTime() && now.getTime() - date <= 30 * day && l.playerIds.includes(p.providerPlayerId)
  })
  if (!latest) {
    const teams = new Set([...rosters.filter(r => r.playerIds.includes(p.providerPlayerId)).map(r => r.teamId), ...lineups.map(l => l.teamId)])
    if (teams.size > 1) return result("CONFLICT", "MULTIPLE_CLUB_EVIDENCE_WITHOUT_CHRONOLOGY")
    if (teams.size === 1 && !teams.has(p.localTeamId)) return result("STALE_LOCAL_CLUB", "POSITIVE_OTHER_CLUB_WITHOUT_TRANSFER")
    if (teams.has(p.localTeamId)) return result("CURRENT_CLUB_CONFIRMED", "LOCAL_CLUB_CORROBORATED", p.localTeamId)
    return result("INSUFFICIENT_EVIDENCE", rosters.some(r => r.teamId === p.localTeamId) ? "ABSENT_FROM_LOCAL_CLUB_ROSTER" : "NO_CURRENT_CLUB_EVIDENCE")
  }
  const simultaneous = past.filter(e => e.transferDate === latest.transferDate)
  if (simultaneous.some(e => compareTransferObservations(e, latest) !== "EXACT_DUPLICATE")) return result("CONFLICT", "LATEST_EVENT_REVISION_OR_SAME_DAY_AMBIGUITY")
  const destination = latest.toProviderTeamId
  const teams = input.resolvedTeams.filter(t => t.providerTeamId === destination)
  if (teams.some(t => t.status === "CONFLICT") || new Set(teams.map(t => t.clubId)).size > 1) return result("CONFLICT", "DESTINATION_TEAM_CONFLICT")
  if (destination === null || !teams.length || teams.some(t => t.status !== "RESOLVED" || !t.clubId)) return result("INSUFFICIENT_EVIDENCE", "UNKNOWN_DESTINATION_TEAM")
  // Source gives only a date. A same-day lineup cannot safely establish before/after.
  const effectiveDay = latest.transferDate!
  if (lineups.some(l => l.teamId !== destination && l.fixtureDate.slice(0, 10) >= effectiveDay)) return result("CONFLICT", "CONTEMPORANEOUS_LINEUP_DISAGREES")
  const contemporary = rosters.filter(r => r.fetchedAt.slice(0, 10) >= effectiveDay)
  if (contemporary.some(r => r.teamId !== destination && r.playerIds.includes(p.providerPlayerId))) return result("CONFLICT", "CONTEMPORANEOUS_ROSTER_DISAGREES")
  const destinationRosters = contemporary.filter(r => r.teamId === destination)
  if (!destinationRosters.length) return result("TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER", "EXPLICIT_EVENT_WITHOUT_DESTINATION_ROSTER", destination)
  if (destinationRosters.some(r => !r.playerIds.includes(p.providerPlayerId))) return result("ROSTER_MISMATCH", "ABSENT_FROM_DESTINATION_ROSTER", destination)
  if (destination === p.localTeamId) return result("CURRENT_CLUB_CONFIRMED", "LATEST_EVENT_AND_ROSTER_CONFIRM_LOCAL_CLUB", destination)
  return result(latest.kindHint === "LOAN_HINT" ? "LOAN_CANDIDATE" : latest.kindHint === "RETURN_FROM_LOAN_HINT"
    ? "RETURN_FROM_LOAN_CANDIDATE" : "TRANSFER_CANDIDATE", "EXPLICIT_EVENT_AND_DESTINATION_ROSTER", destination)
}
