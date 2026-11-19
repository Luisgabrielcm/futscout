import { jointHash, prepareJointContextPayload, validateJointTransferPayload, type JointMovement, type JointTransferPayload } from "./jointTransferContexts"
import { loanEffectiveState } from "./jointTransferLoanSync"

export function preservedGameHash(p: JointTransferPayload) {
  return jointHash({ game: p.game, membership: p.jointTransfer.game,
    movements: p.jointTransfer.movements.filter(m => m.context === "GAME"), history: p.jointTransfer.history.filter(l => l.context === "GAME") })
}
export function validateRealOnlyMovement(p: JointTransferPayload, asOf: string) {
  validateJointTransferPayload(p)
  if (!p.real || !p.jointTransfer.real || p.jointTransfer.futscoutProjection) throw new Error("REAL_ONLY_INDEPENDENT_CONTEXT_REQUIRED")
  const m = p.jointTransfer.movements.at(-1), real = p.jointTransfer.real
  if (!m || m.context !== "REAL" || !m.evidenceConfirmed || !["PERMANENT_TRANSFER", "LOAN_TO_PERMANENT", "LOAN_START", "CURRENT_CLUB_CONFIRMED", "CURRENT_FREE_AGENT_CONFIRMED", "RETIREMENT_CONFIRMED"].includes(m.kind))
    throw new Error("REAL_ONLY_EXPLICIT_MOVEMENT_REQUIRED")
  if (m.evidenceHash !== p.real.evidenceHash || m.sourceUrl !== p.real.sourceUrl)
    throw new Error("REAL_ONLY_MOVEMENT_BINDING_REQUIRED")
  if (m.effectiveAt && m.effectiveAt > asOf) throw new Error("REAL_ONLY_FUTURE_MOVEMENT")
  if (m.kind === "CURRENT_FREE_AGENT_CONFIRMED" || m.kind === "RETIREMENT_CONFIRMED") {
    const expected = m.kind === "RETIREMENT_CONFIRMED" ? "RETIRED" : "FREE_AGENT"
    if (real.state !== expected || p.real.status !== expected || real.club || real.loan || real.parentClub || m.route)
      throw new Error("REAL_ONLY_EMPLOYMENT_STATUS_INVALID")
    return m.kind === "RETIREMENT_CONFIRMED" ? "REAL_ONLY_RETIRED" as const : "REAL_ONLY_FREE_AGENT" as const
  }
  if (m.kind === "CURRENT_CLUB_CONFIRMED") {
    if (real.state !== "CLUB" || !real.club || real.loan || real.parentClub || m.route || m.effectiveAt !== null)
      throw new Error("REAL_ONLY_MEMBERSHIP_CANNOT_ASSERT_MOVEMENT")
    return "REAL_ONLY_CLUB_CONFIRMATION" as const
  }
  if (!m.route || m.route.toClub.id !== real.club?.id) throw new Error("REAL_ONLY_MOVEMENT_BINDING_REQUIRED")
  if (m.kind === "LOAN_START") {
    if (!real.loan || loanEffectiveState(real.loan, asOf) !== "ACTIVE" || m.route.fromClub?.id !== real.parentClub?.id || m.route.fromState !== "CLUB" ||
      real.loan.evidence.contentHash !== m.evidenceHash || real.loan.evidence.url !== m.sourceUrl)
      throw new Error("REAL_ONLY_CURRENT_LOAN_ROUTE_REQUIRED")
  } else if (real.loan || real.parentClub) throw new Error("REAL_ONLY_PERMANENT_STILL_HAS_ACTIVE_LOAN")
  return m.kind === "LOAN_START" ? "REAL_ONLY_LOAN" as const : "REAL_ONLY_TRANSFER" as const
}
/** The captured GAME baseline is retained as evidence, never constructed from the real destination. */
export function prepareRealOnlyPayload(base: JointTransferPayload, patch: {
  real: NonNullable<Parameters<typeof prepareJointContextPayload>[1]["real"]>; movement: JointMovement;
  history?: Parameters<typeof prepareJointContextPayload>[1]["history"]
}, asOf: string) {
  validateJointTransferPayload(base)
  if (base.jointTransfer.futscoutProjection) throw new Error("REAL_ONLY_CANNOT_REPLACE_PUBLISHED_GAME_PROJECTION")
  if (patch.history?.some(l => l.context !== "REAL") || patch.movement.context !== "REAL") throw new Error("REAL_ONLY_GAME_PATCH_FORBIDDEN")
  const baselineHash = preservedGameHash(base), payload = prepareJointContextPayload(base, {
    real: patch.real, movements: [patch.movement], history: patch.history,
  })
  if (preservedGameHash(payload) !== baselineHash) throw new Error("REAL_ONLY_GAME_BASELINE_CHANGED")
  return { payload, category: validateRealOnlyMovement(payload, asOf), expectedGameBaselineHash: baselineHash }
}
