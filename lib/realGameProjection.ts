import { createHash } from "node:crypto"
import { canonicalJson } from "./clubContexts"
import { projectLoanMembership, loanEffectiveState, type LoanPresentation } from "./jointTransferLoanSync"
import type { BoundClub, BoundMembership, JointMovement, JointTransferPayload } from "./jointTransferContexts"

// Identity-specific brand aliases, not licensing evidence or fuzzy name matching.
const clubBrands: Readonly<Record<string, { real: string; game: string }>> = Object.freeze({
  "115845": { real: "Atalanta", game: "Bergamo Calcio" },
  "131681": { real: "AC Milan", game: "Milano FC" },
  "131682": { real: "Inter", game: "Lombardia FC" },
  "115841": { real: "Lazio", game: "Latium" },
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
/** Additive owner decision; existing v1 payloads and their hashes retain their original meaning. */
export const currentRealGamePolicy = Object.freeze({
  ...realGamePolicy, version: "futscout-real-game-v2",
  approvalReference: "owner-approved:2026-11-25:current-real-club-and-free-agent",
  confirmedRealFreeAgent: "PROJECT_FREE_AGENT_IF_PLAYER_CONFIRMED_IN_GAME",
  absentHistoricalNationalCoverage: "UNKNOWN_IN_CURRENT_PROJECTION",
} as const)
export const currentRealGamePolicyHash = projectionHash(currentRealGamePolicy)
/** Owner-reviewed catalogue policy; v1/v2 records retain their original meaning. */
export const reviewedRealGamePolicy = Object.freeze({
  ...currentRealGamePolicy, version: "futscout-real-game-v3",
  approvalReference: "owner-approved:2026-11-26:reviewed-catalogue-projection",
  confirmedRealFreeAgent: "EXCLUDE_FROM_PROJECTED_GAME",
  confirmedRetirement: "EXCLUDE_FROM_PROJECTED_GAME",
  unlicensedDestination: "FREE_AGENT_REQUIRES_RECENT_NATIONAL_CALLUP",
} as const)
export const reviewedRealGamePolicyHash = projectionHash(reviewedRealGamePolicy)
export type NationalWindowReview = {
  windows: readonly { date: string; url: string; contentHash: string; selected: boolean; complete: boolean }[]
}
export type EligibilityEvidence = { url: string; contentHash: string; consultedAt: string; evidenceDate: string | null;
  gameVersion: "FC27" | null; eaId?: string | null; clubId?: string | null;
  individualDecision?: "ELIGIBLE" | "INELIGIBLE";
  role: "PLAYER_IDENTITY" | "PROFESSIONAL_RETIREMENT" | "PLAYER_GAME_PRESENCE" | "PLAYER_GAME_ABSENCE" | "DESTINATION_SQUAD_LICENSE" | "ORIGIN_GAME_PRESENCE" | "ORIGIN_REAL_CONTRACT_REFERENCE" | "PLAYER_DESTINATION_ELIGIBILITY";
  strength: "PRIMARY" | "SECONDARY_CORROBORATED"; scope: "CAREER" | "GENERAL_LICENSING" | "REAL_IDENTITY" | "UT_ONLY" }
export type RealGameEligibility = {
  eaId: string; policyHash: string; identity: "CONFIRMED" | "AMBIGUOUS"; gamePresence: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  destinationClubId: string | null; destinationInGame: boolean; originClubId: string | null; originAvailable: boolean;
  destinationLicense: "LICENSED_PLAYERS" | "NO_LICENSED_PLAYERS" | "PARTIAL" | "UNKNOWN";
  individualPlayerEligibility: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  evidence: readonly EligibilityEvidence[]
  nationalWindowReview?: NationalWindowReview
  originRepresentation?: "REAL_CONTRACT_REFERENCE"
}
export type RealGameProjection = {
  version: 1 | 2 | 3; asOf: string; policyHash: string; approvalReference: string; sourceRealHash: string; originalEaGameHash: string;
  movement: JointMovement; eligibility: RealGameEligibility;
  status: "READY" | "REVIEW"; reasons: string[]; representation: "CLUB" | "FREE_AGENT" | "EXCLUDED" | "PENDING";
  membership: BoundMembership | null;
  realLoanRoute: { parentClub: NonNullable<BoundMembership["parentClub"]>; playingClub: NonNullable<BoundMembership["club"]> } | null;
  officialEaMovementClaimed: false
}
const sourceReal = (payload: JointTransferPayload) => ({ observation: payload.real, membership: payload.jointTransfer.real })
const validEvidence = (e: EligibilityEvidence) => {
  const scopes: Record<EligibilityEvidence["role"], readonly EligibilityEvidence["scope"][]> = {
    PLAYER_IDENTITY: ["REAL_IDENTITY", "CAREER"], PROFESSIONAL_RETIREMENT: ["REAL_IDENTITY"], PLAYER_GAME_PRESENCE: ["CAREER"], PLAYER_GAME_ABSENCE: ["CAREER"], ORIGIN_GAME_PRESENCE: ["CAREER"], ORIGIN_REAL_CONTRACT_REFERENCE: ["REAL_IDENTITY"],
    DESTINATION_SQUAD_LICENSE: ["GENERAL_LICENSING", "CAREER"], PLAYER_DESTINATION_ELIGIBILITY: ["GENERAL_LICENSING", "CAREER"],
  }
  try { return !!scopes[e.role]?.includes(e.scope) && new URL(e.url).protocol === "https:" && /^[a-f0-9]{64}$/.test(e.contentHash) && Number.isFinite(Date.parse(e.consultedAt)) &&
    (e.evidenceDate === null || Number.isFinite(Date.parse(e.evidenceDate))) && ["PRIMARY", "SECONDARY_CORROBORATED"].includes(e.strength) &&
    ["CAREER", "GENERAL_LICENSING", "REAL_IDENTITY", "UT_ONLY"].includes(e.scope) &&
    (["PLAYER_IDENTITY", "PROFESSIONAL_RETIREMENT", "ORIGIN_REAL_CONTRACT_REFERENCE"].includes(e.role) || e.gameVersion === "FC27") } catch { return false }
}

export function assessRealGameProjection(payload: JointTransferPayload, eligibility: RealGameEligibility, movement: JointMovement, asOf: string): RealGameProjection {
  return assessProjection(payload, eligibility, movement, asOf, 1)
}
export function assessCurrentRealGameProjection(payload: JointTransferPayload, eligibility: RealGameEligibility, movement: JointMovement, asOf: string): RealGameProjection {
  return assessProjection(payload, eligibility, movement, asOf, 2)
}
export function assessReviewedRealGameProjection(payload: JointTransferPayload, eligibility: RealGameEligibility, movement: JointMovement, asOf: string): RealGameProjection {
  const real = payload.jointTransfer.real
  const inactive = real?.state === "FREE_AGENT" || real?.state === "RETIRED"
  const latest = payload.jointTransfer.movements.filter(m => m.context === "REAL").at(-1)
  const reasons: string[] = []
  const base = assessProjection(payload, { ...eligibility, policyHash: currentRealGamePolicyHash }, movement, asOf, 2)
  if (eligibility.policyHash !== reviewedRealGamePolicyHash) reasons.push("APPROVED_POLICY_HASH_MISMATCH")
  const windows = eligibility.nationalWindowReview?.windows ?? []
  const validWindows = windows.length === 3 && new Set(windows.map(w => w.date)).size === 3 && windows.every(w =>
    /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Number.isFinite(Date.parse(w.date)) && new Date(w.date).toISOString().slice(0, 10) === w.date && w.date <= asOf &&
    /^[a-f0-9]{64}$/.test(w.contentHash) &&
    typeof w.selected === "boolean" && typeof w.complete === "boolean" &&
    (() => { try { return new URL(w.url).protocol === "https:" } catch { return false } })())
  const called = validWindows && windows.some(w => w.selected)
  const absent = validWindows && windows.every(w => w.complete && !w.selected)
  let excluded = inactive
  let realOriginReference = false
  if (inactive) {
    if (eligibility.identity !== "CONFIRMED" || eligibility.eaId !== payload.eaPlayerId || movement.eaId !== payload.eaPlayerId ||
      !payload.real || payload.real.status !== real.state || !movement.evidenceConfirmed || movement.context !== "REAL" ||
      latest?.kind !== (real.state === "RETIRED" ? "RETIREMENT_CONFIRMED" : "CURRENT_FREE_AGENT_CONFIRMED") ||
      projectionHash(latest) !== projectionHash(movement) || movement.evidenceHash !== payload.real.evidenceHash ||
      movement.sourceUrl !== payload.real.sourceUrl || real.club || real.loan || real.parentClub ||
      eligibility.destinationClubId !== null || eligibility.destinationInGame || eligibility.originClubId !== null || eligibility.originAvailable ||
      eligibility.destinationLicense !== "UNKNOWN" || eligibility.individualPlayerEligibility !== "UNKNOWN" ||
      movement.effectiveAt && movement.effectiveAt > asOf ||
      eligibility.evidence.some(e => !validEvidence(e)) ||
      !eligibility.evidence.some(e => e.role === "PLAYER_IDENTITY" && validEvidence(e) && e.eaId === payload.eaPlayerId))
      reasons.push("CONFIRMED_INACTIVE_REAL_IDENTITY_REQUIRED")
  } else {
    const absentFromGame = eligibility.gamePresence === "UNAVAILABLE" && eligibility.evidence.some(e =>
      e.role === "PLAYER_GAME_ABSENCE" && validEvidence(e) && e.eaId === payload.eaPlayerId &&
      e.evidenceDate !== null && e.evidenceDate <= asOf)
    realOriginReference = eligibility.originRepresentation === "REAL_CONTRACT_REFERENCE" && !!real?.loan &&
      eligibility.destinationInGame && (eligibility.destinationLicense === "LICENSED_PLAYERS" ||
        eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "ELIGIBLE") &&
      !!real.parentClub && real.parentClub.eaId === null && !eligibility.originAvailable &&
      eligibility.originClubId === real.parentClub.id && eligibility.evidence.some(e =>
        e.role === "ORIGIN_REAL_CONTRACT_REFERENCE" && validEvidence(e) && e.eaId === payload.eaPlayerId &&
        e.clubId === real.parentClub!.id && e.url === real.loan!.evidence.url && e.contentHash === real.loan!.evidence.contentHash)
    const retiredProfessionally = real?.state === "CLUB" && !real.loan && !real.parentClub &&
      latest?.kind === "RETIREMENT_CONFIRMED" && movement.kind === "RETIREMENT_CONFIRMED" &&
      projectionHash(latest) === projectionHash(movement) && movement.context === "REAL" && movement.evidenceConfirmed &&
      (!movement.effectiveAt || movement.effectiveAt <= asOf) && !eligibility.destinationInGame &&
      eligibility.destinationLicense === "NO_LICENSED_PLAYERS" && eligibility.evidence.some(e =>
        e.role === "PROFESSIONAL_RETIREMENT" && validEvidence(e) && e.eaId === payload.eaPlayerId &&
        e.clubId === real.club?.id && e.contentHash === movement.evidenceHash && e.url === movement.sourceUrl)
    const excludedByCallups = absent && (eligibility.destinationLicense === "NO_LICENSED_PLAYERS" ||
      eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "INELIGIBLE")
    // Exclusion does not assert that the player exists in the current Career Mode roster.
    // Positive availability remains mandatory for placing a player in a club or the free-agent market.
    reasons.push(...base.reasons.filter(r => {
      if ((excludedByCallups || retiredProfessionally || absentFromGame) && ["GAME_AVAILABILITY_REVIEW", "MISSING_PLAYER_GAME_PRESENCE_EVIDENCE"].includes(r)) return false
      return !(realOriginReference && r === "GAME_LOAN_ORIGIN_REVIEW")
    }))
    if (excludedByCallups || retiredProfessionally || absentFromGame) excluded = true
    else if (base.status === "READY" && base.representation === "FREE_AGENT") {
      if (!called) reasons.push("LAST_THREE_NATIONAL_CALLUPS_REVIEW_REQUIRED")
    }
  }
  const status = reasons.length ? "REVIEW" : "READY"
  return { ...base, version: 3, policyHash: reviewedRealGamePolicyHash, approvalReference: reviewedRealGamePolicy.approvalReference,
    eligibility: JSON.parse(JSON.stringify(eligibility)), status, reasons: [...new Set(reasons)],
    representation: status === "REVIEW" ? "PENDING" : excluded ? "EXCLUDED" : realOriginReference ? "CLUB" : base.representation,
    membership: status === "REVIEW" ? null : excluded ? { context: "GAME", state: "NOT_IN_SQUAD", club: null, parentClub: null,
      loan: null, nationalTeams: payload.jointTransfer.game.nationalTeams, nationalCoverage: payload.jointTransfer.game.nationalCoverage }
      : realOriginReference ? { ...real!, context: "GAME", nationalTeams: payload.jointTransfer.game.nationalTeams,
        nationalCoverage: payload.jointTransfer.game.nationalCoverage } : base.membership,
    realLoanRoute: excluded ? null : base.realLoanRoute }
}
function revalidateProjection(payload: JointTransferPayload, p: RealGameProjection, asOf: string) {
  return p.version === 3 ? assessReviewedRealGameProjection(payload, p.eligibility, p.movement, asOf)
    : assessProjection(payload, p.eligibility, p.movement, asOf, p.version)
}
function assessProjection(payload: JointTransferPayload, eligibility: RealGameEligibility, movement: JointMovement, asOf: string, version: 1 | 2): RealGameProjection {
  // Persistable evidence must have the same canonical hash after JSONB round-trip.
  eligibility = JSON.parse(JSON.stringify(eligibility)) as RealGameEligibility
  movement = JSON.parse(JSON.stringify(movement)) as JointMovement
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error("REAL_GAME_CLOCK_INVALID")
  const real = payload.jointTransfer.real, reasons: string[] = []
  const policy = version === 2 ? currentRealGamePolicy : realGamePolicy
  const policyHash = version === 2 ? currentRealGamePolicyHash : realGamePolicyHash
  const realFreeAgent = version === 2 && real?.state === "FREE_AGENT"
  if (eligibility.policyHash !== policyHash) reasons.push("APPROVED_POLICY_HASH_MISMATCH")
  if (eligibility.eaId !== payload.eaPlayerId || movement.eaId !== payload.eaPlayerId || eligibility.identity !== "CONFIRMED") reasons.push("IDENTITY_REVIEW")
  if (!real || !payload.real || !movement.evidenceConfirmed || movement.context !== "REAL" || !payload.jointTransfer.movements.some(m => projectionHash(m) === projectionHash(movement))) reasons.push("CONFIRMED_REAL_MOVEMENT_REQUIRED")
  if (movement.evidenceHash !== real?.loan?.evidence.contentHash && movement.evidenceHash !== payload.real?.evidenceHash) reasons.push("REAL_MOVEMENT_EVIDENCE_NOT_BOUND")
  if (movement.effectiveAt && movement.effectiveAt > asOf) reasons.push("FUTURE_REAL_MOVEMENT_NOT_EFFECTIVE")
  if (eligibility.gamePresence !== "AVAILABLE") reasons.push("GAME_AVAILABILITY_REVIEW")
  if (eligibility.evidence.some(e => !validEvidence(e))) reasons.push("ELIGIBILITY_EVIDENCE_INVALID")
  const has = (role: EligibilityEvidence["role"]) => eligibility.evidence.some(e => e.role === role && validEvidence(e) && e.scope !== "UT_ONLY" &&
    (role === "PLAYER_IDENTITY" || role === "PLAYER_GAME_PRESENCE" ? e.eaId === payload.eaPlayerId : e.clubId === (role === "DESTINATION_SQUAD_LICENSE" ? real?.club?.id : real?.parentClub?.id)))
  for (const role of ["PLAYER_IDENTITY", "PLAYER_GAME_PRESENCE"] as const) if (!has(role)) reasons.push(`MISSING_${role}_EVIDENCE`)
  if (!realFreeAgent && !has("DESTINATION_SQUAD_LICENSE")) reasons.push("MISSING_DESTINATION_SQUAD_LICENSE_EVIDENCE")
  if (realFreeAgent) {
    if (payload.real?.status !== "FREE_AGENT" || payload.real.club !== null || real.club !== null || real.loan || real.parentClub ||
      movement.kind !== "CURRENT_FREE_AGENT_CONFIRMED" || payload.jointTransfer.movements.filter(m => m.context === "REAL").at(-1)?.kind !== "CURRENT_FREE_AGENT_CONFIRMED")
      reasons.push("CONFIRMED_REAL_FREE_AGENT_REQUIRED")
    if (eligibility.destinationClubId !== null || eligibility.destinationInGame || eligibility.originClubId !== null || eligibility.originAvailable ||
      eligibility.destinationLicense !== "UNKNOWN" || eligibility.individualPlayerEligibility !== "UNKNOWN") reasons.push("FREE_AGENT_MUST_NOT_BIND_A_CLUB")
  } else if (!real?.club || real.state !== "CLUB" || real.club.id !== eligibility.destinationClubId) reasons.push("REAL_DESTINATION_BINDING_REVIEW")
  if (real?.loan && (loanEffectiveState(real.loan, asOf) !== "ACTIVE" || real.parentClub?.id !== eligibility.originClubId)) reasons.push("REAL_LOAN_CHRONOLOGY_OR_ORIGIN_REVIEW")
  if (real?.loan && !["LOAN_START"].includes(movement.kind)) reasons.push("ACTIVE_LOAN_MOVEMENT_TYPE_MISMATCH")
  if (!real?.loan && movement.kind === "LOAN_START") reasons.push("REAL_LOAN_FACT_REQUIRED")
  if (!realFreeAgent && (eligibility.destinationLicense === "UNKNOWN" || eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "UNKNOWN")) reasons.push("DESTINATION_LICENSE_REVIEW")
  if (eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility !== "UNKNOWN" && !eligibility.evidence.some(e =>
    e.role === "PLAYER_DESTINATION_ELIGIBILITY" && validEvidence(e) && e.scope !== "UT_ONLY" && e.eaId === payload.eaPlayerId &&
    e.clubId === real?.club?.id && e.individualDecision === eligibility.individualPlayerEligibility)) reasons.push("INDIVIDUAL_DESTINATION_LICENSE_PROOF_REQUIRED")
  const freeAgent = realFreeAgent || eligibility.destinationLicense === "NO_LICENSED_PLAYERS" || eligibility.destinationLicense === "PARTIAL" && eligibility.individualPlayerEligibility === "INELIGIBLE"
  if (!freeAgent && (!eligibility.destinationInGame || !real?.club?.eaId)) reasons.push("GAME_DESTINATION_AVAILABILITY_REVIEW")
  if (real?.loan && !freeAgent && (!eligibility.originAvailable || !real.parentClub?.eaId || !has("ORIGIN_GAME_PRESENCE"))) reasons.push("GAME_LOAN_ORIGIN_REVIEW")
  const route = real?.loan && real.parentClub && real.club ? { parentClub: real.parentClub, playingClub: real.club } : null
  return {
    version, asOf, policyHash, approvalReference: policy.approvalReference,
    sourceRealHash: projectionHash(sourceReal(payload)), originalEaGameHash: projectionHash(payload.game), movement, eligibility,
    status: reasons.length ? "REVIEW" : "READY", reasons: [...new Set(reasons)], representation: reasons.length ? "PENDING" : freeAgent ? "FREE_AGENT" : "CLUB",
    membership: reasons.length || !real ? null : { ...real, context: "GAME", state: freeAgent ? "FREE_AGENT" : "CLUB", club: freeAgent ? null : real.club,
      // Free-agent representation keeps the documented REAL route without fabricating a GAME loan.
      parentClub: route?.parentClub ?? null, loan: freeAgent ? null : real.loan,
      nationalTeams: payload.jointTransfer.game.nationalTeams, nationalCoverage: version === 2 && payload.jointTransfer.game.nationalCoverage === "NOT_IN_SQUAD" ? "UNKNOWN" : payload.jointTransfer.game.nationalCoverage },
    realLoanRoute: route, officialEaMovementClaimed: false,
  }
}

export function validateRealGameProjection(payload: JointTransferPayload) {
  const p = payload.jointTransfer.futscoutProjection
  if (!p) return
  const checkedAt = p.asOf
  if (!checkedAt || ![1, 2, 3].includes(p.version) || p.officialEaMovementClaimed !== false ||
    canonicalJson(revalidateProjection(payload, p, checkedAt)) !== canonicalJson(p)) throw new Error("REAL_GAME_PROJECTION_INVALID_OR_STALE")
}

/** Only the display context becomes GAME; the underlying loan evidence remains REAL, never an EA claim. */
export function realGameProjectionView(payload: JointTransferPayload, asOf: string): LoanPresentation | null {
  const p = payload.jointTransfer.futscoutProjection
  if (!p || p.status !== "READY" || !p.membership) return null
  validateRealGameProjection(payload)
  if (revalidateProjection(payload, p, asOf).status !== "READY") throw new Error("REAL_GAME_PROJECTION_REQUIRES_REVALIDATION")
  const m = p.membership, real = payload.jointTransfer.real!
  // Approval is checked above; derive loan facts from REAL without relabeling them as EA evidence.
  const value = projectLoanMembership({ membership: { eaId: payload.eaPlayerId, context: "REAL", state: m.state, club: m.club, nationalTeams: m.nationalTeams },
    loan: m.loan ? { ...m.loan, parentClub: m.parentClub!, playingClub: m.club! } : null, asOf })
  return { ...value, context: "GAME", parentClub: m.parentClub,
    realFreeAgent: real.state === "FREE_AGENT" && p.representation !== "EXCLUDED",
    clubLabel: p.representation === "EXCLUDED" ? "Fora da projeção FutScout" : m.state === "FREE_AGENT" && real.state !== "FREE_AGENT" ? "Agente livre" : value.clubLabel,
    provenanceLabel: "Elenco atualizado pelo FutScout — projeção baseada em fatos reais; não é atualização oficial da EA",
    displayContext: "FUTSCOUT_PROJECTED", isOfficialSquadClaimed: false,
    evidence: value.evidence ?? (payload.real ? { url: payload.real.sourceUrl, evidenceDate: p.movement.effectiveAt, consultedAt: payload.real.observedAt,
      contentHash: payload.real.evidenceHash, snapshot: null } : null),
    loanParties: value.loanParties ?? (real.loan && p.representation === "FREE_AGENT" ? null : value.loanParties),
  }
}

export function selectedGameMembership(payload: JointTransferPayload, projected: boolean): BoundMembership {
  if (payload.gameClubSnapshot) return payload.gameClubSnapshot.membership
  if (!projected) return payload.jointTransfer.game
  const p = payload.jointTransfer.futscoutProjection
  if (!p || p.status !== "READY" || !p.membership) throw new Error("READY_JOINT_PROJECTION_REQUIRED")
  return p.membership
}
