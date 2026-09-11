import { selectRecentOfficialLineup } from "./officialLineupSelection"
import { resolveOfficialLineupPlayers } from "../lib/resolveOfficialLineupPlayers"
import type { OfficialLineup, LineupCatalogPlayer } from "../types/officialLineup"

export const BARCELONA_LINEUP_PILOT = { id: "cmt94sq79001l5guc4g4zj7y3", slug: "fc-barcelona", apiFootballId: 529 } as const
export type ProtectedTableHashes = Record<string, { count: string; hash: string }>
export type LineupPilotDependencies = {
  readClub: () => Promise<{ id: string; slug: string; apiFootballId: number | null } | null>
  audit: () => Promise<ProtectedTableHashes>
  source: Parameters<typeof selectRecentOfficialLineup>[2]
  readPlayers: (ids: number[]) => Promise<LineupCatalogPlayer[]>
  save: (clubId: string, lineup: OfficialLineup) => Promise<{ status: "created" | "duplicate"; snapshotId: string; contentHash: string }>
  close: () => Promise<void>
}
export async function runOfficialLineupPilot(deps: LineupPilotDependencies, now: Date) {
  let before: ProtectedTableHashes | undefined
  const equal = (a: ProtectedTableHashes, b: ProtectedTableHashes) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k].hash === b[k]?.hash && a[k].count === b[k]?.count)
  try {
    const club = await deps.readClub()
    if (!club || club.id !== BARCELONA_LINEUP_PILOT.id || club.slug !== BARCELONA_LINEUP_PILOT.slug || club.apiFootballId !== BARCELONA_LINEUP_PILOT.apiFootballId) throw new Error("Barcelona pilot identity mismatch")
    before = await deps.audit()
    const selected = await selectRecentOfficialLineup(club.apiFootballId, now, deps.source)
    if (!selected.lineup) return { status: "no_lineup" as const, requests: selected.requests, before }
    const all = [...selected.lineup.startXI, ...(selected.lineup.substitutes ?? [])]
    const ids = [...new Set(all.flatMap(p => p.apiFootballId === null ? [] : [p.apiFootballId]))]
    const resolved = resolveOfficialLineupPlayers(all, ids.length ? await deps.readPlayers(ids) : [])
    if (resolved.some(p => p.resolution === "conflict")) throw new Error("Official lineup player identity conflict")
    if (!equal(before, await deps.audit())) throw new Error("Protected tables changed before snapshot write")
    const saved = await deps.save(club.id, selected.lineup)
    return { ...saved, fixtureId: selected.lineup.fixture.id, requests: selected.requests,
      resolved: resolved.filter(p => p.resolution === "resolved").length, unresolved: resolved.filter(p => p.resolution === "unresolved").length, before }
  } finally {
    try {
      if (before && !equal(before, await deps.audit())) throw new Error("Protected tables changed: operator review required")
    } finally { await deps.close() }
  }
}
