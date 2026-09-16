import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { getPlayStyleIcon, getPlayStyleVisual } from "../../../lib/playStyleAssets"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

const { default: Badge } = loadCatalogModule<typeof import("../../../app/components/ClubBadge")>("app/components/ClubBadge.tsx", {})
const { default: Career } = loadCatalogModule<typeof import("../../../app/components/PlayerCareer")>("app/components/PlayerCareer.tsx", {})
const { default: History } = loadCatalogModule<typeof import("../../../app/components/PlayerHistory")>("app/components/PlayerHistory.tsx", {})
const { default: PlayStyles } = loadCatalogModule<typeof import("../../../app/components/PlayerPlayStyles")>("app/components/PlayerPlayStyles.tsx", {})

test("shared club badge uses supplied artwork with dimensions and lazy loading", () => {
  const html = renderToStaticMarkup(createElement(Badge, { name: "Fixture Club", src: "/clubs/fixture.svg", size: "small" }))
  assert.match(html, /src="\/clubs\/fixture.svg"/)
  assert.match(html, /width="24" height="24" loading="lazy"/)
  assert.match(html, /alt="Fixture Club"/)
  assert.doesNotMatch(html, /clubBadgeFallback/)
})

test("club absence and wrong-context image use neutral FutScout, never another club's initial", () => {
  for (const src of [null, "/player-shields/1.png", "/players/1.png", "/leagues/1.png"]) {
    const html = renderToStaticMarkup(createElement(Badge, { name: "Fixture Club", src }))
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /Fixture Club — imagem indisponível/)
    assert.match(html, />F<\/span>/)
  }
})

test("PlayStyle asset mapping is explicit and separates normal from plus artwork", () => {
  const fixture = { rapid: { normal: "/playstyles/rapid.svg", plus: "/playstyles/rapid-plus.svg" } }
  assert.equal(getPlayStyleIcon("rapid", false, fixture), "/playstyles/rapid.svg")
  assert.equal(getPlayStyleIcon("rapid", true, fixture), "/playstyles/rapid-plus.svg")
  assert.equal(getPlayStyleIcon("unknown", false, fixture), null)
  assert.equal(getPlayStyleIcon("rapid", true, { rapid: { normal: "/playstyles/rapid.svg" } }), null)
  assert.equal(getPlayStyleIcon("rapid", false, { rapid: { normal: "javascript:bad" } }), null)
  assert.equal(getPlayStyleVisual({ id: "rapid", name: "Rapid", level: "normal" }).iconSrc, null)
})

test("missing PlayStyle art renders readable names, not empty circles or fabricated icons", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  player.playStyles = [{ id: "rapid", name: "Rapid", level: "plus" }]
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(PlayStyles, { player, locale }))
    assert.match(html, /playStylePlus/)
    assert.match(html, /PlayStyle\+/)
    assert.ok(html.includes(locale === "pt" ? "Veloz" : "Rapid"))
    assert.doesNotMatch(html, /class="playStyleIcon"|<img|role="img"/)
  }
})

test("real-life fields remain independent of catalog club and nationality in PT/EN", () => {
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(Career, { locale, catalogClub: "EA fixture" }))
    assert.match(html, /id="real-life"/)
    assert.match(html, /data-domain="real"/)
    assert.ok(html.includes(locale === "pt" ? "Vida Real" : "Real Life"))
    assert.match(html, /EA fixture/)
    assert.match(html, locale === "pt" ? /Clube atual confirmado<\/dt><dd>—/ : /Confirmed current club<\/dt><dd>—/)
    assert.match(html, locale === "pt" ? /Liga real<\/dt><dd>—/ : /Real-world league<\/dt><dd>—/)
    assert.match(html, /href="#history"/)
    assert.doesNotMatch(html, /transferTimeline/)
  }
})

test("verified salary and real club never overwrite the EA context; zero remains a value", () => {
  const html = renderToStaticMarkup(createElement(Career, { locale: "en", catalogClub: "EA fixture", data: {
    source: "test fixture", currentClub: "Real fixture", realLeague: "Real league fixture", shirtNumber: 0,
    salary: { amount: 1000, currency: "EUR", period: "week", source: "test fixture" },
  } }))
  assert.match(html, /EA fixture/)
  assert.match(html, /Confirmed current club<\/dt><dd>Real fixture/)
  assert.match(html, /Salary<\/dt><dd>€1,000 \/ week/)
  assert.match(html, /Shirt number<\/dt><dd>0/)
})

test("history belongs to real life and does not render unverified transfer evidence", () => {
  const data = { source: "", transfers: [{ id: "fixture", date: "2026-01-03", from: "A", to: "B", typeRaw: "Loan" }] }
  const html = renderToStaticMarkup(createElement(History, { locale: "en", data }))
  assert.match(html, /id="history"/)
  assert.match(html, /data-domain="real"/)
  assert.match(html, /Real Life/)
  assert.match(html, /Verified history is not yet available/)
  assert.doesNotMatch(html, /Loan|transferTimeline/)
})

test("profile navigation resolves all anchors and keeps history after the EA sections", async () => {
  const marker = () => null
  const { default: Page } = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("unexpected") } },
    "../../../../services/playerService": { getPlayerBySlug: async () => ({ status: "complete", player: mapDatabasePlayer(catalogPlayer()) }) },
    "../../../components/PlayerHeader": marker, "../../../components/PlayerActions": marker,
    "../../../components/PlayerQuickProfile": marker, "../../../components/PlayerPositions": marker,
    "../../../components/PlayerAttributes": marker, "../../../components/PlayerPlayStyles": marker,
    "../../../components/ScoutAnalysis": marker,
  })
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, slug: "fixture" }) }))
    for (const id of ["overview", "ea-sports-fc", "real-life", "attributes", "playstyles", "statistics", "history"]) {
      assert.match(html, new RegExp(`href="#${id}"`))
      assert.equal((html.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1)
    }
    assert.ok(html.indexOf('id="history"') > html.indexOf('id="playstyles"'))
    assert.match(html, /EA SPORTS FC/)
  }
})

test("plain typography and restrained primary button contracts retain focus and wrapping", () => {
  const css = readFileSync("app/globals.css", "utf8")
  for (const match of css.matchAll(/text-shadow:\s*([^;}]+)/g)) assert.equal(match[1].trim(), "none")
  assert.doesNotMatch(css, /drop-shadow\(/)
  for (const match of css.matchAll(/-webkit-text-stroke:\s*([^;}]+)/g)) assert.equal(match[1].trim(), "0")
  assert.match(css, /\.uiButton\.uiButtonPrimary\s*\{[^}]*background:\s*#101c15/)
  assert.match(css, /\.playerSectionNav\s*\{[^}]*flex-wrap:\s*wrap/)
  assert.match(css, /\.uiButton:focus-visible/)
  assert.match(css, /\.uiButton:disabled/)
})
