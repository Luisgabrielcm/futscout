import { createHash } from "node:crypto"
import { canonicalJson } from "./clubContexts"
import { projectLoanMembership, loanEffectiveState, type LoanPresentation } from "./jointTransferLoanSync"
import type { BoundClub, BoundMembership, JointMovement, JointTransferPayload } from "./jointTransferContexts"

// Identity-specific brand aliases, not licensing evidence or fuzzy name matching.
const clubBrands: Readonly<Record<string, { real: string; game: string }>> = Object.freeze({
  "115845": { real: "Atalanta", game: "Bergamo Calcio" },
  "131681": { real: "AC Milan", game: "Milano FC" },
  "131682": { real: "Inter", game: "Lombardia FC" },
})
export function clubBindingNameMatches(eaId: string | null, observed: string, registered: string, context: "REAL" | "GAME" | "PROJECTION") {
  if (observed === registered) return true
  const brand = eaId ? clubBrands[eaId] : undefined
  return context !== "GAME" && !!brand && observed === brand.real && registered === brand.game
}
export function projectedGameClub<T extends { eaId: string | null; name: string }>(club: T | null): T | null {
  const brand = club?.eaId ? clubBrands[club.eaId] : undefined
  return club && brand && club.name === brand.real ? { ...club, name: brand.game } : club
}
/** Presentation only: never mutate the signed REAL/projection payload or EA snapshot. */
export function projectedGameClubView(view: LoanPresentation | null, bindings: readonly (BoundClub | null)[]): LoanPresentation | null {
  if (!view || view.displayContext !== "FUTSCOUT_PROJECTED") return view
  const display = <T extends { id: string; name: string }>(club: T | null): T | null => {
    const bound = club && bindings.find(c => c?.id === club.id && c.name === club.name)
    return club && bound ? { ...club, name: projectedGameClub(bound)!.name } : club
  }
  const playingClub = display(view.playingClub), parentClub = display(view.parentClub)
  return { ...view, playingClub, parentClub, clubLabel: playingClub?.name ?? view.clubLabel,
    mainContractClub: display(view.mainContractClub),
    loanBadge: view.loanBadge && parentClub ? `Emprestado pelo ${parentClub.name}` : view.loanBadge,
    loanParties: view.loanParties ? { playingClub: display(view.loanParties.playingClub)!, parentClub: display(view.loanParties.parentClub)! } : null }
}

/** Rules expressly approved by the owner on 2026-11-16. This is not an EA roster policy. */
export const realGamePolicy = Object.freeze({
  version: "futscout-real-game-v1", approvalReference: "owner-approved:2026-11-16:joint-real-game-policy",
  licensedDestination: "PROJECT_REAL_CLUB", unlicensedDestination: "PROJECT_FREE_AGENT_IF_PLAYER_CONFIRMED_IN_GAME",
  partialLicense: "INDIVIDUAL_PLAYER_DECISION_REQUIRED", unknown: "REVIEW",
  preserveNationalTeams: true, preserveOriginalEaSnapshot: true, preserveRealLoanRoute: true,
  mutateLegacyClubOrEconomics: false, inferOfficialEaMovement: false,
} as const)
export const projectionHash = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex")
export const realGamePolicyHash = projectionHash(realGamePolicy)
export type EligibilityEvidence = { url: string; contentHash: string; consultedAt: string; evidenceDate: string | null;
  gameVersion: "FC27" | null; eaId?: string | null; clubId?: string | null;
  individualDecision?: "ELIGIBLE" | "INELIGIBLE";
  role: "PLAYER_IDENTITY" | "PLAYER_GAME_PRESENCE" | "DESTINATION_SQUAD_LICENSE" | "ORIGIN_GAME_PRESENCE" | "PLAYER_DESTINATION_ELIGIBILITY";
  strength: "PRIMARY" | "SECONDARY_CORROBORATED"; scope: "CAREER" | "GENERAL_LICENSING" | "REAL_IDENTITY" | "UT_ONLY" }
