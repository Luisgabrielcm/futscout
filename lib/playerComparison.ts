import type { ComparisonAttribute, SelectedPlayer } from "../types/playerSelection"

export function higherValue(left: number | null, right: number | null): 0 | 1 | null {
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right) || left === right) return null
  return left > right ? 0 : 1
}

export function comparisonAttribute(players: readonly SelectedPlayer[], player: SelectedPlayer, key: ComparisonAttribute) {
  if (players.some((item) => item.position === "GOL")) return null
  return player.attributes?.[key] ?? null
}
