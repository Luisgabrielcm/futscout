import { jointFixture, fixtureDate } from "./jointTransfer"
import { realGamePolicyHash, type RealGameEligibility, type EligibilityEvidence } from "../../lib/realGameProjection"
import type { JointMovement } from "../../lib/jointTransferContexts"

/** Synthetic eligibility evidence only; no private publication decisions or player hashes. */
export function projectionFixture(eaId = "276528") {
  const candidate = jointFixture(eaId), real = candidate.jointTransfer.real!
  const movement: JointMovement = { eaId: candidate.eaPlayerId, context: "REAL", kind: "LOAN_START", evidenceConfirmed: true,
    evidenceHash: real.loan!.evidence.contentHash, sourceUrl: real.loan!.evidence.url, effectiveAt: null }
  candidate.jointTransfer.movements = [movement]
  const evidence = (role: EligibilityEvidence["role"], scope: EligibilityEvidence["scope"], clubId?: string): EligibilityEvidence => ({
    role, scope, clubId, eaId: candidate.eaPlayerId, gameVersion: role === "PLAYER_IDENTITY" ? null : "FC27",
    url: "https://example.invalid/eligibility", contentHash: "e".repeat(64), consultedAt: fixtureDate, evidenceDate: null, strength: "PRIMARY",
  })
  const eligibility: RealGameEligibility = { eaId: candidate.eaPlayerId, policyHash: realGamePolicyHash,
    identity: "CONFIRMED", gamePresence: "AVAILABLE", destinationClubId: real.club!.id, destinationInGame: true,
    originClubId: real.parentClub!.id, originAvailable: true, destinationLicense: "LICENSED_PLAYERS", individualPlayerEligibility: "ELIGIBLE",
    evidence: [evidence("PLAYER_IDENTITY", "REAL_IDENTITY"), evidence("PLAYER_GAME_PRESENCE", "CAREER"),
      evidence("DESTINATION_SQUAD_LICENSE", "GENERAL_LICENSING", real.club!.id), evidence("ORIGIN_GAME_PRESENCE", "CAREER", real.parentClub!.id)],
  }
  return { candidate, movement, eligibility }
}
