import type {
    Player,
    PlayerPosition,
} from "../types/player"

export type CalculatedPosition =
  Exclude<PlayerPosition, "GOL">

function getFamiliarityBonus(
  player: Player,
  position: CalculatedPosition
) {
  if (player.position === position) {
    return 2
  }

  if (player.secondaryPosition === position) {
    return 1
  }

  return 0
}

export function calculatePositionOverall(
  player: Player,
  position: CalculatedPosition
) {
  const {
    pace,
    shooting,
    passing,
    dribbling,
    defending,
    physical,
  } = player.attributes

  let technicalScore = 0

  switch (position) {
    /* =========================
       ATA
    ========================= */

    case "ATA":
      technicalScore =
        shooting.finishing * 0.28 +
        shooting.positioning * 0.18 +
        dribbling.ballControl * 0.13 +
        dribbling.dribbling * 0.11 +
        pace.acceleration * 0.1 +
        pace.sprintSpeed * 0.08 +
        physical.strength * 0.07 +
        passing.shortPassing * 0.05
      break

    /* =========================
       PE / PD
    ========================= */

    case "PE":
    case "PD":
      technicalScore =
        pace.acceleration * 0.16 +
        pace.sprintSpeed * 0.14 +
        dribbling.dribbling * 0.18 +
        dribbling.agility * 0.13 +
        dribbling.ballControl * 0.13 +
        passing.crossing * 0.09 +
        shooting.finishing * 0.08 +
        passing.shortPassing * 0.05 +
        dribbling.composure * 0.04
      break

    /* =========================
       MEI
    ========================= */

    case "MEI":
      technicalScore =
        passing.vision * 0.18 +
        passing.shortPassing * 0.16 +
        dribbling.ballControl * 0.16 +
        dribbling.dribbling * 0.15 +
        dribbling.agility * 0.1 +
        dribbling.composure * 0.08 +
        shooting.finishing * 0.06 +
        passing.longPassing * 0.05 +
        shooting.longShots * 0.04 +
        pace.acceleration * 0.02
      break

    /* =========================
       MC
    ========================= */

    case "MC":
      technicalScore =
        passing.shortPassing * 0.17 +
        passing.vision * 0.13 +
        passing.longPassing * 0.13 +
        dribbling.ballControl * 0.12 +
        dribbling.composure * 0.09 +
        defending.interceptions * 0.09 +
        physical.stamina * 0.09 +
        dribbling.dribbling * 0.07 +
        defending.defensiveAwareness * 0.06 +
        physical.strength * 0.05
      break

    /* =========================
       VOL
    ========================= */

    case "VOL":
      technicalScore =
        defending.interceptions * 0.2 +
        defending.defensiveAwareness * 0.18 +
        defending.standingTackle * 0.17 +
        physical.strength * 0.12 +
        physical.stamina * 0.1 +
        passing.shortPassing * 0.09 +
        passing.longPassing * 0.07 +
        dribbling.composure * 0.04 +
        dribbling.ballControl * 0.03
      break

    /* =========================
       LE / LD
    ========================= */

    case "LE":
    case "LD":
      technicalScore =
        pace.sprintSpeed * 0.13 +
        pace.acceleration * 0.12 +
        defending.standingTackle * 0.14 +
        defending.defensiveAwareness * 0.13 +
        defending.interceptions * 0.1 +
        passing.crossing * 0.12 +
        physical.stamina * 0.11 +
        passing.shortPassing * 0.06 +
        dribbling.ballControl * 0.05 +
        physical.strength * 0.04
      break

    /* =========================
       ZAG
    ========================= */

    case "ZAG":
      technicalScore =
        defending.defensiveAwareness * 0.22 +
        defending.standingTackle * 0.2 +
        defending.interceptions * 0.18 +
        physical.strength * 0.16 +
        dribbling.composure * 0.07 +
        physical.stamina * 0.05 +
        pace.sprintSpeed * 0.04 +
        passing.shortPassing * 0.04 +
        passing.longPassing * 0.02 +
        dribbling.ballControl * 0.02
      break
  }

  const familiarityBonus =
    getFamiliarityBonus(
      player,
      position
    )

  const finalScore =
    technicalScore +
    familiarityBonus

  return Math.round(
    Math.min(finalScore, 99)
  )
}