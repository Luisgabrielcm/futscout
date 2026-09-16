import { compareTransferObservations, orderTransfers, transferDateState } from "../lib/transferObservations"
import { transferEvidenceHash } from "../lib/transferHistory"
import { CURRENT_CLUB_POLICY, type ClubEvidence, type CurrentClubEvaluation } from "../types/currentClub"
import type { CurrentClubDecision, CurrentClubPlayer, NormalizedTransferObservation, TransferLineupEvidence,
  TransferRosterEvidence, TransferTeamResolution } from "../types/transferObservation"

const day = 86400000
export type CurrentClubEvidenceInput = {
  localPlayer: CurrentClubPlayer; transferObservations: readonly NormalizedTransferObservation[]
  validRosters: readonly TransferRosterEvidence[]; officialLineups: readonly TransferLineupEvidence[]
  resolvedTeams: readonly TransferTeamResolution[]; now: Date; observedAt?: string
}

// Source authority is temporal, never a numeric identity-match score. No I/O or write capability.
export function evaluateCurrentClubEvidence(input: CurrentClubEvidenceInput): CurrentClubEvaluation {
  const { localPlayer: p, now } = input, warnings: string[] = []
  const clockValid = Number.isFinite(now.getTime())
  const evaluatedAt = clockValid ? now.toISOString() : "INVALID_CLOCK"
  const observedAt = input.observedAt ?? evaluatedAt
  const events = input.transferObservations
  let supportingEvidence: ClubEvidence[] = []
  const contradictingEvidence: ClubEvidence[] = []
  const result = (decision: CurrentClubDecision, reason: string, candidateTeamId: number | null = null,
    effectiveSince: string | null = null): CurrentClubEvaluation => {
    const resolved = input.resolvedTeams.filter(t => t.providerTeamId === candidateTeamId && t.status === "RESOLVED" && t.clubId)
    const candidate = resolved.length && new Set(resolved.map(t => t.clubId)).size === 1
      ? { clubId: resolved[0].clubId!, providerTeamId: candidateTeamId! } : null
    const evidenceState = ["CURRENT_CLUB_CONFIRMED", "TRANSFER_CANDIDATE", "LOAN_CANDIDATE", "RETURN_FROM_LOAN_CANDIDATE"].includes(decision)
      ? "CORROBORATED" : decision === "INSUFFICIENT_EVIDENCE" ? "INSUFFICIENT" : "REVIEW_REQUIRED"
    return { decision, reason, candidateTeamId, currentClubCandidate: candidate, effectiveSince, evidenceState,
      supportingEvidence, contradictingEvidence, warnings, policyVersion: CURRENT_CLUB_POLICY, evaluatedAt, writable: false,
      evidenceHash: transferEvidenceHash({ policy: CURRENT_CLUB_POLICY, player: p, events, observedAt, rosters: input.validRosters,
        lineups: input.officialLineups, resolutions: input.resolvedTeams, decision, reason, effectiveSince }) }
  }
  if (!clockValid || !p.identityConfirmed || !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > now.getTime()) {
    return result("INSUFFICIENT_EVIDENCE", "CONFIRMED_IDENTITY_AND_CLOCK_REQUIRED")
  }
  if (events.some(e => e.provider !== "api-football" || e.providerPlayerId !== p.providerPlayerId)) return result("CONFLICT", "INVALID_PROVIDER_IDENTITY")
  if (events.some(e => ["INVALID_DATE", "MISSING_DATE"].includes(transferDateState(e.dateRaw, now)))) return result("INSUFFICIENT_EVIDENCE", "UNORDERABLE_TRANSFER_EVENTS")
  if (events.some(e => transferDateState(e.dateRaw, now) === "FUTURE_TRANSFER")) warnings.push("FUTURE_TRANSFER")
  // Rebuild sortable dates from raw facts; never trust a caller's derived dateState/date.
  const past = orderTransfers(events.filter(e => transferDateState(e.dateRaw, now) === "VALID").map(e => ({ ...e, transferDate: e.dateRaw })), "desc")
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
  const rosterEvidence = (r: TransferRosterEvidence): ClubEvidence => ({ source: "api-football", kind: "ROSTER_SEASON", strength: "SEASONAL",
    observedAt: r.fetchedAt, effectiveAt: null, teamId: r.teamId, reference: r.teamId + ":" + r.season })
  const lineupEvidence = (l: TransferLineupEvidence): ClubEvidence => ({ source: "api-football", kind: "OFFICIAL_LINEUP", strength: "DATED_CORROBORATION",
    observedAt, effectiveAt: l.fixtureDate, teamId: l.teamId, reference: l.teamId + ":" + l.fixtureDate })
  supportingEvidence = [{ source: "ea", kind: "EA_CATALOG_CLUB", strength: "CONTEXT", observedAt, effectiveAt: null,
    teamId: p.localTeamId, reference: p.clubId }]
  if (p.realLifeTeamId != null) supportingEvidence.push({ source: "futscout", kind: "LOCAL_CURRENT_CLUB", strength: "CONTEXT",
    observedAt, effectiveAt: null, teamId: p.realLifeTeamId, reference: "separate-current-club-state" })
  const positiveRosters = rosters.filter(r => r.playerIds.includes(p.providerPlayerId))
  if (!latest) {
    const teams = new Set([...positiveRosters.map(r => r.teamId), ...lineups.map(l => l.teamId)])
    supportingEvidence.push(...positiveRosters.map(rosterEvidence), ...lineups.map(lineupEvidence))
    if (teams.size > 1) return result("CONFLICT", "MULTIPLE_CLUB_EVIDENCE_WITHOUT_CHRONOLOGY")
    const localTeam = p.realLifeTeamId ?? p.localTeamId
    if (teams.size === 1 && (localTeam === null || !teams.has(localTeam))) return result("STALE_LOCAL_CLUB", "POSITIVE_OTHER_CLUB_WITHOUT_TRANSFER")
    if (localTeam !== null && teams.has(localTeam)) return result("CURRENT_CLUB_CONFIRMED", "LOCAL_CLUB_CORROBORATED", localTeam)
    return result("INSUFFICIENT_EVIDENCE", rosters.some(r => r.teamId === p.localTeamId) ? "ABSENT_FROM_LOCAL_CLUB_ROSTER" : "NO_CURRENT_CLUB_EVIDENCE")
  }
  supportingEvidence.push({ source: "api-football", kind: "TRANSFER_EVENT", strength: "PRIMARY", observedAt,
    effectiveAt: latest.transferDate, teamId: latest.toProviderTeamId, reference: transferEvidenceHash(latest) })
  if (past.filter(e => e.transferDate === latest.transferDate).some(e => compareTransferObservations(e, latest) !== "EXACT_DUPLICATE")) {
    return result("CONFLICT", "LATEST_EVENT_REVISION_OR_SAME_DAY_AMBIGUITY")
  }
  const destination = latest.toProviderTeamId
  const teams = input.resolvedTeams.filter(t => t.providerTeamId === destination)
  if (teams.some(t => t.status === "CONFLICT") || new Set(teams.map(t => t.clubId)).size > 1) return result("CONFLICT", "DESTINATION_TEAM_CONFLICT")
  if (destination === null || !teams.length || teams.some(t => t.status !== "RESOLVED" || !t.clubId)) return result("TEAM_IDENTITY_UNRESOLVED", "UNKNOWN_DESTINATION_TEAM")
  const effectiveDay = latest.transferDate!
  const utcDay = (value: string) => new Date(value).toISOString().slice(0, 10)
  const laterDestinationLineups = lineups.filter(l => l.teamId === destination && utcDay(l.fixtureDate) > effectiveDay)
  const conflictingLineups = lineups.filter(l => l.teamId !== destination && utcDay(l.fixtureDate) >= effectiveDay)
  supportingEvidence.push(...laterDestinationLineups.map(lineupEvidence))
  contradictingEvidence.push(...conflictingLineups.map(lineupEvidence))
  if (conflictingLineups.length) return result("CONFLICT", "CONTEMPORANEOUS_LINEUP_DISAGREES")
  const contemporary = rosters.filter(r => utcDay(r.fetchedAt) >= effectiveDay)
  const opposing = contemporary.filter(r => r.teamId !== destination && r.playerIds.includes(p.providerPlayerId))
  contradictingEvidence.push(...opposing.map(rosterEvidence))
  // A dated destination lineup may outweigh ONLY the explicit origin's seasonal presence.
  // Retain the contrary evidence and warning; never suppress third-team or dated contradictions.
  if (opposing.length) {
    if (!laterDestinationLineups.length || opposing.some(r => r.teamId !== latest.fromProviderTeamId)) return result("CONFLICT", "CONTEMPORANEOUS_ROSTER_DISAGREES")
    warnings.push("SEASONAL_ORIGIN_ROSTER_OUTWEIGHED_BY_LATER_LINEUP")
  }
  const destinationRosters = contemporary.filter(r => r.teamId === destination)
  supportingEvidence.push(...destinationRosters.filter(r => r.playerIds.includes(p.providerPlayerId)).map(rosterEvidence))
  if (!destinationRosters.length && !laterDestinationLineups.length) return result("TRANSFER_CANDIDATE_NEEDS_DESTINATION_ROSTER", "EXPLICIT_EVENT_WITHOUT_DESTINATION_ROSTER", destination, effectiveDay)
  if (destinationRosters.some(r => !r.playerIds.includes(p.providerPlayerId))) return result("ROSTER_MISMATCH", "ABSENT_FROM_DESTINATION_ROSTER", destination, effectiveDay)
  if (destination === (p.realLifeTeamId ?? p.localTeamId)) return result("CURRENT_CLUB_CONFIRMED", "LATEST_EVENT_AND_ROSTER_CONFIRM_LOCAL_CLUB", destination, effectiveDay)
  const kind = latest.typeRaw?.trim().toLowerCase()
  return result(kind === "loan" ? "LOAN_CANDIDATE" : kind === "return from loan"
    ? "RETURN_FROM_LOAN_CANDIDATE" : "TRANSFER_CANDIDATE", "EXPLICIT_EVENT_AND_TEMPORAL_CORROBORATION", destination, effectiveDay)
}
