import type {
  PlayerPosition,
} from "../types/player"

const positionMap: Record<
  string,
  PlayerPosition
> = {
  /* ========================================
     GOLEIRO
  ======================================== */

  GK: "GOL",
  GOALKEEPER: "GOL",
  GOL: "GOL",

  /* ========================================
     LATERAIS
  ======================================== */

  RB: "LD",
  "RIGHT BACK": "LD",
  "RIGHT WING BACK": "LD",
  RWB: "LD",
  LD: "LD",

  LB: "LE",
  "LEFT BACK": "LE",
  "LEFT WING BACK": "LE",
  LWB: "LE",
  LE: "LE",

  /* ========================================
     ZAGUEIRO
  ======================================== */

  CB: "ZAG",
  "CENTRE BACK": "ZAG",
  "CENTER BACK": "ZAG",
  ZAG: "ZAG",

  /* ========================================
     VOLANTE
  ======================================== */

  CDM: "VOL",
   "CENTRAL DEFENSIVE MIDFIELDER": "VOL",
   "CENTER DEFENSIVE MIDFIELDER": "VOL",
   "DEFENSIVE MIDFIELDER": "VOL",
  VOL: "VOL",

  /* ========================================
     MEIO-CAMPISTA
  ======================================== */

  CM: "MC",
   "CENTRAL MIDFIELDER": "MC",
   "CENTRE MIDFIELDER": "MC",
   "CENTER MIDFIELDER": "MC",
  MC: "MC",

  CAM: "MEI",
   "CENTRAL ATTACKING MIDFIELDER": "MEI",
   "CENTER ATTACKING MIDFIELDER": "MEI",
   "ATTACKING MIDFIELDER": "MEI",
  MEI: "MEI",

/* ========================================
   PONTAS / MEIAS ABERTOS
======================================== */

RW: "PD",
"RIGHT WINGER": "PD",
"RIGHT WING": "PD",
"RIGHT FORWARD": "PD",

RM: "MD",
"RIGHT MIDFIELDER": "MD",
MD: "MD",

PD: "PD",

LW: "PE",
"LEFT WINGER": "PE",
"LEFT WING": "PE",
"LEFT FORWARD": "PE",

LM: "ME",
"LEFT MIDFIELDER": "ME",
ME: "ME",

PE: "PE",

  /* ========================================
     ATACANTE
  ======================================== */

  ST: "ATA",
  STRIKER: "ATA",

  CF: "SA",
  "CENTRE FORWARD": "SA",
  "CENTER FORWARD": "SA",
  SA: "SA",

  ATA: "ATA",
}

export function normalizePosition(
  position: string
): PlayerPosition {
  const key =
    position
      .trim()
      .toUpperCase()

  const normalizedPosition =
    positionMap[key]

  if (!normalizedPosition) {
    throw new Error(
      `Posição desconhecida: ${position}`
    )
  }

  return normalizedPosition
}
