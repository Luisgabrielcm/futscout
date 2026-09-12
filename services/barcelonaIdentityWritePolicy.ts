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

export const BARCELONA_SECOND_WRITE_TARGETS = Object.freeze([
  Object.freeze({ playerId: "cmt9bm9c201daukucoh7gr0tq", providerId: 340626 }),
  Object.freeze({ playerId: "cmt9ap3lp004c2kuc2dkon2ir", providerId: 161928 }),
])

// Closed, immutable operational batches. IDs supplied on the CLI never become a policy.
const approvedBatches = Object.freeze({
  "first-five": Object.freeze({ targets: BARCELONA_WRITE_TARGETS, evidence: BARCELONA_WRITE_EVIDENCE,
    slugs: Object.freeze(["pau-cubarsi", "andreas-christensen", "wojciech-szczesny", "gerard-martin", "gavi"]) }),
  "fermin-balde": Object.freeze({ targets: BARCELONA_SECOND_WRITE_TARGETS, evidence: BARCELONA_WRITE_EVIDENCE,
    slugs: Object.freeze(["fermin", "balde"]) }),
})
export type BarcelonaIdentityBatchId = keyof typeof approvedBatches

export function getBarcelonaIdentityBatch(batchId: BarcelonaIdentityBatchId = "first-five") {
  if (batchId !== "first-five" && batchId !== "fermin-balde") throw new Error("UNKNOWN_APPROVED_BARCELONA_BATCH")
  return approvedBatches[batchId]
}

export function requireBarcelonaWriteAllowlist(ids: readonly string[], batchId: BarcelonaIdentityBatchId = "first-five") {
  const { targets } = getBarcelonaIdentityBatch(batchId)
  if (ids.length !== targets.length || ids.some((id, i) => id !== targets[i].playerId)) {
    throw new Error(batchId === "first-five" ? "EXACT_ORDERED_FIVE_BARCELONA_PLAYERS_REQUIRED" : "EXACT_ORDERED_FERMIN_BALDE_REQUIRED")
  }
}

function approvedBatchForIds(ids: readonly string[]): BarcelonaIdentityBatchId {
  for (const batchId of ["first-five", "fermin-balde"] as const) {
    const { targets } = getBarcelonaIdentityBatch(batchId)
    if (ids.length === targets.length && ids.every((id, i) => id === targets[i].playerId)) return batchId
  }
  throw new Error("EXACT_APPROVED_BARCELONA_BATCH_REQUIRED")
}

// Strict CLI grammar; the legacy dry-run parser retains its read-only contract.
export function guardBarcelonaIdentityRunnerArgs(args: string[]) {
  if (args[0] === "--write") {
    if (args.length !== 7 || args[5] !== "--confirmation" ||
        !/^AUTHORIZE_BARCELONA_IDENTITY_V2:[a-f0-9]{64}$/.test(args[6])) throw new Error("EXPLICIT_V2_CONFIRMATION_REQUIRED")
    const parsed = parseIdentityPilotArgs(["--dry-run", ...args.slice(1, 5)])
    const batchId = approvedBatchForIds(parsed.playerIds)
    return { ...parsed, batchId, mode: "write" as const, confirmation: args[6] }
  }
  const parsed = parseIdentityPilotArgs(args)
  const batchId = approvedBatchForIds(parsed.playerIds)
  return { ...parsed, batchId, mode: "dry-run" as const }
}

type RunnerArgs = ReturnType<typeof guardBarcelonaIdentityRunnerArgs>

// No write-flow import, env or client construction before CLI/Git guards pass.
export async function dispatchBarcelonaIdentityRunner(argv: string[], runtime: {
  git: (...args: string[]) => string
  blockHttp: () => void
  runDryRun: (args: RunnerArgs, head: string) => Promise<void>
  loadWriteFlow: () => Promise<(args: Extract<RunnerArgs, { mode: "write" }>, head: string) => Promise<void>>
}) {
  const args = guardBarcelonaIdentityRunnerArgs(argv)
  if (runtime.git("branch", "--show-current") !== "beta-next") throw new Error("BETA_NEXT_REQUIRED")
  if (runtime.git("status", "--porcelain", "--untracked-files=all")) throw new Error("CLEAN_WORKING_TREE_REQUIRED")
  const head = runtime.git("rev-parse", "HEAD")
  runtime.blockHttp()
  if (args.mode === "dry-run") return runtime.runDryRun(args, head)
  const write = await runtime.loadWriteFlow()
  await write(args, head)
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

export function requireCurrentBarcelonaEvidence(evidence: IdentityWriteEvidence, now: Date, batchId: BarcelonaIdentityBatchId = "first-five") {
  const roster = requireIdentityRoster(evidence.cache, 2026, now)
  const pin = getBarcelonaIdentityBatch(batchId).evidence
  if (evidence.cache?.id !== pin.cacheId || evidence.cacheRowHash !== pin.cacheRowHash) throw new Error("CACHE_HASH_CHANGED")
  if (!evidence.snapshot || evidence.snapshot.id !== pin.snapshotId || evidence.snapshot.clubId !== pin.clubId ||
      evidence.snapshot.contentHash !== pin.snapshotHash) throw new Error("SNAPSHOT_HASH_CHANGED")
  const lineup = decodeLineupSnapshot(evidence.snapshot, now)
  if (!lineup || lineup.apiTeamId !== 529) throw new Error("INVALID_SNAPSHOT")
  return { roster, lineup }
}

// Always recompute using the approved core and the CURRENT catalog. No saved dry-run decision is trusted.
export function prepareBarcelonaIdentityMatch(evidence: IdentityWriteEvidence, playerId: string, now: Date,
  batchId: BarcelonaIdentityBatchId = "first-five"): PreparedIdentityMatch {
  const batch = getBarcelonaIdentityBatch(batchId)
  const target = batch.targets.find(t => t.playerId === playerId)
  if (!target) throw new Error("PLAYER_NOT_ALLOWLISTED")
  const { roster, lineup } = requireCurrentBarcelonaEvidence(evidence, now, batchId)
  if (!roster.some(p => p.player.id === target.providerId)) throw new Error("ROSTER_PROVIDER_CHANGED")
  const p = evidence.players.find(p => p.id === playerId)
  if (!p || p.clubId !== batch.evidence.clubId || p.attempt || p.apiFootballId !== null) throw new Error("PLAYER_BASELINE_CHANGED")
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
