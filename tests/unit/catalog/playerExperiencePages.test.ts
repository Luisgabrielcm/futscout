import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import type { PlayerRealLifeProfile } from "../../../types/playerRealLife"

const complete = { status: "ready" as const, player: mapDatabasePlayer(catalogPlayer({
  slug: "rodri", name: "Rodri", club: { slug: "manchester-city", name: "Manchester City", imageUrl: null, league: { slug: "premier-league", name: "Premier League" } },
})) }

const realProfile = (name: string, approvedName: string | null): PlayerRealLifeProfile => ({
  id: `id-${name}`, slug: name.toLowerCase().replaceAll(" ", "-"), name, imageUrl: null, nationality: "Spain",
  eaCatalogClub: { slug: "manchester-city", name: "Manchester City" },
  approvedCurrentClub: approvedName ? {
    id: `club-${approvedName}`, slug: approvedName.toLowerCase().replaceAll(" ", "-"), name: approvedName, imageUrl: null,
    league: { slug: "laliga", name: "LaLiga" },
  } : null,
})

function marker(label: string) { return function Marker() { return createElement("p", null, label) } }

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: EA page has exactly two experience links and keeps attributes and PlayStyles in EA`, async () => {
    const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND") } },
      "../../../../services/playerService": { getPlayerBySlug: async () => complete },
      "../../../components/PlayerHeader": marker("EA_HEADER"), "../../../components/PlayerActions": marker("ACTIONS"),
      "../../../components/PlayerQuickProfile": marker("QUICK"), "../../../components/PlayerPositions": marker("POSITIONS"),
      "../../../components/PlayerAttributes": marker("ATTRIBUTES"), "../../../components/PlayerPlayStyles": marker("PLAYSTYLES"),
      "../../../components/ScoutAnalysis": marker("ANALYSIS"),
    })
    const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ locale, slug: "rodri" }) }))
    const nav = html.match(/<nav class="playerExperienceNav"[\s\S]*?<\/nav>/)?.[0] ?? ""
    assert.equal((nav.match(/<a /g) ?? []).length, 2)
    assert.ok(nav.includes(`href="/${locale}/jogadores/rodri"`))
    assert.ok(nav.includes(`href="/${locale}/jogadores/rodri/vida-real"`))
    for (const label of ["EA_HEADER", "ATTRIBUTES", "PLAYSTYLES", "ANALYSIS"]) assert.ok(html.includes(label))
    assert.doesNotMatch(html, /data-domain="real"|id="statistics"|id="history"/)
    assert.match(html, /Manchester City/)
  })

  test(`${locale}: real-life page renders approved Barcelona independently from EA Manchester City`, async () => {
    const player = realProfile("Rodri", "Barcelona")
    const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/vida-real/page")>("app/[locale]/jogadores/[slug]/vida-real/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND") } },
      "../../../../../services/playerRealLifeService": { getPlayerRealLifeBySlug: async () => player },
      "../../../../components/PlayerRealLifeHeader": ({ player: value }: { player: PlayerRealLifeProfile }) => createElement("p", null, `REAL_HEADER:${value.approvedCurrentClub?.name}`),
    })
    const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ locale, slug: "rodri" }) }))
    assert.match(html, /REAL_HEADER:Barcelona/)
    assert.match(html, /Manchester City/)
    assert.match(html, /Barcelona/)
    assert.match(html, /data-domain="real"/)
    assert.match(html, /id="statistics"/)
    assert.match(html, /id="history"/)
    assert.doesNotMatch(html, /contentHash|evidenceHash|providerPlayerId/)
  })
}

test("approved real-club contract covers four promoted players and leaves review players empty", () => {
  const approved = new Map([
    ["Rodri", "Barcelona"], ["Konaté", "Real Madrid"], ["Cucurella", "Real Madrid"], ["Bernardo Silva", "Real Madrid"],
  ])
  for (const [name, club] of approved) assert.equal(realProfile(name, club).approvedCurrentClub?.name, club)
  for (const name of ["Salah", "Enzo Fernández"]) assert.equal(realProfile(name, null).approvedCurrentClub, null)
})

test("real-life page and metadata preserve the localized 404 contract", async () => {
  const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/vida-real/page")>("app/[locale]/jogadores/[slug]/vida-real/page.tsx", {
    "next/navigation": { notFound: (): never => { throw new Error("NOT_FOUND") } },
    "../../../../../services/playerRealLifeService": { getPlayerRealLifeBySlug: async () => null },
    "../../../../components/PlayerRealLifeHeader": marker("UNREACHABLE"),
  })
  await assert.rejects(page.default({ params: Promise.resolve({ locale: "en", slug: "missing" }) }), /NOT_FOUND/)
  const metadata = await page.generateMetadata({ params: Promise.resolve({ locale: "pt", slug: "missing" }) })
  assert.deepEqual(metadata.robots, { index: false, follow: true })
  assert.match(String(metadata.alternates?.canonical), /\/pt\/jogadores\/missing\/vida-real$/)
})

test("profile CSS keeps two-column mobile-safe navigation without text effects", () => {
  const css = readFileSync("app/globals.css", "utf8")
  assert.match(css, /\.playerExperienceNav\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.playerExperienceNav\s*\{[^}]*minmax\(0, 1fr\)/)
  assert.doesNotMatch(css, /\.playerExperienceNav[^}]*text-shadow/)
})
