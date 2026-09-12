import { createHash } from "node:crypto"
import { evaluateCandidate, type ApiFootballPlayerMatch } from "./apiFootballPlayerCandidate"
import { calculateNameScore, evaluateApiFootballPlayerCandidateRanking } from "./apiFootballPlayerMatcherCore"
import { decodeLineupSnapshot, type SnapshotData } from "../lib/officialLineupSnapshot"
import type { ApiFootballTeamPlayer } from "./getApiFootballTeamPlayers"

export type ClubIdentityMode = "DRY_RUN" | "AUTO_WRITE"
export type ClubIdentityDecision = "ALREADY_MATCHED" | "AUTO_MATCH" | "REVIEW" | "UNRESOLVED" | "CONFLICT"
export type ClubIdentityConfig = {
  clubId: string; clubSlug: string; apiFootballTeamId: number; season: number; mode: ClubIdentityMode
  cache: { maxAgeDays: number; expectedRowHash?: string }
  snapshot: { required: boolean; requireParticipation: boolean; expectedHash?: string }
  writePolicy: { maxAutoWrites: number; stopOnConflict: true; stopOnAuditMismatch: true; stopOnIndeterminateCommit: true; zeroRetry: true }
  budget: { maxProviderPlayers: number; maxRelevantPlayers: number; maxDryRunAgeMs: number }
}
export type ClubIdentityPlayer = {
  id: string; slug: string; name: string; externalId: string | null; apiFootballId: number | null
  dateOfBirth: Date | null; nationality: string | null; position: string; secondaryPositions: string[]
  clubId: string | null; club: { name: string; apiFootballId: number | null } | null; updatedAt: Date
  attempt: { status: string; lastApiFootballId: number | null; nextRetryAt: Date | null } | null
}
export type ClubIdentityEvidence = {
  club: { id: string; slug: string; apiFootballId: number | null }
  cache: { id: string; apiTeamId: number; season: number; players: unknown; playerCount: number; fetchedAt: Date; expiresAt: Date } | null
  cacheRowHash: string | null
  snapshot: (SnapshotData & { id: string }) | null
  // Complete club roster + global provider owners + all same-birth candidates, loaded in bulk.
  players: ClubIdentityPlayer[]
}
export const clubIdentityHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const positive = (n: number) => Number.isSafeInteger(n) && n > 0
const validDate = (d: Date) => d instanceof Date && Number.isFinite(d.getTime())
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v)
const nullableText = (v: unknown) => v === null || typeof v === "string"
const orderId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export function requireClubIdentityConfig(config: ClubIdentityConfig) {
  if (config.mode !== "DRY_RUN") throw new Error("AUTO_WRITE_DISABLED")
  if (!config.clubId || !config.clubSlug || !positive(config.apiFootballTeamId) || !positive(config.season) ||
      !positive(config.cache.maxAgeDays) || config.cache.maxAgeDays > 7 ||
      !positive(config.budget.maxProviderPlayers) || !positive(config.budget.maxRelevantPlayers) ||
      !positive(config.budget.maxDryRunAgeMs) || !Number.isSafeInteger(config.writePolicy.maxAutoWrites) ||
      config.writePolicy.maxAutoWrites < 0 ||
      [config.writePolicy.stopOnConflict, config.writePolicy.stopOnAuditMismatch, config.writePolicy.stopOnIndeterminateCommit,
        config.writePolicy.zeroRetry].some(v => v !== true)) throw new Error("INVALID_CLUB_IDENTITY_CONFIG")
}

