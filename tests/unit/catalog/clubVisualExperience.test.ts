import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { organizeClubPitch, groupClubSquad, XI_FORMATIONS, type PitchPlayer } from "../../../lib/clubPitchLayout"
import { clubComponents } from "../../helpers/clubExperienceFixture"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"

const players: PitchPlayer[] = Array.from({ length: 20 }, (_, i) => ({
  id: String(i), slug: `fixture-${i}`, name: `Fixture ${i}`, position: XI_FORMATIONS[0].rows.flat()[i % 11],
  secondaryPosition: null, secondaryPositions: [], potential: null, marketValue: null,
  officialOverall: 80 + i % 5, imageUrl: `https://example.test/player-portraits/${i}.png`,
}))

test("XI is deterministic, the full panel retains every player and neither mutates roster", () => {
  const before = JSON.stringify(players)
  const result = organizeClubPitch(players)
  assert.deepEqual(result, organizeClubPitch([...players].reverse()))
  assert.equal(result.selected.length, 11)
  const ids = groupClubSquad(players).flatMap(group => group.players).map(p => p.id)
  assert.equal(new Set(ids).size, players.length)
  assert.equal(ids.length, players.length)
  assert.equal(JSON.stringify(players), before)
})
test("unknown position stays in full panel; invalid OVR does not outrank valid zero", () => {
  const entries = [NaN, 0, 90, 70].map((officialOverall, i) => ({ ...players[0], id: String(i), officialOverall }))
  const unknown = { ...players[0], id: "unknown", position: "???" }
  const groups = groupClubSquad([...entries, unknown])
  assert.deepEqual(groups.find(g => g.key === "wingers")!.players.map(p => p.officialOverall), [90, 70, 0, NaN])
  assert.ok(groups.find(g => g.key === "otherPositions")!.players.some(p => p.id === "unknown"))
  assert.deepEqual(organizeClubPitch([]).selected, [])
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
  test(`${locale}: position panel shows full roster once, XI markers, secondary positions and persisted values`, () => {
    const entries = players.map((p, i) => i === 0 ? { ...p, potential: 92, marketValue: BigInt(80000000), secondaryPositions: ["MC", "MC"], secondaryPosition: "VOL" } : i === 1 ? { ...p, potential: 0, marketValue: BigInt(0) } : p)
    const selectedIds = new Set(organizeClubPitch(entries).selected.map(s => s.player.id))
    const html = renderToStaticMarkup(createElement(clubComponents.SquadPositionPanel, { locale, players: entries, selectedIds }))
    assert.equal((html.match(/class="squadPositionCard"/g) ?? []).length, entries.length)
    assert.equal((html.match(/class="xiMarker"/g) ?? []).length, 11)
    for (const p of entries) {
      assert.equal((html.match(new RegExp(`href="/${locale}/jogadores/${p.slug}"`, "g")) ?? []).length, 1)
      assert.ok(html.includes(`src="${p.imageUrl}"`))
    }
    assert.match(html, /OVR EA/)
    assert.match(html, /<dd>92<\/dd>/)
    assert.match(html, /<dd>€80M<\/dd>/)
    assert.match(html, /<dd>0<\/dd>/)
    assert.match(html, /<dd>€0<\/dd>/)
    assert.match(html, /<dd>—<\/dd>/)
    assert.match(html, /playerPositionSecondary">MC<\/span>/)
    assert.match(html, /playerPositionSecondary">VOL<\/span>/)
    assert.doesNotMatch(html, /NaN|undefined|OVR FutScout/)
  })
  test(`${locale}: XI and entire position panel retain portraits and semantic destinations`, () => {
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players, squadHref: `/${locale}/clubes/fixture?tab=squad` }))
    assert.match(html, /class="pitchMarkings" aria-hidden="true"/)
    assert.match(html, /class="squadPositionGroups"/)
    assert.match(html, /class="clubPitchPosition"/)
    assert.doesNotMatch(html, /class="pitchPosition"/)
    assert.match(html, locale === "pt" ? /Escalação FutScout/ : /FutScout XI/)
    assert.match(html, locale === "pt" ? /Não representa escalação oficial/ : /not an official lineup/)
    assert.doesNotMatch(html, /Starting XI|Provável escalação/)
    const selected = new Set(organizeClubPitch(players).selected.map(s => s.player.id))
    for (const p of players) {
      assert.equal((html.match(new RegExp(`href="/${locale}/jogadores/${p.slug}"`, "g")) ?? []).length, selected.has(p.id) ? 2 : 1)
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
