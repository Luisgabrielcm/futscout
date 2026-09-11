import type { AssociatedLineupPlayer, LineupCatalogPlayer, LineupPlayer } from "../types/officialLineup"

export type OfficialPlayerResolution = AssociatedLineupPlayer & { resolution: "resolved" | "unresolved" | "conflict" }
export function resolveOfficialLineupPlayers(players: LineupPlayer[], catalog: LineupCatalogPlayer[]): OfficialPlayerResolution[] {
  const byId = new Map<number, LineupCatalogPlayer[]>()
  for (const player of catalog) if (player.apiFootballId !== null) byId.set(player.apiFootballId, [...(byId.get(player.apiFootballId) ?? []), player])
  return players.map(player => {
    const matches = player.apiFootballId === null ? [] : byId.get(player.apiFootballId) ?? []
    const resolution = matches.length === 1 ? "resolved" : matches.length ? "conflict" : "unresolved"
    return { ...player, resolution, catalog: resolution === "resolved" ? matches[0] : null }
  })
}
