export type PitchPlayer = {
  id: string; slug: string; name: string; imageUrl: string | null
  position: string; secondaryPosition: string | null; secondaryPositions: string[]
  officialOverall: number; potential: number | null; marketValue: bigint | null
}

// Attack to goalkeeper. A slot accepts only its exact registered EA position.
export const XI_FORMATIONS = [
  { name: "4-3-3", rows: [["PE", "ATA", "PD"], ["MC", "VOL", "MC"], ["LE", "ZAG", "ZAG", "LD"], ["GOL"]] },
  { name: "4-2-3-1", rows: [["ATA"], ["PE", "MEI", "PD"], ["VOL", "VOL"], ["LE", "ZAG", "ZAG", "LD"], ["GOL"]] },
  { name: "4-4-2", rows: [["ATA", "ATA"], ["PE", "MC", "MC", "PD"], ["LE", "ZAG", "ZAG", "LD"], ["GOL"]] },
  { name: "3-4-3", rows: [["PE", "ATA", "PD"], ["LE", "MC", "MC", "LD"], ["ZAG", "ZAG", "ZAG"], ["GOL"]] },
  { name: "3-5-2", rows: [["ATA", "ATA"], ["LE", "MC", "VOL", "MC", "LD"], ["ZAG", "ZAG", "ZAG"], ["GOL"]] },
] as const

export const SQUAD_GROUPS = [
  { key: "keepers", positions: ["GOL"] },
  { key: "fullbacks", positions: ["LE", "LD"] },
  { key: "centrebacks", positions: ["ZAG"] },
  { key: "holding", positions: ["VOL"] },
  { key: "midfield", positions: ["MC", "MEI"] },
  { key: "wingers", positions: ["PE", "PD"] },
  { key: "forwards", positions: ["ATA"] },
  { key: "otherPositions", positions: [] },
] as const

export function validPitchOverall(value: number | null) { return value !== null && Number.isFinite(value) && value >= 0 && value <= 99 }
export function pitchPositions(player: PitchPlayer) {
  return [...new Set([player.position, ...player.secondaryPositions, ...(player.secondaryPosition ? [player.secondaryPosition] : [])])]
}
const identityOrder = (a: PitchPlayer, b: PitchPlayer) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const overall = (p: PitchPlayer) => validPitchOverall(p.officialOverall) ? p.officialOverall : -1

export function groupClubSquad(players: readonly PitchPlayer[]) {
  const ordered = [...players].sort((a, b) => overall(b) - overall(a) ||
    (a.potential === null ? (b.potential === null ? 0 : 1) : b.potential === null ? -1 : b.potential - a.potential) || identityOrder(a, b))
  const known = new Set<string>(SQUAD_GROUPS.flatMap(group => [...group.positions]))
  return SQUAD_GROUPS.map(group => ({ key: group.key, players: ordered.filter(p =>
    group.key === "otherPositions" ? !known.has(p.position) : (group.positions as readonly string[]).includes(p.position)),
  })).filter(group => group.players.length > 0)
}

export type XiSlot = { position: string; player: PitchPlayer; primary: boolean }
type Assignment = { primary: number; overall: number; slots: (XiSlot | null)[] }
const better = (a: Assignment, b: Assignment | undefined) => !b || a.primary > b.primary ||
  (a.primary === b.primary && a.overall > b.overall)

// Exact matching over 11 slot bits. Descending masks prevent reusing a player.
// Unlike a greedy choice this cannot strand a slot that has a compatible match.
export function organizeClubPitch(players: readonly PitchPlayer[]) {
  const ordered = [...players].sort(identityOrder)
  const seen = new Set<string>()
  const unique = ordered.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
  let winner: { formation: typeof XI_FORMATIONS[number]; assignment: Assignment } | undefined
  let coverage = 0
  for (const formation of XI_FORMATIONS) {
    const positions: readonly string[] = formation.rows.flat()
    const full = (1 << positions.length) - 1
    const states: (Assignment | undefined)[] = Array(full + 1)
    states[0] = { primary: 0, overall: 0, slots: Array(11).fill(null) }
    for (const player of unique) {
      if (!validPitchOverall(player.officialOverall)) continue
      const registered = pitchPositions(player)
      const compatible = positions.map((position, slot) => ({ position, slot })).filter(({ position }) =>
        position === "GOL" ? player.position === "GOL" : player.position !== "GOL" && registered.includes(position))
      for (let mask = full; mask >= 0; mask--) {
        const previous = states[mask]
        if (!previous) continue
        for (const { position, slot } of compatible) {
          const bit = 1 << slot
          if (mask & bit) continue
          const next = mask | bit
          const primary = player.position === position
          const candidate: Assignment = { primary: previous.primary + Number(primary), overall: previous.overall + player.officialOverall, slots: previous.slots }
          if (!better(candidate, states[next])) continue
          candidate.slots = [...previous.slots]
          candidate.slots[slot] = { position, player, primary }
          states[next] = candidate
        }
      }
    }
    for (const state of states) if (state) coverage = Math.max(coverage, state.slots.filter(Boolean).length)
    const complete = states[full]
    // Ties keep fixed formation order and sorted name/ID traversal.
    if (complete && better(complete, winner?.assignment)) winner = { formation, assignment: complete }
  }
  if (!winner) return { formation: null, rows: [] as XiSlot[][], selected: [] as XiSlot[], coverage }
  const selected = winner.assignment.slots.filter((slot): slot is XiSlot => slot !== null)
  let offset = 0
  const rows = winner.formation.rows.map(row => { const result = selected.slice(offset, offset + row.length); offset += row.length; return result })
  return { formation: winner.formation.name, rows, selected, coverage }
}
