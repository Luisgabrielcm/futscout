import { resolveTransferTeamObservation } from "../lib/transferObservations"
import type { TransferClub } from "../types/transferObservation"

type Candidate = TransferClub & { country: string | null; providerLeagueId: number | null; season: number | null; firstTeamMen: boolean }
type SourceTeam = { id: number; name: string; country: string | null; leagueId: number | null; season: number | null; firstTeamMen: boolean }
const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

// This produces proposals only. No resolver fetch, Club creation or nominal association.
export function reviewTransferTeamIdentity(source: SourceTeam, candidates: readonly Candidate[], owners: readonly TransferClub[]) {
  if (!Number.isSafeInteger(source.id) || source.id < 1 || !source.name.trim()) throw new Error("INVALID_TRANSFER_TEAM")
  const exact = resolveTransferTeamObservation(source.id, source.name, owners)
  if (exact.status !== "UNKNOWN_TEAM") return { decision: exact.status, clubId: exact.clubId, writable: false as const, reasons: ["EXACT_PROVIDER_OWNERSHIP"] }
  const compatible = candidates.filter(c => c.apiFootballId === null && source.firstTeamMen && c.firstTeamMen &&
    normalize(source.name).length >= 5 && normalize(source.name) === normalize(c.name) &&
    !!source.country && !!c.country && normalize(source.country).length >= 2 && normalize(source.country) === normalize(c.country) &&
    Number.isSafeInteger(source.leagueId) && source.leagueId! > 0 && source.leagueId === c.providerLeagueId &&
    Number.isSafeInteger(source.season) && source.season! > 1900 && source.season === c.season)
  // Country/league/season must be independently verified inputs, never guessed from names.
  if (compatible.length === 1 && candidates.filter(c => c.id === compatible[0].id).length === 1) {
    return { decision: "AUTO_MATCH_CANDIDATE", clubId: compatible[0].id, writable: false as const,
      reasons: ["EXACT_NORMALIZED_NAME", "COUNTRY_LEAGUE_SEASON_CORROBORATED", "UNOWNED_LOCAL_CLUB"] }
  }
  return { decision: "TEAM_IDENTITY_REVIEW", clubId: null, writable: false as const,
    reasons: [compatible.length > 1 ? "AMBIGUOUS_TEAM_CANDIDATES" : "INDEPENDENT_TEAM_EVIDENCE_REQUIRED"] }
}