export function requireClubIdentityRoster(config: ClubIdentityConfig, evidence: Pick<ClubIdentityEvidence, "cache" | "cacheRowHash">, now: Date): ApiFootballTeamPlayer[] {
  requireClubIdentityConfig(config)
  const c = evidence.cache
  if (!validDate(now) || !c || c.apiTeamId !== config.apiFootballTeamId || c.season !== config.season ||
      !validDate(c.fetchedAt) || !validDate(c.expiresAt) || c.fetchedAt > now || c.expiresAt <= now ||
      c.expiresAt <= c.fetchedAt || c.expiresAt.getTime() - c.fetchedAt.getTime() > config.cache.maxAgeDays * 86400000 ||
      now.getTime() - c.fetchedAt.getTime() > config.cache.maxAgeDays * 86400000) throw new Error("VALID_ROSTER_REQUIRED")
  if (!evidence.cacheRowHash || (config.cache.expectedRowHash && config.cache.expectedRowHash !== evidence.cacheRowHash)) throw new Error("CACHE_HASH_CHANGED")
  if (!Array.isArray(c.players) || !c.players.length || c.players.length !== c.playerCount ||
      c.playerCount > config.budget.maxProviderPlayers) throw new Error("INVALID_ROSTER_OR_BUDGET")
  const ids = new Set<number>()
  for (const entry of c.players) {
    if (!record(entry) || !record(entry.player) || !positive(Number(entry.player.id)) || typeof entry.player.id !== "number" ||
        typeof entry.player.name !== "string" || !entry.player.name.trim() || !nullableText(entry.player.firstname) ||
        !nullableText(entry.player.lastname) || !nullableText(entry.player.nationality) || !record(entry.player.birth) ||
        !nullableText(entry.player.birth.date) || !Array.isArray(entry.statistics) || !entry.statistics.length) throw new Error("INVALID_ROSTER")
    const birth = entry.player.birth.date
    if (typeof birth === "string" && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(Date.parse(birth)) ||
        new Date(birth).toISOString().slice(0, 10) !== birth)) throw new Error("INVALID_ROSTER_BIRTH")
    if (ids.has(entry.player.id)) throw new Error("DUPLICATE_ROSTER_PROVIDER")
    ids.add(entry.player.id)
    for (const s of entry.statistics) {
      if (!record(s) || !record(s.team) || typeof s.team.id !== "number" || !positive(s.team.id) || typeof s.team.name !== "string" ||
          !record(s.league) || s.league.season !== config.season || (s.games !== undefined &&
            (!record(s.games) || (s.games.position !== undefined && !nullableText(s.games.position))))) throw new Error("INVALID_ROSTER_STATISTICS")
    }
  }
  return c.players as ApiFootballTeamPlayer[]
}

// Same position groups as the calibrated pilot. Unknown positions do not gain new aliases.
function positionMatches(p: ClubIdentityPlayer, r: ApiFootballTeamPlayer, teamId: number) {
  const groups: Record<string, string[]> = { Goalkeeper: ["GOL"], Defender: ["ZAG", "LE", "LD"],
    Midfielder: ["VOL", "MC", "MEI", "PE", "PD"], Attacker: ["ATA", "PE", "PD"] }
  return r.statistics.some(s => s.team.id === teamId &&
    (groups[s.games?.position ?? ""] ?? []).some(v => [p.position, ...p.secondaryPositions].includes(v)))
}
const candidateInfo = (m: ApiFootballPlayerMatch | null) => m && ({ playerId: m.futScoutPlayerId,
  playerName: m.futScoutPlayerName, providerId: m.apiFootballId, providerName: m.apiFullName || m.apiName,
  confidence: m.confidence, nameScore: m.nameScore, birthMatches: m.birthMatches,
  nationalityMatches: m.nationalityMatches, clubMatches: m.clubMatches, classification: m.classification })
function attemptConsistent(p: ClubIdentityPlayer) {
  return !p.attempt || (p.attempt.status === "matched" && p.attempt.lastApiFootballId === p.apiFootballId)
}

