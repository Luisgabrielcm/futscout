import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { Image, Flag } from "../../helpers/clubExperienceFixture"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { displayNationality } from "../../../lib/i18n/countries"
import { getPlayStyleVisual, styles, playStyleArtwork, playStyleNamesPt } from "../../../lib/playStyleAssets"
import * as playStyleAssets from "../../../lib/playStyleAssets"
import * as levels from "../../../utils/getAttributeLevel"
import * as positions from "../../../lib/playerProfilePositions"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"
import type { PlayerPlayStyle } from "../../../types/player"

const { default: Attributes } = loadCatalogModule<typeof import("../../../app/components/PlayerAttributes")>("app/components/PlayerAttributes.tsx", { "../../utils/getAttributeLevel": levels })
const { default: Quick } = loadCatalogModule<typeof import("../../../app/components/PlayerQuickProfile")>("app/components/PlayerQuickProfile.tsx", {})
const { default: PlayStyles } = loadCatalogModule<typeof import("../../../app/components/PlayerPlayStyles")>("app/components/PlayerPlayStyles.tsx", { "../../lib/playStyleAssets": playStyleAssets, "./PlayStyleIcon": ({ playStyle, locale }: { playStyle: PlayerPlayStyle; locale?: "pt" | "en" }) => { const visual = playStyleAssets.getPlayStyleVisual(playStyle, locale); return visual.iconSrc ? createElement("img", { src: visual.iconSrc, alt: visual.displayName }) : null } })
const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
  "./PlayerImage": Image, "./CountryFlag": Flag, "../../lib/playerProfilePositions": positions,
  "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference },
})

test("nationality display translates exact countries only, without changing identity", () => {
  for (const [name, pt, en] of [["Spain", "Espanha", "Spain"], ["Germany", "Alemanha", "Germany"], ["England", "Inglaterra", "England"], ["France", "França", "France"]]) {
    assert.equal(displayNationality(name, "pt"), pt)
    assert.equal(displayNationality(name, "en"), en)
  }
  assert.equal(displayNationality("Unlisted Nation", "pt"), "Unlisted Nation")
  assert.equal(displayNationality(null, "en"), "Not available")
  assert.equal(displayNationality("Northern Ireland", "pt"), "Irlanda do Norte")
  assert.equal(displayNationality("Congo", "pt"), "Congo")
})

test("every allowed PlayStyle has presentation text, with canonical key and Plus unchanged", () => {
  assert.equal(styles.length, 36)
  assert.equal(Object.keys(playStyleArtwork).length, styles.length)
  assert.equal(new Set(styles.map(style => style.key)).size, styles.length)
  for (const style of styles) {
    assert.ok(playStyleArtwork[style.key])
    assert.ok(playStyleNamesPt[style.key])
    const input = { id: style.key, name: style.name, level: "plus" as const }
    const pt = getPlayStyleVisual(input, "pt"), en = getPlayStyleVisual(input, "en")
    assert.equal(pt.playStyleKey, en.playStyleKey)
    assert.equal(pt.isPlus, true)
    assert.match(pt.iconSrc ?? "", /^\/playstyles\/.+\.svg$/)
    assert.ok(existsSync(`public${pt.iconSrc}`))
    assert.equal(pt.iconSrc, en.iconSrc)
    assert.equal(en.displayName, style.name)
  }
  assert.equal(getPlayStyleVisual({ id: "relentless", name: "Relentless", level: "normal" }, "pt").displayName, "Incansável")
  assert.equal(getPlayStyleVisual({ id: "power-shot", name: "Power Shot", level: "normal" }, "pt").displayName, "Chute Potente")
})

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: GK shows persisted general subattributes and neutral face codes, not fabricated GK fields`, () => {
    const player = mapDatabasePlayer(catalogPlayer({ position: "GOL" }))
    player.attributes.pace.overall = 84
    player.attributes.pace.acceleration = 45
    player.attributes.pace.sprintSpeed = 50
    const html = renderToStaticMarkup(createElement(Attributes, { locale, attributes: player.attributes, isGoalkeeper: true }))
    assert.match(html, /PAC<\/dt><dd>84<\/dd>/)
    assert.match(html, /<strong>45<\/strong>/)
    assert.match(html, /<strong>50<\/strong>/)
    assert.match(html, locale === "pt" ? /Aceleração/ : /Acceleration/)
    assert.match(html, locale === "pt" ? /ainda não estão persistidos/ : /not yet persisted/)
    assert.equal((html.match(/<details open=""/g) ?? []).length, 6)
    assert.doesNotMatch(html, /Diving|Mergulho|Handling|Manejo/)
  })
  test(`${locale}: missing attributes never produce fake zero or a bar; valid zero survives`, () => {
    const missing = renderToStaticMarkup(createElement(Attributes, { locale, attributes: null, isGoalkeeper: true }))
    assert.doesNotMatch(missing, /<strong>0<\/strong>|<dd>0<\/dd>|width:/)
    assert.match(missing, /<dd>—<\/dd>/)
    const partial = renderToStaticMarkup(createElement(Attributes, { locale, attributes: { pace: { acceleration: 0, sprintSpeed: null, overall: NaN } }, isGoalkeeper: true }))
    assert.match(partial, /<strong>0<\/strong>/)
    assert.doesNotMatch(partial, /NaN|undefined|null/)
  })
  test(`${locale}: header and overview localize country, retain real links and ordered unique positions`, () => {
    const player = mapDatabasePlayer(catalogPlayer({ nationality: "Spain", position: "MC", secondaryPositions: ["VOL", "MC", "VOL", "MEI"], secondaryPosition: "VOL", club: { name: "Club", slug: "club-real", imageUrl: "/player-shields/wrong.png", league: { name: "League", slug: "league-real" } } }))
    const html = renderToStaticMarkup(createElement(Header, { locale, player }))
    const quick = renderToStaticMarkup(createElement(Quick, { locale, player }))
    for (const markup of [html, quick]) {
      assert.match(markup, locale === "pt" ? /Espanha/ : /Spain/)
      assert.ok(markup.includes(`href="/${locale}/selecoes/es"`))
      assert.ok(markup.includes(`href="/${locale}/ligas/league-real"`))
    }
    assert.ok(html.includes(`href="/${locale}/clubes/club-real"`))
    assert.match(html, /\/flags\/es.svg/)
    assert.doesNotMatch(html, /player-shields/)
    for (const position of ["MC", "VOL", "MEI"]) assert.equal((html.match(new RegExp(`href="/${locale}/jogadores\\?position=${position}"`, "g")) ?? []).length, 1)
    assert.ok(html.indexOf("position=MC") < html.indexOf("position=VOL"))
    assert.ok(html.indexOf("position=VOL") < html.indexOf("position=MEI"))
    assert.doesNotMatch(quick, /position=/)
  })
  test(`${locale}: localized PlayStyle link uses original key and actual Plus level`, () => {
    const player = mapDatabasePlayer(catalogPlayer())
    player.playStyles = [{ id: "relentless", name: "Relentless", level: "plus" }]
    const html = renderToStaticMarkup(createElement(PlayStyles, { locale, player }))
    assert.match(html, locale === "pt" ? />Incansável</ : />Relentless</)
    assert.ok(html.includes(`href="/${locale}/jogadores?playStyle=relentless&amp;playStyleLevel=plus"`))
    assert.match(html, /PlayStyle\+/)
    assert.equal(player.playStyles[0].name, "Relentless")
  })
}