export type RealGameEligibility = {
  eaId: string; policyHash: string; identity: "CONFIRMED" | "AMBIGUOUS"; gamePresence: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  destinationClubId: string; destinationInGame: boolean; originClubId: string | null; originAvailable: boolean;
  destinationLicense: "LICENSED_PLAYERS" | "NO_LICENSED_PLAYERS" | "PARTIAL" | "UNKNOWN";
  individualPlayerEligibility: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  evidence: readonly EligibilityEvidence[]
}
export type RealGameProjection = {
  version: 1; asOf: string; policyHash: string; approvalReference: string; sourceRealHash: string; originalEaGameHash: string;
  movement: JointMovement; eligibility: RealGameEligibility;
  status: "READY" | "REVIEW"; reasons: string[]; representation: "CLUB" | "FREE_AGENT" | "PENDING";
  membership: BoundMembership | null;
  realLoanRoute: { parentClub: NonNullable<BoundMembership["parentClub"]>; playingClub: NonNullable<BoundMembership["club"]> } | null;
  officialEaMovementClaimed: false
}
const sourceReal = (payload: JointTransferPayload) => ({ observation: payload.real, membership: payload.jointTransfer.real })
const validEvidence = (e: EligibilityEvidence) => {
  const scopes: Record<EligibilityEvidence["role"], readonly EligibilityEvidence["scope"][]> = {
    PLAYER_IDENTITY: ["REAL_IDENTITY", "CAREER"], PLAYER_GAME_PRESENCE: ["CAREER"], ORIGIN_GAME_PRESENCE: ["CAREER"],
    DESTINATION_SQUAD_LICENSE: ["GENERAL_LICENSING", "CAREER"], PLAYER_DESTINATION_ELIGIBILITY: ["GENERAL_LICENSING", "CAREER"],
  }
  try { return !!scopes[e.role]?.includes(e.scope) && new URL(e.url).protocol === "https:" && /^[a-f0-9]{64}$/.test(e.contentHash) && Number.isFinite(Date.parse(e.consultedAt)) &&
    (e.evidenceDate === null || Number.isFinite(Date.parse(e.evidenceDate))) && ["PRIMARY", "SECONDARY_CORROBORATED"].includes(e.strength) &&
    ["CAREER", "GENERAL_LICENSING", "REAL_IDENTITY", "UT_ONLY"].includes(e.scope) &&
    (e.role === "PLAYER_IDENTITY" || e.gameVersion === "FC27") } catch { return false }
}

export function assessRealGameProjection(payload: JointTransferPayload, eligibility: RealGameEligibility, movement: JointMovement, asOf: string): RealGameProjection {
  // Persistable evidence must have the same canonical hash after JSONB round-trip.
  eligibility = JSON.parse(JSON.stringify(eligibility)) as RealGameEligibility
  movement = JSON.parse(JSON.stringify(movement)) as JointMovement
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error("REAL_GAME_CLOCK_INVALID")
  const real = payload.jointTransfer.real, reasons: string[] = []
  if (eligibility.policyHash !== realGamePolicyHash) reasons.push("APPROVED_POLICY_HASH_MISMATCH")
  if (eligibility.eaId !== payload.eaPlayerId || movement.eaId !== payload.eaPlayerId || eligibility.identity !== "CONFIRMED") reasons.push("IDENTITY_REVIEW")
  if (!real || !payload.real || !movement.evidenceConfirmed || movement.context !== "REAL" || !payload.jointTransfer.movements.some(m => projectionHash(m) === projectionHash(movement))) reasons.push("CONFIRMED_REAL_MOVEMENT_REQUIRED")
  if (movement.evidenceHash !== real?.loan?.evidence.contentHash && movement.evidenceHash !== payload.real?.evidenceHash) reasons.push("REAL_MOVEMENT_EVIDENCE_NOT_BOUND")
  if (movement.effectiveAt && movement.effectiveAt > asOf) reasons.push("FUTURE_REAL_MOVEMENT_NOT_EFFECTIVE")
  if (eligibility.gamePresence !== "AVAILABLE") reasons.push("GAME_AVAILABILITY_REVIEW")
  if (eligibility.evidence.some(e => !validEvidence(e))) reasons.push("ELIGIBILITY_EVIDENCE_INVALID")
  const has = (role: EligibilityEvidence["role"]) => eligibility.evidence.some(e => e.role === role && validEvidence(e) && e.scope !== "UT_ONLY" &&
    (role === "PLAYER_IDENTITY" || role === "PLAYER_GAME_PRESENCE" ? e.eaId === payload.eaPlayerId : e.clubId === (role === "DESTINATION_SQUAD_LICENSE" ? real?.club?.id : real?.parentClub?.id)))
  for (const role of ["PLAYER_IDENTITY", "PLAYER_GAME_PRESENCE", "DESTINATION_SQUAD_LICENSE"] as const) if (!has(role)) reasons.push(`MISSING_${role}_EVIDENCE`)
  if (!real?.club || real.state !== "CLUB" || real.club.id !== eligibility.destinationClubId) reasons.push("REAL_DESTINATION_BINDING_REVIEW")
  if (real?.loan && (loanEffectiveState(real.loan, asOf) !== "ACTIVE" || real.parentClub?.id !== eligibility.originClubId)) reasons.push("REAL_LOAN_CHRONOLOGY_OR_ORIGIN_REVIEW")
  if (real?.loan && !["LOAN_START"].includes(movement.kind)) reasons.push("ACTIVE_LOAN_MOVEMENT_TYPE_MISMATCH")
  if (!real?.loan && movement.kind === "LOAN_START") reasons.push("REAL_LOAN_FACT_REQUIRED")
  if (eligibility.destinationLicense === "UNKNOWN" || eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "UNKNOWN") reasons.push("DESTINATION_LICENSE_REVIEW")
  if (eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility !== "UNKNOWN" && !eligibility.evidence.some(e =>
    e.role === "PLAYER_DESTINATION_ELIGIBILITY" && validEvidence(e) && e.scope !== "UT_ONLY" && e.eaId === payload.eaPlayerId &&
    e.clubId === real?.club?.id && e.individualDecision === eligibility.individualPlayerEligibility)) reasons.push("INDIVIDUAL_DESTINATION_LICENSE_PROOF_REQUIRED")
  const freeAgent = eligibility.destinationLicense === "NO_LICENSED_PLAYERS" || eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "INELIGIBLE"
  if (!freeAgent && (!eligibility.destinationInGame || !real?.club?.eaId)) reasons.push("GAME_DESTINATION_AVAILABILITY_REVIEW")
  if (real?.loan && !freeAgent && (!eligibility.originAvailable || !real.parentClub?.eaId || !has("ORIGIN_GAME_PRESENCE"))) reasons.push("GAME_LOAN_ORIGIN_REVIEW")
  const route = real?.loan && real.parentClub && real.club ? { parentClub: real.parentClub, playingClub: real.club } : null
  return {
    version: 1, asOf, policyHash: realGamePolicyHash, approvalReference: realGamePolicy.approvalReference,
    sourceRealHash: projectionHash(sourceReal(payload)), originalEaGameHash: projectionHash(payload.game), movement, eligibility,
    status: reasons.length ? "REVIEW" : "READY", reasons: [...new Set(reasons)], representation: reasons.length ? "PENDING" : freeAgent ? "FREE_AGENT" : "CLUB",
    membership: reasons.length || !real ? null : { ...real, context: "GAME", state: freeAgent ? "FREE_AGENT" : "CLUB", club: freeAgent ? null : real.club,
      // Free-agent representation keeps the documented REAL route without fabricating a GAME loan.
      parentClub: route?.parentClub ?? null, loan: freeAgent ? null : real.loan,
      nationalTeams: payload.jointTransfer.game.nationalTeams, nationalCoverage: payload.jointTransfer.game.nationalCoverage },
    realLoanRoute: route, officialEaMovementClaimed: false,
  }
}

