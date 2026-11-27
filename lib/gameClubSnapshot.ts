import { canonicalJson, validateClubContexts, type RosterReference } from "./clubContexts"
import { validateLoanObservation } from "./jointTransferLoanSync"
import type { BoundMembership, JointTransferPayload } from "./jointTransferContexts"

/** A selected squad changes GAME membership without replacing REAL or the original EA observation. */
export type GameClubSnapshot = {
  version: 1; snapshot: RosterReference; evidenceHash: string
  nativeTeamIds: string[]; nativeClubTeamIds: string[]
  membership: BoundMembership
  economicsZeroBefore: boolean
}

export function validateGameClubSnapshot(payload: JointTransferPayload) {
  const selected = payload.gameClubSnapshot
  if (!selected) return
  const m = selected.membership
  if (selected.version !== 1 || typeof selected.economicsZeroBefore !== "boolean" || m.context !== "GAME" ||
      !["CLUB", "FREE_AGENT"].includes(m.state) || (m.state === "CLUB") !== (m.club !== null) ||
      canonicalJson(m.nationalTeams) !== canonicalJson(payload.jointTransfer.game.nationalTeams) ||
      m.nationalCoverage !== payload.jointTransfer.game.nationalCoverage) throw new Error("GAME_CLUB_SNAPSHOT_INVALID")
  validateClubContexts({ eaPlayerId: payload.eaPlayerId, real: null, game: {
    status: m.state === "CLUB" ? "CLUB" : "NG_FA", club: m.club ? { eaId: m.club.eaId!, name: m.club.name } : null,
    nativeTeamIds: selected.nativeTeamIds, nativeClubTeamIds: selected.nativeClubTeamIds,
    snapshot: selected.snapshot, authenticity: payload.game.authenticity, evidenceHash: selected.evidenceHash,
  } }, payload.eaPlayerId)
  for (const c of [m.club, m.parentClub]) if (c && (!c.id || !c.name || !c.eaId || !/^\d+$/.test(c.eaId) || c.eaId === "111592"))
    throw new Error("GAME_CLUB_SNAPSHOT_BINDING_INVALID")
  if (!m.loan && m.parentClub) throw new Error("GAME_CLUB_SNAPSHOT_PARENT_WITHOUT_LOAN")
  if (m.loan) {
    validateLoanObservation(m.loan)
    if (m.loan.eaId !== payload.eaPlayerId || m.loan.context !== "GAME" || m.loan.state !== "ACTIVE_IN_SNAPSHOT" ||
        !m.club || !m.parentClub || m.loan.playingClub.id !== m.club.eaId || m.loan.parentClub.id !== m.parentClub.eaId ||
        m.loan.evidence.snapshot?.contentHash !== selected.snapshot.contentHash)
      throw new Error("GAME_CLUB_SNAPSHOT_LOAN_INVALID")
  }
}
