import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { organizeClubPitch, type PitchPlayer } from "../../../lib/clubPitchLayout"
import { clubComponents } from "../../helpers/clubExperienceFixture"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"

const players: PitchPlayer[] = Array.from({ length: 20 }, (_, i) => ({
  id: String(i), slug: `fixture-${i}`, name: `Fixture ${i}`, position: ["ATA", "MC", "ZAG", "GOL"][i % 4],
  officialOverall: 80 + i % 5, imageUrl: `https://example.test/player-portraits/${i}.png`,
}))

test("pitch is a deterministic bounded sector view, preserves every option and never mutates roster", () => {
  const before = JSON.stringify(players)
  const result = organizeClubPitch(players)
  assert.deepEqual(result, organizeClubPitch([...players].reverse()))
  assert.equal(result.sectors.length, 4)
  assert.ok(result.sectors.every(s => s.players.length <= 3))
  assert.equal(result.options.length, 8)
  const ids = [...result.sectors.flatMap(s => s.players), ...result.options].map(p => p.id)
  assert.equal(new Set(ids).size, players.length)
  assert.equal(ids.length, players.length)
  assert.equal(JSON.stringify(players), before)
})
test("unknown position remains an option; absent/invalid OVR does not outrank valid zero", () => {
  const entries = [NaN, 0, 90, 70].map((officialOverall, i) => ({ ...players[0], id: String(i), officialOverall }))
  const unknown = { ...players[0], id: "unknown", position: "???" }
  const result = organizeClubPitch([...entries, unknown])
  assert.deepEqual(result.sectors[0].players.map(p => p.officialOverall), [90, 70, 0])
  assert.ok(result.options.some(p => p.id === "unknown"))
  assert.deepEqual(organizeClubPitch([]).options, [])
})
test("shared link styling removes permanent underline without erasing hover/focus or anchor semantics", () => {
  const css = readFileSync("app/globals.css", "utf8")
  assert.doesNotMatch(css, /text-decoration(?:-line)?\s*:\s*underline/)
  assert.match(css, /a\[href\]\s*\{[^}]*text-decoration:\s*none/)
  assert.match(css, /a\[href\]:focus-visible\s*\{[^}]*outline:\s*2px solid/)
  assert.match(css, /a\[href\]:hover\s*\{[^}]*background-color:/)
  assert.match(css, /\.clubSquadIdentity::after\s*\{[^}]*inset:\s*0/)
  assert.match(css, /\.clubSquadContext a\s*\{[^}]*z-index:\s*2/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /\.clubTabs\s*\{[^}]*overflow-x:\s*auto/)
})

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: original field, options and every portrait retain semantic player destinations`, () => {
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players, squadHref: `/${locale}/clubes/fixture?tab=squad` }))
    assert.match(html, /class="pitchMarkings" aria-hidden="true"/)
    assert.match(html, /class="squadOptionsGrid"/)
    assert.match(html, /class="clubPitchPosition"/)
    assert.doesNotMatch(html, /class="pitchPosition"/)
    assert.match(html, locale === "pt" ? /Organização FutScout|Opções de elenco/ : /FutScout squad view|Squad options/)
    assert.match(html, locale === "pt" ? /Não é uma escalação oficial/ : /not a lineup/)
    assert.doesNotMatch(html, /Starting XI|4-3-3|Provável escalação/)
    for (const p of players) {
      assert.equal((html.match(new RegExp(`href="/${locale}/jogadores/${p.slug}"`, "g")) ?? []).length, 1)
      assert.ok(html.includes(`src="${p.imageUrl}"`))
    }
    assert.ok(html.includes(`href="/${locale}/clubes/fixture?tab=squad"`))
  })
  test(`${locale}: rich country/squad cards retain photos, secondary links, missing values and no nested anchors`, () => {
    const player = mapDatabasePlayer(catalogPlayer({ nationality: "France", imageUrl: "https://example.test/player-portraits/real.png", secondaryPositions: ["MC", "VOL", "VOL"], secondaryPosition: "MEI", potential: 0 }))
    const html = renderToStaticMarkup(createElement(clubComponents.SquadList, { locale, players: [player] }))
    assert.match(html, /clubSquadPlayer|cardDestination/)
    assert.match(html, /src="https:\/\/example.test\/player-portraits\/real.png"/)
    assert.match(html, /playerPositionPrimary/)
    assert.equal((html.match(/playerPositionSecondary/g) ?? []).length, 2)
    for (const position of ["MC", "VOL", "MEI"]) assert.equal((html.match(new RegExp(`position=${position}"`, "g")) ?? []).length, 1)
    assert.ok(html.includes(`href="/${locale}/selecoes/fr"`))
    assert.match(html, /<dd>0<\/dd>/)
    assert.match(html, /<dd>—<\/dd>/)
    let depth = 0
    for (const tag of html.matchAll(/<\/?a(?:\s[^>]*|)>/g)) { depth += tag[0].startsWith("</") ? -1 : 1; assert.ok(depth >= 0 && depth <= 1) }
    assert.equal(depth, 0)
    const missing = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players: [{ ...players[0], imageUrl: null }] }))
    assert.match(missing, /portraitFallback/)
    assert.doesNotMatch(missing, /<img/)
  })
}
