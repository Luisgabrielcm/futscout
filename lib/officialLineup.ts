import type { FixtureContext, LineupPlayer, OfficialLineup, LineupCatalogPlayer, OfficialLineupView } from "../types/officialLineup"
import { resolveOfficialLineupPlayers } from "./resolveOfficialLineupPlayers"

export const LINEUP_WINDOW_DAYS = 90
export const LINEUP_STALE_DAYS = 30
const DAY = 86_400_000
const object = (v: unknown): Record<string, unknown> | null => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
const id = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null

export function parseFixture(value: unknown, teamId: number, now: Date): FixtureContext | null {
  const item = object(value), fixture = object(item?.fixture), teams = object(item?.teams)
  const home = object(teams?.home), away = object(teams?.away), league = object(item?.league)
  const when = date(fixture?.date), status = object(fixture?.status)?.short
  if (!id(fixture?.id) || !when || !["FT", "AET", "PEN"].includes(String(status)) || !Number.isFinite(now.getTime())) return null
  if (Date.parse(when) > now.getTime() || now.getTime() - Date.parse(when) > LINEUP_WINDOW_DAYS * DAY) return null
  if (!id(home?.id) || !id(away?.id) || home.id === away.id || ![home.id, away.id].includes(teamId)) return null
  if (!text(home?.name) || !text(away?.name) || !id(league?.id) || !text(league?.name)) return null
  return { id: fixture.id, date: when, status: String(status), home: { id: home.id, name: text(home.name)! }, away: { id: away.id, name: text(away.name)! }, competition: { id: league.id, name: text(league.name)! } }
}

function parsePlayers(value: unknown): LineupPlayer[] | null {
  if (!Array.isArray(value) || value.length > 30) return null
  const result: LineupPlayer[] = []
  for (const entry of value) {
    const p = object(object(entry)?.player)
    if (!p || !text(p.name) || (p.id != null && !id(p.id))) return null
    const position = text(p.pos)
    if (position && !["G", "D", "M", "F"].includes(position)) return null
    result.push({ apiFootballId: id(p.id) ? p.id : null, name: text(p.name)!, position,
      grid: typeof p.grid === "string" && /^[1-6]:[1-5]$/.test(p.grid) ? p.grid : null,
      number: Number.isInteger(p.number) && Number(p.number) >= 0 ? Number(p.number) : null })
  }
  return result
}

export function parseOfficialLineup(fixture: FixtureContext, response: unknown, teamId: number, fetchedAt: string): OfficialLineup | null {
  if (!Array.isArray(response) || ![fixture.home.id, fixture.away.id].includes(teamId) || !date(fetchedAt)) return null
  const matches = response.filter(v => object(object(v)?.team)?.id === teamId)
  if (matches.length !== 1) return null
  const row = object(matches[0])!
  const startXI = parsePlayers(row.startXI)
  const substitutes = row.substitutes == null ? null : parsePlayers(row.substitutes)
  if (!startXI || startXI.length !== 11 || (row.substitutes != null && !substitutes)) return null
  const all = [...startXI, ...(substitutes ?? [])]
  const ids = all.flatMap(p => p.apiFootballId === null ? [] : [p.apiFootballId])
  if (new Set(ids).size !== ids.length) return null
  // Without an ID, repeated names cannot be safely distinguished: reject, never merge.
  const unidentified = all.filter(p => p.apiFootballId === null).map(p => p.name.toLowerCase())
  if (new Set(unidentified).size !== unidentified.length) return null
  if (startXI.filter(p => p.position === "G").length > 1) return null
  const rawFormation = text(row.formation)
  const parts = rawFormation?.split("-").map(Number)
  const formation = parts && parts.length >= 2 && parts.length <= 5 && parts.every(n => Number.isInteger(n) && n >= 1 && n <= 5) && parts.reduce((a, b) => a + b, 0) === 10 ? rawFormation : null
  return { provider: "api-football", apiTeamId: teamId, fixture, formation, startXI, substitutes, fetchedAt: date(fetchedAt)! }
}

export function associateOfficialLineup(lineup: OfficialLineup, catalog: LineupCatalogPlayer[], now: Date): OfficialLineupView {
  const startXI = resolveOfficialLineupPlayers(lineup.startXI, catalog)
  let rows: typeof startXI[] | null = null
  if (startXI.every(p => p.grid) && new Set(startXI.map(p => p.grid)).size === 11) {
    const grouped = new Map<number, typeof startXI>()
    for (const p of startXI) { const row = Number(p.grid![0]); grouped.set(row, [...(grouped.get(row) ?? []), p]) }
    const ordered = [...grouped].sort((a, b) => a[0] - b[0])
    if (ordered.every(([r, players], i) => r === i + 1 && players.map(p => Number(p.grid!.split(":")[1])).sort((a, b) => a - b).every((c, j) => c === j + 1)) && ordered[0][1].length === 1 && ordered[0][1][0].position === "G" && startXI.filter(p => p.position === "G").length === 1) {
      rows = ordered.reverse().map(([, players]) => players.sort((a, b) => Number(a.grid!.split(":")[1]) - Number(b.grid!.split(":")[1])))
    }
  }
  // Only three outfield lines can be placed unambiguously from broad D/M/F roles.
  if (!rows && lineup.formation) {
    const parts = lineup.formation.split("-").map(Number)
    const groups = ["G", "D", "M", "F"].map(pos => startXI.filter(p => p.position === pos))
    if (parts.length === 3 && groups.every((g, i) => g.length === [1, ...parts][i])) rows = groups.reverse()
  }
  return { ...lineup, startXI, substitutes: lineup.substitutes ? resolveOfficialLineupPlayers(lineup.substitutes, catalog) : null, rows,
    stale: now.getTime() - Date.parse(lineup.fixture.date) > LINEUP_STALE_DAYS * DAY }
}
