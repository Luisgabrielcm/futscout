import type { PlayerPlayStyle } from "../types/player"

export type PlayStyleVisual = {
  playStyleKey: string
  displayName: string
  isPlus: boolean
  iconSrc: string | null
}

export function normalizePlayStyleKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1-$2")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/(?:\+|[\s_-]+plus)$/, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

// Central registry; no local PlayStyle artwork exists yet. Do not synthesize
// EA URLs or substitute unrelated glyphs. Aliases are exact, never fuzzy.
export const styles: { key: string; name: string; aliases?: string[] }[] = [
  ...["anticipate", "block", "cross-claimer", "dead-ball", "deflector", "far-reach", "far-throw", "footwork", "incisive-pass", "intercept", "jockey", "long-throw", "pinged-pass", "rush-out", "trickster"].map(key => ({ key, name: key.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ") })),
  { key: "power-shot", name: "Power Shot", aliases: ["powershot"] },
  { key: "long-ball-pass", name: "Long Ball Pass", aliases: ["longballpass"] },
  { key: "aerial-fortress", name: "Aerial Fortress" },
  { key: "press-proven", name: "Press Proven" },
  { key: "bruiser", name: "Bruiser" },
  { key: "tiki-taka", name: "Tiki Taka", aliases: ["tikitaka"] },
  { key: "chip-shot", name: "Chip Shot" },
  { key: "enforcer", name: "Enforcer" },
  { key: "precision-header", name: "Precision Header" },
  { key: "low-driven-shot", name: "Low Driven Shot" },
  { key: "acrobatic", name: "Acrobatic" },
  { key: "gamechanger", name: "Gamechanger", aliases: ["game-changer"] },
  { key: "first-touch", name: "First Touch" },
  { key: "inventive", name: "Inventive" },
  { key: "technical", name: "Technical" },
  { key: "relentless", name: "Relentless" },
  { key: "slide-tackle", name: "Slide Tackle" },
  { key: "finesse-shot", name: "Finesse Shot" },
  { key: "rapid", name: "Rapid" },
  { key: "quick-step", name: "Quick Step" },
  { key: "whipped-pass", name: "Whipped Pass" },
]
const registry = new Map<string, { key: string; name: string }>()
for (const style of styles) {
  for (const alias of [style.key, style.name, ...(style.aliases ?? [])]) {
    registry.set(normalizePlayStyleKey(alias), style)
  }
}

export function getPlayStyleVisual(playStyle: PlayerPlayStyle): PlayStyleVisual {
  const key = normalizePlayStyleKey(playStyle.id)
  const entry = registry.get(key) ?? registry.get(normalizePlayStyleKey(playStyle.name))
  const hasPlus = (value: string) => /(?:\+|[\s_-]+plus)\s*$/i.test(value)
  return {
    playStyleKey: entry?.key ?? (key || normalizePlayStyleKey(playStyle.name) || "unknown"),
    displayName: entry?.name ?? (playStyle.name.replace(/(?:\+|[\s_-]+plus)\s*$/i, "").trim() || "PlayStyle não identificado"),
    isPlus: playStyle.level === "plus" || hasPlus(playStyle.id) || hasPlus(playStyle.name),
    iconSrc: null,
  }
}
