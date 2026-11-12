/** Game membership and real employment are independent observations. No latest-source wins. */
export type RosterReference = {
  id: string
  gameVersion: string
  origin: "EA_RATINGS" | "GAME_SQUAD_FILE" | "THIRD_PARTY_TEMPLATE"
  sourceUrl: string
  contentHash: string
  observedAt: string
  effectiveAt: string | null
  effectiveDateEvidence: string | null
  platform: string | null
  gameBuild: string | null
  rosterVersion: string | null
  approvedForCareer: boolean
}

export type ClubContexts = {
  eaPlayerId: string
  game: {
    status: "CLUB" | "NG_FA" | "UNKNOWN"
    club: { eaId: string; name: string } | null
    nativeTeamIds: string[]
    nativeClubTeamIds: string[]
    snapshot: RosterReference
    authenticity: "UNVERIFIED" | "REAL_CONFIRMED" | "GENERIC_CONFIRMED"
    evidenceHash: string
  }
  real: {
    status: "CLUB" | "FREE_AGENT" | "RETIRED" | "UNKNOWN"
    club: { name: string; eaId: string | null } | null
    sourceUrl: string
    observedAt: string
    evidenceKind?: "DIRECT_SOURCE" | "CACHED_SOURCE_REVIEW"
    effectiveAt: string | null
    evidenceHash: string
  } | null
}

const hash = /^[a-f0-9]{64}$/
const date = (value: string) => !Number.isNaN(Date.parse(value))
const source = (value: string) => { try { return new URL(value).protocol === "https:" } catch { return false } }

/** PostgreSQL JSONB key ordering must not change evidence hashes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
  return JSON.stringify(value)
}

export function validateClubContexts(value: ClubContexts, expectedEaId: string): void {
  if (!/^\d+$/.test(expectedEaId) || value.eaPlayerId !== expectedEaId) throw new Error("EA_IDENTITY_MISMATCH")
  const { game, real } = value
  const snapshot = game.snapshot
  if (!["CLUB", "NG_FA", "UNKNOWN"].includes(game.status) ||
      !["UNVERIFIED", "REAL_CONFIRMED", "GENERIC_CONFIRMED"].includes(game.authenticity) ||
      !["EA_RATINGS", "GAME_SQUAD_FILE", "THIRD_PARTY_TEMPLATE"].includes(snapshot.origin) ||
      !snapshot.id || snapshot.gameVersion !== "FC27" || typeof snapshot.approvedForCareer !== "boolean" ||
      !hash.test(game.evidenceHash) || !hash.test(snapshot.contentHash) || !source(snapshot.sourceUrl) ||
      !date(snapshot.observedAt)) throw new Error("GAME_PROVENANCE_REQUIRED")
  if (snapshot.effectiveAt && (!date(snapshot.effectiveAt) || !snapshot.effectiveDateEvidence))
    throw new Error("EFFECTIVE_DATE_EVIDENCE_REQUIRED")
  if (snapshot.approvedForCareer && (snapshot.origin !== "GAME_SQUAD_FILE" || !snapshot.effectiveAt ||
      !snapshot.platform || !snapshot.gameBuild || !snapshot.rosterVersion)) throw new Error("CAREER_REFERENCE_UNPROVEN")
  if (game.status === "CLUB" && (!game.club || game.club.eaId === "111592" ||
      !game.nativeTeamIds.includes(game.club.eaId) || !game.nativeClubTeamIds.includes(game.club.eaId))) throw new Error("GAME_CLUB_NOT_IN_NATIVE_LINKS")
  if (game.status !== "CLUB" && game.club !== null) throw new Error("SPECIAL_OR_UNKNOWN_IS_NOT_A_CLUB")
  if (game.status === "NG_FA" && !game.nativeTeamIds.includes("111592")) throw new Error("NG_FA_EVIDENCE_REQUIRED")
  if (real && (!["CLUB", "FREE_AGENT", "RETIRED", "UNKNOWN"].includes(real.status) ||
      !hash.test(real.evidenceHash) || !source(real.sourceUrl) || !date(real.observedAt) ||
      (real.effectiveAt !== null && !date(real.effectiveAt)))) throw new Error("REAL_PROVENANCE_REQUIRED")
  if (real && ((real.status === "CLUB") !== (real.club !== null))) throw new Error("REAL_CLUB_STATE_INVALID")
  if (real?.club?.eaId === "111592") throw new Error("NG_FA_IS_NOT_A_REAL_CLUB")
}
