import type { DatabasePlayer } from "../../mappers/mapDatabasePlayer"

// Synthetic values only in test fixtures; production never fills missing stats.
export const catalogAttributes: NonNullable<DatabasePlayer["attributes"]> = {
  pace: 80, acceleration: 81, sprintSpeed: 79,
  shooting: 75, positioning: 70, finishing: 76, shotPower: 78, longShots: 71, volleys: 65, penalties: 72,
  passing: 82, vision: 83, crossing: 70, freeKickAccuracy: 60, shortPassing: 86, longPassing: 80, curve: 72,
  dribbling: 84, agility: 85, balance: 82, reactions: 80, ballControl: 86, dribblingStat: 84, composure: 79,
  defending: 60, interceptions: 65, headingAccuracy: 50, defensiveAwareness: 58, standingTackle: 62, slidingTackle: 55,
  physical: 70, jumping: 65, stamina: 80, strength: 68, aggression: 60,
}

export function catalogPlayer(overrides: Partial<DatabasePlayer> = {}): DatabasePlayer {
  return {
    id: "fixture-player", slug: "fixture-player", name: "Jogador de teste",
    dateOfBirth: null, nationality: null, position: "MC",
    secondaryPosition: null, secondaryPositions: [],
    preferredFoot: null, height: null, skillMoves: null, weakFootAbility: null,
    imageUrl: null, officialOverall: 80, dynamicOverall: null, potential: null,
    marketValue: null, marketCurrency: null, form: null, club: null,
    attributes: { ...catalogAttributes }, playStyles: [],
    ...overrides,
  }
}
