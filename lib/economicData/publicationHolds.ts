import holds from './publicationHolds.json'

// Sanitized, versioned eligibility decisions only. No prices, credentials, datasets
// or runtime filesystem access. A new observation never silently clears a hold.
export const marketValueHeldPlayerIds = holds.entries.map(entry => entry.playerId)
export const marketValueHeldEaIds = holds.entries.map(entry => entry.eaId)
const byPlayer = new Map(holds.entries.map(entry => [entry.playerId, entry]))
const byEa = new Map(holds.entries.map(entry => [entry.eaId, entry]))
export function publicationHoldFor(playerId?: string, eaId?: string | null) {
  return (playerId ? byPlayer.get(playerId) : undefined) ?? (eaId ? byEa.get(eaId) : undefined)
}
