import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import * as positions from "../../../lib/playerProfilePositions"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"

const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>(
  "app/components/PlayerHeader.tsx", {
    "./PlayerImage": ({ alt }: { alt: string }) => createElement("span", null, alt),
    "./CountryFlag": ({ country }: { country: string }) => createElement("span", null, country),
    "../../lib/playerProfilePositions": positions,
    "../../utils/formatCurrency": { formatCurrency },
    "../../utils/getOverallDifference": { getOverallDifference },
  },
)
const { default: QuickProfile } = loadCatalogModule<typeof import("../../../app/components/PlayerQuickProfile")>(
  "app/components/PlayerQuickProfile.tsx", {},
)

test("positions keep primary first and stable unique secondary/legacy values without mutating input", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  player.position = "ATA"
  player.secondaryPositions = ["PE", "ATA", "PD", "PE"]
  player.secondaryPosition = "MEI"
  assert.deepEqual(positions.getPlayerProfilePositions(player), ["ATA", "PE", "PD", "MEI"])
  assert.deepEqual(player.secondaryPositions, ["PE", "ATA", "PD", "PE"])
})

test("no secondary position means exactly one primary badge", () => {
  const player = mapDatabasePlayer(catalogPlayer({ secondaryPosition: null, secondaryPositions: [] }))
  assert.deepEqual(positions.getPlayerProfilePositions(player), [player.position])
  const html = renderToStaticMarkup(createElement(Header, { player }))
  assert.equal((html.match(/title="Posição principal"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /title="Posição secundária"/)
})

test("header groups unique primary/secondary badges before the player name", () => {
  const player = mapDatabasePlayer(catalogPlayer({ position: "MC", secondaryPosition: "VOL", secondaryPositions: ["VOL", "MEI", "MC"] }))
  const html = renderToStaticMarkup(createElement(Header, { player }))
  assert.equal((html.match(/title="Posição secundária"/g) ?? []).length, 2)
  assert.ok(html.indexOf("playerPositionPrimary") < html.indexOf("playerPositionSecondary"))
  assert.ok(html.indexOf(">MEI</a>") >= 0 && html.indexOf(">MEI</a>") < html.indexOf("<h1>"))
})

test("header keeps EA overall primary and renders only supplied league text without a guessed logo", () => {
  const player = mapDatabasePlayer(catalogPlayer({ officialOverall: 85, dynamicOverall: 88,
    club: { name: "Clube Teste", imageUrl: null, league: { name: "Liga Teste" } } }))
  const html = renderToStaticMarkup(createElement(Header, { player }))
  assert.match(html, /OVR EA/)
  assert.match(html, /class="playerHeaderStatMain">85</)
  assert.match(html, /OVR FutScout: 88/)
  assert.match(html, /class="playerHeaderLeague"/)
  assert.match(html, /Liga Teste/)
  assert.match(html, /brandAssetFallback-league/)
  assert.doesNotMatch(html, /<img/)
  const absent = renderToStaticMarkup(createElement(Header, { player: { ...player, league: null } }))
  assert.doesNotMatch(absent, /playerHeaderLeague|Liga Teste/)
})

test("quick profile retains six factual fields without repeating header positions", () => {
  const html = renderToStaticMarkup(createElement(QuickProfile, { player: mapDatabasePlayer(catalogPlayer()) }))
  for (const label of ["NACIONALIDADE", "LIGA", "ALTURA", "PÉ PREFERIDO", "SKILL MOVES", "PERNA RUIM"]) assert.ok(html.includes(label))
  assert.equal((html.match(/class="quickProfileItem"/g) ?? []).length, 6)
  assert.doesNotMatch(html, /POSIÇÃO|POSIÇÕES/)
})
