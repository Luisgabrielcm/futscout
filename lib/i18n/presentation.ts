import { t } from "./index"
import type { Locale } from "./config"

const feet = {
  direito: "rightFoot", right: "rightFoot",
  esquerdo: "leftFoot", left: "leftFoot",
  ambidestro: "bothFeet", both: "bothFeet",
} as const

// Translate only known enum-like values for presentation; preserve unknown text.
export function displayFoot(value: string, locale: Locale) {
  const key = feet[value.trim().toLowerCase() as keyof typeof feet]
  return key ? t(locale, key) : value
}

const forms = {
  "Péssima": ["Péssima", "Very poor"], "Ruim": ["Ruim", "Poor"],
  "Normal": ["Normal", "Normal"], "Boa": ["Boa", "Good"],
  "Excelente": ["Excelente", "Excellent"],
} as const

// Display only. Keep null and unknown source values unchanged, never infer form.
export function displayForm(value: string | null, locale: Locale): string | null {
  if (value === null) return null
  return Object.hasOwn(forms, value)
    ? forms[value as keyof typeof forms][locale === "pt" ? 0 : 1]
    : value
}

const englishPositions: Record<string, string> = {
  GOL: "GK", LD: "RB", LE: "LB", ZAG: "CB", VOL: "CDM", MC: "CM",
  MEI: "CAM", MD: "RM", ME: "LM", PD: "RW", PE: "LW", SA: "CF", ATA: "ST",
}

// Presentation only: persisted positions and filter/query values stay unchanged.
export function displayPosition(position: string, locale: Locale) {
  return locale === "en" ? englishPositions[position] ?? position : position
}
