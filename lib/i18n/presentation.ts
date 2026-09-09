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
