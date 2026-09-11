import type { ApiFootballTeamPlayer } from "./getApiFootballTeamPlayers"
import { evaluateCandidate } from "./apiFootballPlayerCandidate"
import { calculateNameScore, evaluateApiFootballPlayerCandidateRanking } from "./apiFootballPlayerMatcherCore"
import type { OfficialLineup } from "../types/officialLineup"

// Operational constraints for this pilot, not new general matcher thresholds.
export const BARCELONA_IDENTITY_PILOT = { slug: "fc-barcelona", teamId: 529, season: 2026, maxPlayers: 5 } as const
export type IdentityPlayer = {
  id: string; name: string; apiFootballId: number | null; dateOfBirth: Date | null
  nationality: string | null; position: string; secondaryPositions: string[]
  club: { name: string; apiFootballId: number | null } | null
  attempt: { status: string; nextRetryAt: Date | null } | null
}
export type IdentityCache = {
  apiTeamId: number; season: number; fetchedAt: Date; expiresAt: Date; playerCount: number; players: unknown
}
export type IdentityDecision = "AUTO_MATCH" | "REVIEW" | "UNRESOLVED" | "CONFLICT"
export type IdentityInput = {
  playerIds: string[]; season: number; now: Date; players: IdentityPlayer[]
  cache: IdentityCache | null; lineup: OfficialLineup
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const nullableText = (v: unknown) => v === null || typeof v === "string"
const positiveId = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0
const dateValue = (v: Date) => v instanceof Date && Number.isFinite(v.getTime())

// Fail closed before evaluation; never request or refresh a cache here.
export function requireIdentityRoster(cache: IdentityCache | null, season: number, now: Date): ApiFootballTeamPlayer[] {
  if (season !== BARCELONA_IDENTITY_PILOT.season || !dateValue(now)) throw new Error("INVALID_PILOT_SEASON_OR_TIME")
  if (!cache) throw new Error("FRESH_ROSTER_REQUIRED")
  if (cache.apiTeamId !== 529 || cache.season !== season || !dateValue(cache.fetchedAt) || !dateValue(cache.expiresAt) ||
      cache.fetchedAt > now || cache.expiresAt <= now || cache.expiresAt <= cache.fetchedAt ||
      cache.expiresAt.getTime() - cache.fetchedAt.getTime() > 7 * 86400000) throw new Error("FRESH_ROSTER_REQUIRED")
  if (!Array.isArray(cache.players) || !cache.players.length || cache.playerCount !== cache.players.length) throw new Error("INVALID_ROSTER")
  const ids = new Set<number>()
  for (const item of cache.players) {
    if (!object(item) || !object(item.player) || !positiveId(item.player.id) || typeof item.player.name !== "string" ||
        !item.player.name.trim() || !nullableText(item.player.firstname) || !nullableText(item.player.lastname) ||
        !nullableText(item.player.nationality) || !object(item.player.birth) || !nullableText(item.player.birth.date) ||
        !Array.isArray(item.statistics) || !item.statistics.length) throw new Error("INVALID_ROSTER")
    if (ids.has(item.player.id)) throw new Error("DUPLICATE_ROSTER_PROVIDER_ID")
    ids.add(item.player.id)
    for (const stat of item.statistics) {
      if (!object(stat) || !object(stat.team) || !positiveId(stat.team.id) || typeof stat.team.name !== "string" ||
          !object(stat.league) || stat.league.season !== season ||
          (stat.games !== undefined && (!object(stat.games) ||
            (stat.games.position !== undefined && !nullableText(stat.games.position))))) throw new Error("INVALID_ROSTER")
    }
  }
  return cache.players as ApiFootballTeamPlayer[]
}

function compatiblePosition(player: IdentityPlayer, source: ApiFootballTeamPlayer) {
  const groups: Record<string, string[]> = {
    Goalkeeper: ["GOL"], Defender: ["ZAG", "LE", "LD"], Midfielder: ["VOL", "MC", "MEI", "PE", "PD"],
    Attacker: ["ATA", "PE", "PD"],
  }
  const positions = [player.position, ...player.secondaryPositions]
  return source.statistics.some(s => s.team.id === 529 &&
    (groups[s.games?.position ?? ""] ?? []).some(p => positions.includes(p)))
}

export function planBarcelonaIdentityCoverage(input: IdentityInput) {
  const { playerIds, season, now, players, lineup } = input
  if (!playerIds.length || playerIds.length > 5 || new Set(playerIds).size !== playerIds.length) throw new Error("EXPLICIT_MAX_FIVE_PLAYERS_REQUIRED")
  const localIds = new Set<string>(), providerIds = new Set<number>()
  for (const p of players) {
    if (localIds.has(p.id)) throw new Error("DUPLICATE_LOCAL_PLAYER")
    localIds.add(p.id)
    if (p.apiFootballId !== null) {
      if (!positiveId(p.apiFootballId) || providerIds.has(p.apiFootballId)) throw new Error("INVALID_OR_DUPLICATE_CATALOG_PROVIDER_ID")
      providerIds.add(p.apiFootballId)
    }
  }
  if (lineup.provider !== "api-football" || lineup.apiTeamId !== 529 ||
      !Number.isFinite(Date.parse(lineup.fixture.date)) || Date.parse(lineup.fixture.date) > now.getTime() ||
      now.getTime() - Date.parse(lineup.fixture.date) > 30 * 86400000) throw new Error("RECENT_BARCELONA_SNAPSHOT_REQUIRED")
  const sourceIds = new Set<number>()
  for (const p of [...lineup.startXI, ...(lineup.substitutes ?? [])]) {
    if (!positiveId(p.apiFootballId) || sourceIds.has(p.apiFootballId)) throw new Error("INVALID_OR_DUPLICATE_LINEUP_ID")
    sourceIds.add(p.apiFootballId)
  }
  const roster = requireIdentityRoster(input.cache, season, now)
  const rows: Array<{ playerId: string; player: string; sourcePlayerId: number | null; candidate: string | null
    score: number | null; nameScore: number | null; margin: number | null; birthMatches: boolean
    clubMatches: boolean; nationalityMatches: boolean; decision: IdentityDecision; reason: string }> = []
  let failedFast = false
  for (const id of playerIds) {
    const player = players.find(p => p.id === id)
    if (!player) throw new Error("REQUESTED_PLAYER_NOT_FOUND")
    const ranking = evaluateApiFootballPlayerCandidateRanking(roster.flatMap(candidate => {
      const match = evaluateCandidate({ player: { ...player, club: player.club ?? { name: "" } }, candidate, apiTeamId: 529 })
      return match ? [match] : []
    }))
    const best = ranking.top1
    let decision: IdentityDecision = "UNRESOLVED", reason = "NO_NAME_EVIDENCE", stop = false
    if (best && best.nameScore > 0) {
      const source = roster.find(p => p.player.id === best.apiFootballId)!
      const owner = players.find(p => p.apiFootballId === best.apiFootballId)
      const competingLocals = players.filter(p => p.id !== player.id && p.dateOfBirth && player.dateOfBirth &&
        p.dateOfBirth.toISOString().slice(0, 10) === player.dateOfBirth.toISOString().slice(0, 10)).filter(p => {
          const rival = evaluateCandidate({ player: { ...p, club: p.club ?? { name: "" } }, candidate: source, apiTeamId: 529 })
          return rival && rival.nameScore >= 80 && rival.birthMatches
        })
      if ((player.apiFootballId !== null && player.apiFootballId !== best.apiFootballId) || (owner && owner.id !== player.id)) {
        decision = "CONFLICT"; reason = "EXISTING_ID_OR_PROVIDER_OWNER_CONFLICT"; stop = true
      } else if (player.apiFootballId !== null) {
        decision = "REVIEW"; reason = "ALREADY_ASSOCIATED_NO_WRITE"
      } else if (player.club?.apiFootballId !== 529 || !source.statistics.some(s => s.team.id === 529)) {
        decision = "REVIEW"; reason = "CLUB_MISMATCH_OR_STALE"; stop = true
      } else if (ranking.ambiguous || ranking.top2?.classification === "MATCH FORTE" || competingLocals.length) {
        decision = "REVIEW"; reason = "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY"; stop = true
      } else if (!sourceIds.has(best.apiFootballId) ||
          calculateNameScore([...lineup.startXI, ...(lineup.substitutes ?? [])].find(p => p.apiFootballId === best.apiFootballId)!.name, source) < 80) {
        decision = "REVIEW"; reason = "ROSTER_LINEUP_DISAGREEMENT"
      } else if (player.attempt?.status === "matched" || (player.attempt?.nextRetryAt && player.attempt.nextRetryAt > now)) {
        decision = "REVIEW"; reason = "ATTEMPT_RETRY_BLOCKED"
      } else if (!compatiblePosition(player, source)) {
        decision = "REVIEW"; reason = "POSITION_NOT_CORROBORATED"
      } else if (!ranking.canAutoSave) {
        decision = "REVIEW"; reason = "EXISTING_MATCHER_SAFETY_NOT_MET"
      } else {
        decision = "AUTO_MATCH"; reason = "EXISTING_MATCHER_AND_PILOT_GATES_PASSED"
      }
    }
    rows.push({ playerId: id, player: player.name, sourcePlayerId: best?.apiFootballId ?? null, candidate: best?.apiFullName || best?.apiName || null,
      score: best?.confidence ?? null, nameScore: best?.nameScore ?? null, margin: ranking.margin,
      birthMatches: best?.birthMatches ?? false, clubMatches: best?.clubMatches ?? false,
      nationalityMatches: best?.nationalityMatches ?? false, decision, reason })
    if (stop) { failedFast = true; break }
  }
  // AUTO_MATCH is evidence for a later authorization, NEVER a write instruction.
  return { mode: "dry-run" as const, rows, failedFast, remainingPlayerIds: playerIds.slice(rows.length),
    counts: { AUTO_MATCH: rows.filter(r => r.decision === "AUTO_MATCH").length, REVIEW: rows.filter(r => r.decision === "REVIEW").length,
      UNRESOLVED: rows.filter(r => r.decision === "UNRESOLVED").length, CONFLICT: rows.filter(r => r.decision === "CONFLICT").length },
    apiCalls: 0, writes: 0 }
}

export function parseIdentityPilotArgs(args: string[]) {
  if (args.length !== 5 || args[0] !== "--dry-run" || args[1] !== "--season" || args[2] !== "2026" || args[3] !== "--player-ids") {
    throw new Error("ONLY_EXPLICIT_BARCELONA_DRY_RUN_SUPPORTED_WRITE_DISABLED")
  }
  const playerIds = args[4].split(",")
  if (!playerIds.length || playerIds.length > 5 || new Set(playerIds).size !== playerIds.length ||
      playerIds.some(id => !/^[a-z0-9]{20,32}$/.test(id))) throw new Error("EXPLICIT_MAX_FIVE_PLAYERS_REQUIRED")
  return { playerIds, season: 2026 }
}