export function validateRealGameProjection(payload: JointTransferPayload) {
  const p = payload.jointTransfer.futscoutProjection
  if (!p) return
  const checkedAt = p.asOf
  if (!checkedAt || p.version !== 1 || p.officialEaMovementClaimed !== false ||
    canonicalJson(assessRealGameProjection(payload, p.eligibility, p.movement, checkedAt)) !== canonicalJson(p)) throw new Error("REAL_GAME_PROJECTION_INVALID_OR_STALE")
}

/** Only the display context becomes GAME; the underlying loan evidence remains REAL, never an EA claim. */
export function realGameProjectionView(payload: JointTransferPayload, asOf: string): LoanPresentation | null {
  const p = payload.jointTransfer.futscoutProjection
  if (!p || p.status !== "READY" || !p.membership) return null
  validateRealGameProjection(payload)
  if (assessRealGameProjection(payload, p.eligibility, p.movement, asOf).status !== "READY") throw new Error("REAL_GAME_PROJECTION_REQUIRES_REVALIDATION")
  const m = p.membership, real = payload.jointTransfer.real!
  // Approval is checked above; derive loan facts from REAL without relabeling them as EA evidence.
  const value = projectLoanMembership({ membership: { eaId: payload.eaPlayerId, context: "REAL", state: m.state, club: m.club, nationalTeams: m.nationalTeams },
    loan: m.loan ? { ...m.loan, parentClub: m.parentClub!, playingClub: m.club! } : null, asOf })
  return { ...value, context: "GAME", parentClub: m.parentClub,
    provenanceLabel: "Elenco atualizado pelo FutScout — projeção baseada em fatos reais; não é atualização oficial da EA",
    displayContext: "FUTSCOUT_PROJECTED", isOfficialSquadClaimed: false,
    evidence: value.evidence ?? (payload.real ? { url: payload.real.sourceUrl, evidenceDate: p.movement.effectiveAt, consultedAt: payload.real.observedAt,
      contentHash: payload.real.evidenceHash, snapshot: null } : null),
    loanParties: value.loanParties ?? (real.loan && p.representation === "FREE_AGENT" ? null : value.loanParties),
  }
}

export function selectedGameMembership(payload: JointTransferPayload, projected: boolean): BoundMembership {
  if (!projected) return payload.jointTransfer.game
  const p = payload.jointTransfer.futscoutProjection
  if (!p || p.status !== "READY" || !p.membership) throw new Error("READY_JOINT_PROJECTION_REQUIRED")
  return p.membership
}
