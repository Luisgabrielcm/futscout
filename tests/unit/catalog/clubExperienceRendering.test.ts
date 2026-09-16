import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { clubComponents } from "../../helpers/clubExperienceFixture"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { Image, Flag } from "../../helpers/clubExperienceFixture"
import * as positions from "../../../lib/playerProfilePositions"
import * as styles from "../../../lib/playStyleAssets"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"
import type { PlayerPlayStyle } from "../../../types/player"

const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
  "./PlayerImage": Image, "./CountryFlag": Flag, "../../lib/playerProfilePositions": positions,
  "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference },
})
const { default: PlayStyles } = loadCatalogModule<typeof import("../../../app/components/PlayerPlayStyles")>("app/components/PlayerPlayStyles.tsx", { "../../lib/playStyleAssets": styles, "./PlayStyleIcon": ({ playStyle, locale }: { playStyle: PlayerPlayStyle; locale?: "pt" | "en" }) => { const visual = styles.getPlayStyleVisual(playStyle, locale); return visual.iconSrc ? createElement("img", { src: visual.iconSrc, alt: visual.displayName }) : null } })

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: actual header links only persisted club/league slugs and real contextual values`, () => {
    const player = mapDatabasePlayer(catalogPlayer({ nationality: "Spain", potential: 94, club: { name: "Not the slug", slug: "real-club", imageUrl: null, league: { name: "League", slug: "real-league" } } }))
    const html = renderToStaticMarkup(createElement(Header, { locale, player }))
    for (const suffix of ["clubes/real-club", "ligas/real-league", "selecoes/es", "jogadores?minOverall=80", "jogadores?minPotential=94", "jogadores?position=MC"]) assert.ok(html.includes(`href="/${locale}/${suffix}"`))
    const absent = renderToStaticMarkup(createElement(Header, { locale, player: mapDatabasePlayer(catalogPlayer()) }))
    assert.doesNotMatch(absent, /href=""|minPotential=|\/clubes\/|\/ligas\/|\/selecoes\//)
  })
  test(`${locale}: Plus filter follows persisted level, never an inferred name suffix`, () => {
    const player = mapDatabasePlayer(catalogPlayer())
    player.playStyles = [{ id: "tiki-taka", name: "Tiki Taka+", level: "normal" }]
    const normal = renderToStaticMarkup(createElement(PlayStyles, { locale, player }))
    assert.match(normal, /playStyle=tiki-taka/)
    assert.doesNotMatch(normal, /playStyleLevel/)
    player.playStyles[0].level = "plus"
    assert.match(renderToStaticMarkup(createElement(PlayStyles, { locale, player })), /playStyle=tiki-taka&amp;playStyleLevel=plus/)
  })
  test(`${locale}: partial roster stays visible in panel without fabricating an XI`, () => {
    const players = ["MC", "GOL", "ATA"].map((position, i) => ({ id: String(i), slug: "fixture-" + i, name: "Fixture " + i, position, officialOverall: 80, secondaryPosition: null, secondaryPositions: [], potential: null, marketValue: null, imageUrl: i ? null : "https://example.test/player-portraits/1.png" }))
    const html = renderToStaticMarkup(createElement(clubComponents.ClubPitch, { locale, players }))
    for (const p of players) assert.equal((html.match(new RegExp(`href="/${locale}/jogadores/${p.slug}"`, "g")) ?? []).length, 1)
    assert.match(html, /player-portraits\/1.png/)
    assert.match(html, locale === "pt" ? /Não representa escalação oficial/ : /not an official lineup/)
    assert.doesNotMatch(html, /player-shields|class="clubPitchPlayer"/)
    let anchorDepth = 0
    for (const tag of html.matchAll(/<\/?a(?:\s[^>]*|)>/g)) {
      anchorDepth += tag[0].startsWith("</") ? -1 : 1
      assert.ok(anchorDepth >= 0 && anchorDepth <= 1, "anchors must not nest")
    }
    assert.equal(anchorDepth, 0)
  })
  test(`${locale}: rich squad preserves missing/zero data and contextual destinations`, () => {
    const player = mapDatabasePlayer(catalogPlayer({ nationality: "Spain", potential: 0, marketValue: BigInt(0), club: { name: "Club", slug: "persisted-club", imageUrl: null, league: { name: "League", slug: "persisted-league" } } }))
    const html = renderToStaticMarkup(createElement(clubComponents.SquadList, { locale, players: [player] }))
    assert.match(html, new RegExp(`href="/${locale}/clubes/persisted-club"`))
    assert.match(html, new RegExp(`href="/${locale}/selecoes/es"`))
    assert.match(html, /<dd>0<\/dd>/)
    assert.match(html, /<dd>—<\/dd>/)
    assert.equal(player.club?.slug, "persisted-club")
    assert.equal(player.leagueSlug, "persisted-league")
  })
  test(`${locale}: rating is labeled FutScout with coverage and no fabricated unavailable rating`, () => {
    const html = renderToStaticMarkup(createElement(clubComponents.ClubRatingPanel, { locale, rating: { overall: null, goalkeeper: 80, rated: 1, total: 2 } }))
    assert.match(html, /FutScout/)
    assert.match(html, /1\/2/)
    assert.match(html, /<strong>—<\/strong>/)
    assert.match(html, locale === "pt" ? /Não é um rating oficial/ : /Not an official EA/)
    assert.match(html, locale === "pt" ? /ao menos um jogador com OVR válido na categoria/ : /at least one player with valid OVR in its category/)
  })
}