// All matching is in memory. This module has no DB/env/HTTP/persistence imports.
export function runClubPlayerIdentityPipeline(config: ClubIdentityConfig, evidence: ClubIdentityEvidence, now: Date) {
  const roster = [...requireClubIdentityRoster(config, evidence, now)].sort((a, b) => a.player.id - b.player.id)
  if (evidence.club.id !== config.clubId || evidence.club.slug !== config.clubSlug ||
      evidence.club.apiFootballId !== config.apiFootballTeamId) throw new Error("CLUB_IDENTITY_MISMATCH")
  if (evidence.players.length > config.budget.maxRelevantPlayers) throw new Error("RELEVANT_PLAYERS_BUDGET_EXCEEDED")
  const players = [...evidence.players].sort(orderId), locals = players.filter(p => p.clubId === config.clubId)
  const byId = new Map<string, ClubIdentityPlayer>(), owners = new Map<number, ClubIdentityPlayer[]>()
  for (const p of players) {
    if (byId.has(p.id) || !validDate(p.updatedAt) || (p.dateOfBirth !== null && !validDate(p.dateOfBirth)) ||
        (p.apiFootballId !== null && !positive(p.apiFootballId))) throw new Error("INVALID_LOCAL_IDENTITY")
    byId.set(p.id, p)
    if (p.apiFootballId !== null) owners.set(p.apiFootballId, [...(owners.get(p.apiFootballId) ?? []), p])
  }
  const snapshot = evidence.snapshot
  if (!snapshot && (config.snapshot.required || config.snapshot.expectedHash)) throw new Error("SNAPSHOT_REQUIRED")
  const lineup = snapshot ? decodeLineupSnapshot(snapshot, now) : null
  if (snapshot && (!lineup || snapshot.clubId !== config.clubId || lineup.apiTeamId !== config.apiFootballTeamId ||
      (config.snapshot.expectedHash && snapshot.contentHash !== config.snapshot.expectedHash))) throw new Error("INVALID_SNAPSHOT")
  const participants = new Map([...(lineup?.startXI ?? []), ...(lineup?.substitutes ?? [])].map(p => [p.apiFootballId, p]))
  // Preserve LOCAL -> FULL ROSTER ranking. Reversing the search alone can hide a second strong provider.
  const matrix = new Map(players.map(p => [p.id, roster.map(r => evaluateCandidate({
    player: { ...p, club: p.club ?? { name: "" } }, candidate: r, apiTeamId: config.apiFootballTeamId,
  })!)]))
  const rankings = new Map(players.map(p => [p.id, evaluateApiFootballPlayerCandidateRanking(matrix.get(p.id)!)]))
  const rows = roster.map((source, index) => {
    const ownerList = owners.get(source.player.id) ?? [], owner = ownerList[0]
    const localCandidates = locals.map(p => matrix.get(p.id)![index]).filter(m => m.nameScore > 0)
      .sort((a, b) => b.confidence - a.confidence || orderId({ id: a.futScoutPlayerId }, { id: b.futScoutPlayerId }))
    const externalCandidates = players.filter(p => p.clubId !== config.clubId).map(p => matrix.get(p.id)![index])
      .filter(m => m.nameScore >= 80 && m.birthMatches).sort((a, b) => b.confidence - a.confidence || orderId({ id: a.futScoutPlayerId }, { id: b.futScoutPlayerId }))
    const bestLocal = localCandidates[0]
    // A weak shared token is not identity evidence: do not let it hide a same-birth
    // strong external candidate. External candidates remain REVIEW, never writable.
    const localIdentity = bestLocal?.birthMatches && bestLocal.nameScore >= 80 ? bestLocal : null
    const p = owner ?? byId.get(localIdentity?.futScoutPlayerId ?? externalCandidates[0]?.futScoutPlayerId ?? bestLocal?.futScoutPlayerId ?? "") ?? null
    const m = p ? matrix.get(p.id)![index] : null, ranking = p ? rankings.get(p.id)! : null
    const rivals = p && m ? players.filter(other => other.id !== p.id).map(other => matrix.get(other.id)![index])
      .filter(r => r.birthMatches && r.nameScore >= 80) : []
    const participant = participants.get(source.player.id)
    const lineupNameScore = participant ? calculateNameScore(participant.name, source) : null
    const position = p ? positionMatches(p, source, config.apiFootballTeamId) : false
    const rosterClub = source.statistics.some(s => s.team.id === config.apiFootballTeamId)
    let decision: ClubIdentityDecision = "UNRESOLVED", reason = "NO_LOCAL_NAME_EVIDENCE"
    if (ownerList.length > 1) { decision = "CONFLICT"; reason = "DUPLICATE_PROVIDER_OWNER" }
    else if (owner && bestLocal && bestLocal.futScoutPlayerId !== owner.id && bestLocal.canAutoSave) {
      decision = "CONFLICT"; reason = "PROVIDER_OWNED_BY_OTHER_PLAYER"
    } else if (p && m) {
      if (p.apiFootballId !== null && p.apiFootballId !== source.player.id) { decision = "CONFLICT"; reason = "PLAYER_HAS_OTHER_PROVIDER_ID" }
      else if (p.apiFootballId !== null && (!attemptConsistent(p) || !m.birthMatches || m.nameScore < 80)) {
        decision = "CONFLICT"; reason = "EXISTING_IDENTITY_INCONSISTENT"
      } else if (p.clubId !== config.clubId || p.club?.apiFootballId !== config.apiFootballTeamId || !rosterClub) {
        decision = "REVIEW"; reason = "REVIEW_STALE_CLUB"
      } else if (p.apiFootballId === source.player.id) {
        decision = "ALREADY_MATCHED"; reason = p.attempt ? "EXISTING_ID_AND_ATTEMPT_CONSISTENT" : "EXISTING_ID_LEGACY_WITHOUT_ATTEMPT"
      } else if (p.attempt?.status === "matched") { decision = "CONFLICT"; reason = "MATCHED_ATTEMPT_WITHOUT_ID" }
      else if (ranking!.ambiguous || ranking!.top2?.classification === "MATCH FORTE" || rivals.length) {
        decision = "REVIEW"; reason = "AMBIGUOUS_ROSTER_OR_LOCAL_IDENTITY"
      } else if (ranking!.top1?.apiFootballId !== source.player.id) { decision = "REVIEW"; reason = "NOT_LOCAL_TOP_PROVIDER" }
      else if (participant && lineupNameScore! < 80) { decision = "REVIEW"; reason = "ROSTER_LINEUP_DISAGREEMENT" }
      else if (config.snapshot.requireParticipation && !participant) { decision = "REVIEW"; reason = "REQUIRED_LINEUP_EVIDENCE_MISSING" }
      else if (p.attempt) { decision = "REVIEW"; reason = p.attempt.nextRetryAt && p.attempt.nextRetryAt > now ? "ATTEMPT_RETRY_BLOCKED" : "EXISTING_ATTEMPT_REQUIRES_REVIEW" }
      else if (!position) { decision = "REVIEW"; reason = "POSITION_NOT_CORROBORATED" }
      else if (!ranking!.canAutoSave || !m.canAutoSave) { decision = "REVIEW"; reason = "EXISTING_MATCHER_SAFETY_NOT_MET" }
      else { decision = "AUTO_MATCH"; reason = "EXISTING_MATCHER_AND_CLUB_GATES_PASSED" }
    }
    return { providerPlayerId: source.player.id, providerName: source.player.name,
      localCandidate: p ? { playerId: p.id, slug: p.slug, name: p.name, clubId: p.clubId, club: p.club?.name ?? null,
        apiFootballId: p.apiFootballId, expectedUpdatedAt: p.updatedAt.toISOString() } : null,
      nameScore: m?.nameScore ?? null, confidence: m?.confidence ?? null,
      birth: { local: p?.dateOfBirth?.toISOString().slice(0, 10) ?? null, provider: source.player.birth.date, matches: m?.birthMatches ?? false },
      nationality: { local: p?.nationality ?? null, provider: source.player.nationality, matches: m?.nationalityMatches ?? false },
      position: { local: p ? [p.position, ...p.secondaryPositions] : [], provider: source.statistics.filter(s => s.team.id === config.apiFootballTeamId).map(s => s.games?.position ?? null), matches: position },
      top1: candidateInfo(ranking?.top1 ?? null), top2: candidateInfo(ranking?.top2 ?? null), margin: ranking?.margin ?? null,
      localTop1: candidateInfo(localCandidates[0] ?? null), localTop2: candidateInfo(localCandidates[1] ?? null),
      competingLocals: rivals.map(candidateInfo),
      rosterEvidence: { cacheId: evidence.cache!.id, cacheRowHash: evidence.cacheRowHash!, teamMatches: rosterClub },
      lineupEvidence: { available: !!lineup, present: !!participant, name: participant?.name ?? null, nameScore: lineupNameScore, snapshotHash: snapshot?.contentHash ?? null },
      decision, reason }
  })
  // Protect against two provider rows claiming one writable local record.
  const claimed = rows.filter(r => r.decision === "AUTO_MATCH").map(r => r.localCandidate!.playerId)
  for (const row of rows) if (row.decision === "AUTO_MATCH" && claimed.filter(id => id === row.localCandidate!.playerId).length > 1) {
    row.decision = "CONFLICT"; row.reason = "MULTIPLE_PROVIDER_CLAIMS"
  }
  const counts = { ALREADY_MATCHED: 0, AUTO_MATCH: 0, REVIEW: 0, UNRESOLVED: 0, CONFLICT: 0 }
  for (const r of rows) counts[r.decision]++
  const localAssociations = locals.filter(p => p.apiFootballId !== null).map(p => {
    const row = rows.find(r => r.providerPlayerId === p.apiFootballId)
    const consistent = owners.get(p.apiFootballId!)?.length === 1 && attemptConsistent(p)
    return { playerId: p.id, slug: p.slug, providerId: p.apiFootballId!, inRoster: !!row,
      decision: (!consistent ? "CONFLICT" : row?.decision ?? "ALREADY_MATCHED") as ClubIdentityDecision,
      reason: !consistent ? "EXISTING_IDENTITY_INCONSISTENT" : row?.reason ?? "PROVIDER_NOT_IN_CURRENT_ROSTER" }
  })
  const auto = rows.filter(r => r.decision === "AUTO_MATCH")
  const current = locals.filter(p => p.apiFootballId !== null).length
  return { mode: "DRY_RUN" as const, generatedAt: now.toISOString(), config: structuredClone(config),
    cache: { rowHash: evidence.cacheRowHash!, expiresAt: evidence.cache!.expiresAt.toISOString(), count: roster.length },
    snapshotHash: snapshot?.contentHash ?? null, inputHash: clubIdentityHash({ club: evidence.club, players,
      cacheRowHash: evidence.cacheRowHash, snapshotHash: snapshot?.contentHash ?? null }),
    totalProviderPlayers: roster.length, rows, counts, localAssociations,
    localPlayersWithoutProviderId: locals.filter(p => p.apiFootballId === null).map(p => ({ playerId: p.id, slug: p.slug, name: p.name })),
    providerPlayersWithoutLocalCandidate: rows.filter(r => !r.localCandidate).map(r => r.providerPlayerId),
    reviewQueue: rows.filter(r => ["REVIEW", "UNRESOLVED", "CONFLICT"].includes(r.decision)),
    coverage: { total: locals.length, current, newAutoMatches: auto.length, projected: current + auto.length },
    apiCalls: 0 as const, writes: 0 as const }
}
export type ClubIdentityReport = ReturnType<typeof runClubPlayerIdentityPipeline>
