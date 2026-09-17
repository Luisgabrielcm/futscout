import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { mapEARatingsPlayer } from "../../../mappers/mapEARatingsPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { normalizePlayer } from "../../../normalizers/normalizePlayer"
import { normalizePosition } from "../../../normalizers/normalizePosition"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { formatCurrency } from "../../../utils/formatCurrency"
import { parsePlayerCatalogParams } from "../../../lib/playerCatalogParams"

const link = ({ children, ...props }: { children?: ReactNode; href: string }) => createElement("a", props, children)
const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>(
  "app/components/PlayerCard.tsx", {
    "next/link": link,
    "./PlayerImage": () => null,
    "./PlayerActions": () => null,
    "../../utils/formatCurrency": { formatCurrency },
  },
)
const { default: ScoutAnalysis } = loadCatalogModule<typeof import("../../../app/components/ScoutAnalysis")>(
  "app/components/ScoutAnalysis.tsx", { "../../utils/generateScoutAnalysis": { generateScoutAnalysis: () => ({ strengths: ["A"], weaknesses: ["B"], roles: ["C"] }) } },
)

test("EA taxonomy preserves wide midfielders and second striker instead of collapsing roles", () => {
  const expected = { RM: "MD", "RIGHT MIDFIELDER": "MD", LM: "ME", "LEFT MIDFIELDER": "ME", CF: "SA", "CENTRE FORWARD": "SA" } as const
  for (const [source, target] of Object.entries(expected)) assert.equal(normalizePosition(source), target)
  for (const source of ["RW", "LW", "ST", "CAM", "CM", "CDM", "RB", "LB", "CB", "GK"])
    assert.ok(normalizePosition(source))
})

test("fixture equivalent to a right winger only gains MD when RM actually comes from EA", () => {
  const base = { id: 277643, commonName: "Fixture winger", position: { label: "RW" }, overallRating: 90 }
  const withoutAlternative = normalizePlayer(mapEARatingsPlayer(base))
  const withAlternative = normalizePlayer(mapEARatingsPlayer({ ...base, alternatePositions: [{ label: "RM" }, { label: "CF" }, { label: "RM" }] }))
  assert.deepEqual(withoutAlternative.secondaryPositions, [])
  assert.deepEqual(withAlternative.secondaryPositions, ["MD", "SA"])
  assert.equal(withAlternative.secondaryPosition, "MD")
  assert.equal(withAlternative.name, "Fixture winger")
})

test("database mapper and card retain all supported official alternatives", () => {
  const player = mapDatabasePlayer(catalogPlayer({ position: "PD", secondaryPosition: "MD", secondaryPositions: ["MD", "ME", "SA"] }))
  const html = renderToStaticMarkup(createElement(Card, { ...player, club: null, locale: "pt" }))
  for (const position of ["PD", "MD", "ME", "SA"]) assert.equal((html.match(new RegExp(`>${position}<\\/span>`, "g")) ?? []).length, 1)
})

test("catalog filters accept every newly preserved EA role", () => {
  for (const position of ["MD", "ME", "SA"] as const)
    assert.equal(parsePlayerCatalogParams({ position }).position, position)
})

test("cards keep only EA OVR, potential, sourced value and explicit salary fallback", () => {
  const player = mapDatabasePlayer(catalogPlayer({ dynamicOverall: 99, form: "Excelente", potential: null, marketValue: null }))
  const html = renderToStaticMarkup(createElement(Card, { ...player, club: null, locale: "pt" }))
  assert.match(html, /OVR EA/)
  assert.match(html, /Potencial<\/span><strong>—<\/strong>/)
  assert.match(html, /VALOR ESTIMADO<\/span><strong class="marketValue">—<\/strong>/)
  assert.match(html, /Salário<\/span> <strong>—<\/strong>/)
  assert.doesNotMatch(html, /OVR FUTSCOUT|Forma|TENDÊNCIA/)
})

test("potential remains source-backed and preserves zero without inventing absence", () => {
  const absent = normalizePlayer(mapEARatingsPlayer({ id: 1, commonName: "Absent", position: { label: "CM" }, overallRating: 70 }))
  const zero = normalizePlayer(mapEARatingsPlayer({ id: 2, commonName: "Zero", position: { label: "CM" }, overallRating: 70, potential: 0 }))
  assert.equal(absent.potential, undefined)
  assert.equal(zero.potential, 0)
})

test("position map keeps MEI, MC, VOL and ZAG in four separate vertical bands", () => {
  const css = readFileSync("app/globals.css", "utf8")
  const top = (selector: string) => Number(css.match(new RegExp(`\\.${selector} \\{[\\s\\S]*?top: (\\d+)%`))?.[1])
  const mei = top("pitchMei"), mc = top("pitchMc"), vol = top("pitchVol")
  const zagBottom = Number(css.match(/\.pitchZag \{[\s\S]*?bottom: (\d+)%/)?.[1])
  assert.deepEqual([mei, mc, vol, zagBottom], [26, 43, 60, 5])
  assert.ok(mei < mc && mc < vol)
})

test("FutScout analysis uses the concise EA-context explanation", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  const pt = renderToStaticMarkup(createElement(ScoutAnalysis, { player, locale: "pt" }))
  const en = renderToStaticMarkup(createElement(ScoutAnalysis, { player, locale: "en" }))
  assert.match(pt, /Análise FutScout/)
  assert.match(pt, /Análise baseada nos atributos do jogador no EA SPORTS FC\./)
  assert.match(en, /Analysis based on the player&#x27;s EA SPORTS FC attributes\./)
  assert.doesNotMatch(pt, /ANÁLISE POR ATRIBUTOS|Leitura heurística/)
})
