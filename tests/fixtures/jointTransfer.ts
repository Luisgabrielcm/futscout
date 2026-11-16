import type { ClubContexts } from "../../lib/clubContexts"
import { jointHash, prepareJointContextPayload, type BoundClub, type JointTransferPayload, type JointReadManifest } from "../../lib/jointTransferContexts"
import type { LoanObservation } from "../../lib/jointTransferLoanSync"

export const city: BoundClub = { id: "fixture-city", eaId: "10", name: "Manchester City", slug: "city", league: { id: "league-eng", name: "Premier League", slug: "premier-league" } }
export const benfica: BoundClub = { id: "fixture-benfica", eaId: "234", name: "Benfica", slug: "benfica", league: { id: "league-pt", name: "Liga Portugal", slug: "liga-portugal" } }
export const fixtureDate = "2026-11-16T00:00:00.000Z"
export function jointFixture(eaId = "276528"): JointTransferPayload {
  const base: ClubContexts = { eaPlayerId: eaId, game: {
    status: "CLUB", club: { eaId: "10", name: city.name }, nativeTeamIds: ["10", "1370"], nativeClubTeamIds: ["10"],
    snapshot: { id: "synthetic-reference", gameVersion: "FC27", origin: "THIRD_PARTY_TEMPLATE", sourceUrl: "https://example.invalid/squad", contentHash: "a".repeat(64), observedAt: fixtureDate,
      effectiveAt: null, effectiveDateEvidence: null, platform: null, gameBuild: null, rosterVersion: "synthetic-only", approvedForCareer: false },
    authenticity: "UNVERIFIED", evidenceHash: "b".repeat(64),
  }, real: { status: "CLUB", club: { eaId: benfica.eaId, name: benfica.name }, sourceUrl: "https://example.invalid/loan", observedAt: fixtureDate, effectiveAt: null, evidenceHash: "c".repeat(64) } }
  const loan: LoanObservation = { eaId, context: "REAL", loanKey: `synthetic:${eaId}`, state: "ACTIVE", parentClub: city, playingClub: benfica,
    startsAt: null, endsAt: null, endSeason: "2026/27", purchase: { kind: "OPTION", condition: null, evidenceUrl: "https://example.invalid/loan" },
    identityConfirmed: true, chronologyConfirmed: true, movementTypeConfirmed: true,
    evidence: { url: "https://example.invalid/loan", evidenceDate: "2026-09-02", consultedAt: fixtureDate, contentHash: "d".repeat(64), snapshot: null } }
  return prepareJointContextPayload(base, { game: { context: "GAME", state: "CLUB", club: city, parentClub: null, loan: null, nationalTeams: [{ eaTeamId: "1370", name: "Brasil" }], nationalCoverage: "KNOWN" },
    real: { membership: { context: "REAL", state: "CLUB", club: benfica, parentClub: city, loan, nationalTeams: [], nationalCoverage: "UNKNOWN" }, evidence: base.real! } })
}
export function freeAgentFixture() {
  const p = jointFixture("233927")
  p.game = { ...p.game, status: "NG_FA", club: null, nativeTeamIds: ["111592", "1370"], nativeClubTeamIds: [] }
  p.jointTransfer.game = { ...p.jointTransfer.game, state: "FREE_AGENT", club: null }
  return p
}
export function jointEnvironment(payloads: JointTransferPayload[], contexts: ("GAME" | "REAL")[] = ["GAME", "REAL"]) {
  const manifest: JointReadManifest = { version: 1, decisionReference: "synthetic-approved-decision", entries: payloads.map(p => ({ eaId: p.eaPlayerId, payloadHash: jointHash(p), snapshotHash: p.game.snapshot.contentHash, contexts })) }
  return { VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_READ_ONLY: "1", JOINT_TRANSFER_READ_ENABLED: "1", JOINT_TRANSFER_READ_MANIFEST: JSON.stringify(manifest), JOINT_TRANSFER_READ_MANIFEST_SHA256: jointHash(manifest) }
}
