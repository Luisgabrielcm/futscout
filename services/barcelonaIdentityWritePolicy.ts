import { decodeLineupSnapshot, type SnapshotData } from "../lib/officialLineupSnapshot"
import { parseIdentityPilotArgs, planBarcelonaIdentityCoverage, requireIdentityRoster,
  type IdentityCache, type IdentityPlayer } from "./playerIdentityCoverage"

// Operational authorization scope, not matcher aliases or general matching rules.
export const BARCELONA_WRITE_TARGETS = Object.freeze([
  Object.freeze({ playerId: "cmt9b643t00eiukuchqi60m1e", providerId: 396623 }),
  Object.freeze({ playerId: "cmt9bpzg701l3ukuc1tm32vwa", providerId: 2282 }),
  Object.freeze({ playerId: "cmt99mm7z002buguc11z8p9vy", providerId: 851 }),
  Object.freeze({ playerId: "cmt9g7t3d03ki1suchanfvlu5", providerId: 181701 }),
  Object.freeze({ playerId: "cmt9aoojk003t2kucp8ajoj6f", providerId: 296667 }),
])
export const BARCELONA_WRITE_EVIDENCE = Object.freeze({
  clubId: "cmt94sq79001l5guc4g4zj7y3",
  cacheId: "cmtxh1inh0000xoucl26iyllv",
  // PostgreSQL md5(to_jsonb(cache_row)::text), from the authorized Phase C audit.
  cacheRowHash: "d80583525a6707b21e8ac7fbe5848290",
  snapshotId: "cmtxdolfu0000ckuc5xr4whbf",
  snapshotHash: "1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11",
})

export function requireBarcelonaWriteAllowlist(ids: readonly string[]) {
  if (ids.length !== 5 || ids.some((id, i) => id !== BARCELONA_WRITE_TARGETS[i].playerId)) {
    throw new Error("EXACT_ORDERED_FIVE_BARCELONA_PLAYERS_REQUIRED")
  }
}

// No environment variable or command-line token can enable writes in Phase D.
// Kept separate from the legacy dry-run parser to preserve its existing contract.
export function guardBarcelonaIdentityRunnerArgs(args: string[]) {
  if (args.includes("--write")) throw new Error("IDENTITY_WRITE_DISABLED_PHASE_D")
  const parsed = parseIdentityPilotArgs(args)
  requireBarcelonaWriteAllowlist(parsed.playerIds)
}

export type AtomicPlayerIdentity = Pick<IdentityPlayer,
  "id" | "name" | "dateOfBirth" | "nationality" | "position" | "secondaryPositions"> & {
  externalId: string | null
  slug: string
  clubId: string | null
  updatedAt: Date
  club: { name: string; apiFootballId: number | null } | null
}
export type IdentityWriteEvidence = {
  players: (IdentityPlayer & AtomicPlayerIdentity)[]
  cache: (IdentityCache & { id: string }) | null
  cacheRowHash: string | null
  snapshot: (SnapshotData & { id: string }) | null
}
export type PreparedIdentityMatch = {
  identity: AtomicPlayerIdentity
  providerId: number
  decision: "AUTO_MATCH"
  confidence: number
  nameScore: number
  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
  margin: number
  cacheExpiresAt: Date
  cacheRowHash: string
  snapshotHash: string
}

export function requireCurrentBarcelonaEvidence(evidence: IdentityWriteEvidence, now: Date) {
  const roster = requireIdentityRoster(evidence.cache, 2026, now)
  const pin = BARCELONA_WRITE_EVIDENCE
  if (evidence.cache?.id !== pin.cacheId || evidence.cacheRowHash !== pin.cacheRowHash) throw new Error("CACHE_HASH_CHANGED")
  if (!evidence.snapshot || evidence.snapshot.id !== pin.snapshotId || evidence.snapshot.clubId !== pin.clubId ||
      evidence.snapshot.contentHash !== pin.snapshotHash) throw new Error("SNAPSHOT_HASH_CHANGED")
  const lineup = decodeLineupSnapshot(evidence.snapshot, now)
  if (!lineup || lineup.apiTeamId !== 529) throw new Error("INVALID_SNAPSHOT")
  return { roster, lineup }
}

// Always recompute using the approved core and the CURRENT catalog. No saved dry-run decision is trusted.
export function prepareBarcelonaIdentityMatch(evidence: IdentityWriteEvidence, playerId: string, now: Date): PreparedIdentityMatch {
  const target = BARCELONA_WRITE_TARGETS.find(t => t.playerId === playerId)
  if (!target) throw new Error("PLAYER_NOT_ALLOWLISTED")
  const { roster, lineup } = requireCurrentBarcelonaEvidence(evidence, now)
  if (!roster.some(p => p.player.id === target.providerId)) throw new Error("ROSTER_PROVIDER_CHANGED")
  const p = evidence.players.find(p => p.id === playerId)
  if (!p || p.clubId !== BARCELONA_WRITE_EVIDENCE.clubId || p.attempt || p.apiFootballId !== null) throw new Error("PLAYER_BASELINE_CHANGED")
  const result = planBarcelonaIdentityCoverage({ players: evidence.players, cache: evidence.cache,
    lineup, playerIds: [playerId], season: 2026, now })
  const r = result.rows[0]
  if (result.failedFast || r?.decision !== "AUTO_MATCH" || r.sourcePlayerId !== target.providerId || r.margin === null) {
    throw new Error("CURRENT_MATCHER_NOT_AUTO_MATCH")
  }
  const { id, slug, externalId, name, dateOfBirth, nationality, position, secondaryPositions, clubId, club, updatedAt } = p
  return structuredClone({ identity: { id, slug, externalId, name, dateOfBirth, nationality, position, secondaryPositions, clubId, club, updatedAt },
    providerId: target.providerId, decision: "AUTO_MATCH", confidence: r.score!, nameScore: r.nameScore!,
    birthMatches: r.birthMatches, nationalityMatches: r.nationalityMatches, clubMatches: r.clubMatches,
    margin: r.margin, cacheExpiresAt: evidence.cache!.expiresAt, cacheRowHash: evidence.cacheRowHash!, snapshotHash: evidence.snapshot!.contentHash })
}
