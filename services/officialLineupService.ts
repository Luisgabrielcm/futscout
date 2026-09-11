import "server-only"
import { associateOfficialLineup, parseFixture, parseOfficialLineup } from "../lib/officialLineup"
import type { LineupCatalogPlayer, OfficialLineupView } from "../types/officialLineup"
import { getOfficialLineupReadStore } from "./officialLineupCapability"

export type LineupReadStore = {
  // Future DB adapter: filter by club + provider, latest fixture first, bounded read.
  readSnapshots: (clubId: string) => Promise<{ clubId: string; apiTeamId: number; payloadVersion: number; fixture: unknown; response: unknown; fetchedAt: string }[]>
  readPlayersByApiIds: (ids: number[]) => Promise<LineupCatalogPlayer[]>
}

// Capability defaults off; production adapter reads only. Never an API fallback.
export async function getLatestOfficialClubLineup(clubId: string, store?: LineupReadStore, now = new Date()): Promise<OfficialLineupView | null> {
  store ??= await getOfficialLineupReadStore(now) ?? undefined
  if (!store) return null
  let snapshots: Awaited<ReturnType<LineupReadStore["readSnapshots"]>>
  try { snapshots = await store.readSnapshots(clubId) } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") return null
    throw error
  }
  const valid = snapshots.flatMap(snapshot => {
    if (snapshot.clubId !== clubId || snapshot.payloadVersion !== 1) return []
    const fixture = parseFixture(snapshot.fixture, snapshot.apiTeamId, now)
    if (!fixture || Date.parse(snapshot.fetchedAt) > now.getTime() || Date.parse(snapshot.fetchedAt) < Date.parse(fixture.date)) return []
    const lineup = parseOfficialLineup(fixture, snapshot.response, snapshot.apiTeamId, snapshot.fetchedAt)
    return lineup ? [lineup] : []
  }).sort((a, b) => Date.parse(b.fixture.date) - Date.parse(a.fixture.date) || b.fixture.id - a.fixture.id || Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))
  if (!valid.length) return null
  const lineup = valid[0]
  const ids = [...new Set([...lineup.startXI, ...(lineup.substitutes ?? [])].flatMap(p => p.apiFootballId === null ? [] : [p.apiFootballId]))]
  return associateOfficialLineup(lineup, ids.length ? await store.readPlayersByApiIds(ids) : [], now)
}
