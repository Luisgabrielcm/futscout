export type PitchPlayer = { id: string; slug: string; name: string; imageUrl: string | null; position: string; officialOverall: number }
export const PITCH_SECTORS = [
  { key: "attack", positions: ["ATA", "PE", "PD"] },
  { key: "midfield", positions: ["MEI", "MC", "VOL"] },
  { key: "defence", positions: ["LE", "ZAG", "LD"] },
  { key: "keepers", positions: ["GOL"] },
] as const

export function validPitchOverall(value: number) { return Number.isFinite(value) && value >= 0 && value <= 99 }

// A bounded visual preview, NOT a formation or a recommendation of starters.
// Every remaining/unknown-position player is preserved in the options panel.
export function organizeClubPitch(players: readonly PitchPlayer[]) {
  const score = (p: PitchPlayer) => validPitchOverall(p.officialOverall) ? p.officialOverall : -1
  const ordered = [...players].sort((a, b) => score(b) - score(a) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const sectors = PITCH_SECTORS.map(sector => ({ key: sector.key,
    players: ordered.filter(p => (sector.positions as readonly string[]).includes(p.position)).slice(0, 3),
  }))
  const visible = new Set(sectors.flatMap(s => s.players.map(p => p.id)))
  return { sectors, options: ordered.filter(p => !visible.has(p.id)) }
}
