import type { Player, PlayerPosition } from "../types/player"

// EA positions only: do not mix these badges with estimated positional ratings.
export function getPlayerProfilePositions(player: Pick<Player, "position" | "secondaryPosition" | "secondaryPositions">): PlayerPosition[] {
  return [...new Set([
    player.position,
    ...player.secondaryPositions,
    ...(player.secondaryPosition ? [player.secondaryPosition] : []),
  ])]
}
