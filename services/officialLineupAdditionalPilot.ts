import { selectRecentOfficialLineup } from "./officialLineupSelection"
import { resolveOfficialLineupPlayers } from "../lib/resolveOfficialLineupPlayers"
import type { LineupPilotDependencies, ProtectedTableHashes } from "./officialLineupPilot"

export const ADDITIONAL_LINEUP_PILOTS = {
  city: { id: "cmt94sibe001a5guc60z2rphl", slug: "manchester-city", name: "Manchester City", apiFootballId: 50 },
  real: { id: "cmt7hnsah0004z0ucqy6yoeqz", slug: "real-madrid", name: "Real Madrid", apiFootballId: 541 },
} as const
export type AdditionalPilotKey = keyof typeof ADDITIONAL_LINEUP_PILOTS
export const ADDITIONAL_PROTECTED_TABLES = ["Player", "Club", "League", "PlayerAttributes", "ApiFootballTeamRosterCache", "ApiFootballPlayerMatchAttempt", "SyncState", "SyncError"] as const
export type AdditionalPilotAudit = {
  barcelonaIntact: boolean
  tables: ProtectedTableHashes
  otherSnapshots: { count: string; hash: string }
  targetSnapshots: number
  totalSnapshots: number
}
export type AdditionalPilotDependencies = Omit<LineupPilotDependencies, "readClub" | "audit"> & {
  readClubs: () => Promise<{ id: string; slug: string; name: string; apiFootballId: number | null }[]>
  audit: () => Promise<AdditionalPilotAudit>
  report: (event: Record<string, unknown>) => void
}
export function assertAdditionalPilotArguments(key: AdditionalPilotKey, args: string[]) {
  if (args.length !== 1 || args[0] !== `--execute-${ADDITIONAL_LINEUP_PILOTS[key].slug}-official-lineup`) throw new Error("Explicit target-specific execution flag required")
}
function protectedEqual(a: AdditionalPilotAudit, b: AdditionalPilotAudit) {
  return a.barcelonaIntact && b.barcelonaIntact && ADDITIONAL_PROTECTED_TABLES.every(k => a.tables[k] && b.tables[k] && a.tables[k].count === b.tables[k].count && a.tables[k].hash === b.tables[k].hash) &&
    a.otherSnapshots.count === b.otherSnapshots.count && a.otherSnapshots.hash === b.otherSnapshots.hash
}
// Orchestration only: no env, HTTP implementation, Prisma, matcher or ID writes.
export async function runAdditionalOfficialLineupPilot(key: AdditionalPilotKey, deps: AdditionalPilotDependencies, now: Date) {
  const target = ADDITIONAL_LINEUP_PILOTS[key]
  let before: AdditionalPilotAudit | undefined
  let saved = false
  try {
    const clubs = await deps.readClubs()
    if (clubs.length !== 1 || !Object.entries(target).every(([k, v]) => clubs[0][k as keyof typeof clubs[0]] === v)) throw new Error("Additional pilot club identity mismatch")
    before = await deps.audit()
    if (!protectedEqual(before, before) || before.targetSnapshots !== 0) throw new Error("Pilot audit incomplete or target already has a snapshot")
    const selected = await selectRecentOfficialLineup(target.apiFootballId, now, deps.source)
    if (!selected.lineup) throw new Error("No valid official lineup; pilot stopped without write")
    const lineup = selected.lineup
    if (lineup.apiTeamId !== target.apiFootballId) throw new Error("Pilot lineup team mismatch")
    const entries = [...lineup.startXI, ...(lineup.substitutes ?? [])]
    const ids = [...new Set(entries.flatMap(p => p.apiFootballId === null ? [] : [p.apiFootballId]))]
    const players = ids.length ? await deps.readPlayers(ids) : []
    const resolved = resolveOfficialLineupPlayers(entries, players)
    if (resolved.some(p => p.resolution === "conflict")) throw new Error("Official lineup player identity conflict")
    const current = await deps.audit()
    if (!protectedEqual(before, current) || current.targetSnapshots !== 0 || current.totalSnapshots !== before.totalSnapshots) throw new Error("Pilot before-write audit changed")
    const summarize = (group: typeof resolved) => ({ resolved: group.filter(p => p.resolution === "resolved").length, unresolved: group.filter(p => p.resolution === "unresolved").length, conflicts: group.filter(p => p.resolution === "conflict").length })
    const resolution = { startXI: summarize(resolved.slice(0, lineup.startXI.length)), substitutes: summarize(resolved.slice(lineup.startXI.length)) }
    deps.report({ event: "before-snapshot-write", club: target.slug, fixtureId: lineup.fixture.id, formation: lineup.formation, ...resolution })
    const result = await deps.save(target.id, lineup)
    if (result.status !== "created") throw new Error("Pilot duplicate snapshot rejected")
    saved = true
    return { ...result, club: target.slug, fixtureId: lineup.fixture.id, requests: selected.requests, ...resolution }
  } finally {
    try {
      if (before) {
        const after = await deps.audit()
        deps.report({ event: "final-audit", before, after })
        if (!protectedEqual(before, after) || after.targetSnapshots !== before.targetSnapshots + Number(saved) || after.totalSnapshots !== before.totalSnapshots + Number(saved)) throw new Error("Pilot final audit mismatch: operator review required; do not rerun")
      }
    } finally { await deps.close() }
  }
}
