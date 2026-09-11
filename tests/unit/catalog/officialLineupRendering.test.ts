import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { clubComponents } from "../../helpers/clubExperienceFixture"
import { fixturePayload, lineupPayload, lineupCatalog, lineupNow } from "../../fixtures/officialLineup"
import { associateOfficialLineup, parseFixture, parseOfficialLineup } from "../../../lib/officialLineup"

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: official XI overrides OVR selection; all squad and match bench remain distinct`, () => {
    const lineup = associateOfficialLineup(parseOfficialLineup(parseFixture(fixturePayload(), 1, lineupNow)!, lineupPayload(), 1, lineupNow.toISOString())!, lineupCatalog.slice(1), lineupNow)
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players: lineupCatalog, officialLineup: lineup }))
    assert.equal((html.match(/class="clubPitchPlayer officialStarter"/g) ?? []).length, 11)
    assert.equal((html.match(/class="officialBenchPlayer"/g) ?? []).length, 1)
    assert.equal((html.match(/class="squadPositionCard"/g) ?? []).length, 12)
    assert.match(html, locale === "pt" ? /Escalação oficial/ : /Official lineup/)
    assert.match(html, locale === "pt" ? /Banco da partida/ : /Match substitutes/)
    assert.match(html, locale === "pt" ? /Elenco por posição/ : /Squad by position/)
    assert.match(html, /Home fixture × Away fixture/); assert.match(html, /Test competition/); assert.match(html, /4-3-3/)
    assert.match(html, /Source 1/); assert.match(html, locale === "pt" ? /Sem associação ao catálogo/ : /Not linked to the catalogue/)
    assert.match(html, new RegExp(`href="/${locale}/jogadores/local-2"`))
    assert.match(html, /<dd>0<\/dd>/); assert.match(html, /<dd>€0<\/dd>/); assert.match(html, /<dd>—<\/dd>/)
    assert.doesNotMatch(html, /xiMarker|API_FOOTBALL_KEY|Escalação FutScout|FutScout XI/)
  })
  test(`${locale}: absent lineup keeps explicitly non-official FutScout fallback`, () => {
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players: lineupCatalog, officialLineup: null }))
    assert.match(html, locale === "pt" ? /Escalação FutScout/ : /FutScout XI/)
    assert.doesNotMatch(html, /officialStarter|officialBench/)
  })
  test(`${locale}: stale and unavailable placement/bench do not fabricate data`, () => {
    const p = lineupPayload(); p[0].formation = null; p[0].startXI.forEach(v => { v.player.grid = null })
    const normalized = parseOfficialLineup(parseFixture(fixturePayload(100, "2026-08-01"), 1, lineupNow)!, p, 1, lineupNow.toISOString())!
    normalized.substitutes = null
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players: [], officialLineup: associateOfficialLineup(normalized, [], lineupNow) }))
    assert.match(html, locale === "pt" ? /Escalação antiga/ : /Older lineup/)
    assert.match(html, locale === "pt" ? /Posicionamento indisponível/ : /Placement unavailable/)
    assert.match(html, locale === "pt" ? /Dado indisponível/ : /Data unavailable/)
    assert.equal((html.match(/officialStarter/g) ?? []).length, 11)
    assert.doesNotMatch(html, /href=".*jogadores/)
  })
}
