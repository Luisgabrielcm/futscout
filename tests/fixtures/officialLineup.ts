import type { LineupCatalogPlayer } from "../../types/officialLineup"
// Entirely synthetic payloads; never copied from a real account or database.
export const lineupNow = new Date("2026-09-11T12:00:00Z")
export function fixturePayload(id = 100, date = "2026-09-10T18:00:00Z") {
  return { fixture: { id, date, status: { short: "FT" } }, teams: { home: { id: 1, name: "Home fixture" }, away: { id: 2, name: "Away fixture" } }, league: { id: 9, name: "Test competition" } }
}
export function lineupPayload() {
  let id = 0
  const startXI = [1, 4, 3, 3].flatMap((count, row) => Array.from({ length: count }, (_, col) => ({ player: {
    id: ++id as number | null, name: `Source ${id}`, number: id, pos: ["G", "D", "M", "F"][row] as string | null, grid: `${row + 1}:${col + 1}` as string | null,
  } })))
  return [{ team: { id: 1 }, formation: "4-3-3" as string | null, startXI,
    substitutes: [{ player: { id: 12 as number | null, name: "Bench fixture", number: 12, pos: "M" as string | null, grid: null as string | null } }] }]
}
export const lineupCatalog: LineupCatalogPlayer[] = Array.from({ length: 12 }, (_, i) => ({
  id: `local-${i + 1}`, apiFootballId: i + 1, slug: `local-${i + 1}`, name: `Catalogue ${i + 1}`, imageUrl: null,
  position: i ? "MC" : "GOL", officialOverall: 70, potential: i === 11 ? 0 : null, marketValue: i === 11 ? BigInt(0) : null,
  secondaryPosition: null, secondaryPositions: [],
}))
