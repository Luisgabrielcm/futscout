import type { PlayerPlayStyle } from "../types/player"
import type { Locale } from "./i18n/config"
import { getVisualAssetSrc } from "./visualAssets"

// Central registry for original FutScout artwork. No URL derivation from providers.
export type PlayStyleArtwork = Readonly<Record<string, { normal?: string; plus?: string }>>

// Original FutScout glyphs. These are conceptual symbols, not EA artwork.
const glyph = (name: string) => `/playstyles/${name}.svg`
export const playStyleArtwork: PlayStyleArtwork = {
  anticipate: { normal: glyph("defense"), plus: glyph("defense") }, block: { normal: glyph("defense"), plus: glyph("defense") },
  "cross-claimer": { normal: glyph("passing"), plus: glyph("passing") }, "dead-ball": { normal: glyph("passing"), plus: glyph("passing") },
  deflector: { normal: glyph("defense"), plus: glyph("defense") }, "far-reach": { normal: glyph("speed"), plus: glyph("speed") },
  "far-throw": { normal: glyph("passing"), plus: glyph("passing") }, footwork: { normal: glyph("speed"), plus: glyph("speed") },
  "incisive-pass": { normal: glyph("passing"), plus: glyph("passing") }, intercept: { normal: glyph("defense"), plus: glyph("defense") },
  jockey: { normal: glyph("defense"), plus: glyph("defense") }, "long-throw": { normal: glyph("passing"), plus: glyph("passing") },
  "pinged-pass": { normal: glyph("passing"), plus: glyph("passing") }, "rush-out": { normal: glyph("speed"), plus: glyph("speed") },
  trickster: { normal: glyph("control"), plus: glyph("control") }, "power-shot": { normal: glyph("finishing"), plus: glyph("finishing") },
  "long-ball-pass": { normal: glyph("passing"), plus: glyph("passing") }, "aerial-fortress": { normal: glyph("defense"), plus: glyph("defense") },
  "press-proven": { normal: glyph("stamina"), plus: glyph("stamina") }, bruiser: { normal: glyph("physical"), plus: glyph("physical") },
  "tiki-taka": { normal: glyph("control"), plus: glyph("control") }, "chip-shot": { normal: glyph("finishing"), plus: glyph("finishing") },
  enforcer: { normal: glyph("defense"), plus: glyph("defense") }, "precision-header": { normal: glyph("finishing"), plus: glyph("finishing") },
  "low-driven-shot": { normal: glyph("finishing"), plus: glyph("finishing") }, acrobatic: { normal: glyph("finishing"), plus: glyph("finishing") },
  gamechanger: { normal: glyph("stamina"), plus: glyph("stamina") }, "first-touch": { normal: glyph("control"), plus: glyph("control") },
  inventive: { normal: glyph("control"), plus: glyph("control") }, technical: { normal: glyph("control"), plus: glyph("control") },
  relentless: { normal: glyph("stamina"), plus: glyph("stamina") }, "slide-tackle": { normal: glyph("defense"), plus: glyph("defense") },
  "finesse-shot": { normal: glyph("finishing"), plus: glyph("finishing") }, rapid: { normal: glyph("speed"), plus: glyph("speed") },
  "quick-step": { normal: glyph("speed"), plus: glyph("speed") }, "whipped-pass": { normal: glyph("passing"), plus: glyph("passing") },
}
export function getPlayStyleIcon(key: string, isPlus: boolean, artwork: PlayStyleArtwork = playStyleArtwork): string | null {
  const src = artwork[key]?.[isPlus ? "plus" : "normal"]
  return getVisualAssetSrc(src, "asset")
}

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

// Central registry; aliases are exact, never fuzzy. Provider artwork is never
// synthesized or substituted for these original FutScout glyphs.
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
// FutScout presentation translations, not a claim of official EA terminology.
// Proper names (Tiki Taka) remain unchanged; unknown styles keep source text.
export const playStyleNamesPt: Record<string, string> = {
  anticipate: "Antecipação", block: "Bloqueio", "cross-claimer": "Domínio de cruzamentos",
  "dead-ball": "Bola parada", deflector: "Desvio", "far-reach": "Longo alcance",
  "far-throw": "Lançamento longo do goleiro", footwork: "Trabalho de pés",
  "incisive-pass": "Passe incisivo", intercept: "Interceptação", jockey: "Contenção",
  "long-throw": "Lateral longo", "pinged-pass": "Passe forte", "rush-out": "Saída rápida",
  trickster: "Truques", "power-shot": "Chute Potente", "long-ball-pass": "Passe longo",
  "aerial-fortress": "Fortaleza aérea", "press-proven": "Resistência à pressão",
  bruiser: "Força no contato", "tiki-taka": "Tiki Taka", "chip-shot": "Cavadinha",
  enforcer: "Imposição física", "precision-header": "Cabeceio preciso",
  "low-driven-shot": "Chute rasteiro forte", acrobatic: "Acrobático",
  gamechanger: "Decisivo", "first-touch": "Primeiro toque", inventive: "Inventivo",
  technical: "Técnico", relentless: "Incansável", "slide-tackle": "Carrinho",
  "finesse-shot": "Chute colocado", rapid: "Veloz", "quick-step": "Arrancada",
  "whipped-pass": "Cruzamento com efeito",
}
for (const style of styles) {
  for (const alias of [style.key, style.name, ...(style.aliases ?? [])]) {
    registry.set(normalizePlayStyleKey(alias), style)
  }
}

export function getPlayStyleVisual(playStyle: PlayerPlayStyle, locale: Locale = "en"): PlayStyleVisual {
  const key = normalizePlayStyleKey(playStyle.id)
  const entry = registry.get(key) ?? registry.get(normalizePlayStyleKey(playStyle.name))
  const hasPlus = (value: string) => /(?:\+|[\s_-]+plus)\s*$/i.test(value)
  const isPlus = playStyle.level === "plus" || hasPlus(playStyle.id) || hasPlus(playStyle.name)
  return {
    playStyleKey: entry?.key ?? (key || normalizePlayStyleKey(playStyle.name) || "unknown"),
    displayName: (entry && (locale === "pt" ? playStyleNamesPt[entry.key] ?? entry.name : entry.name)) || (playStyle.name.replace(/(?:\+|[\s_-]+plus)\s*$/i, "").trim() || (locale === "pt" ? "PlayStyle não identificado" : "Unidentified PlayStyle")),
    isPlus,
    iconSrc: entry ? getPlayStyleIcon(entry.key, isPlus) : null,
  }
}
