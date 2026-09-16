import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { displayCareerCount } from "../../../lib/i18n/playerHistory"
import type { PlayerHistoryData } from "../../../types/playerHistory"

const { default: History } = loadCatalogModule<typeof import("../../../app/components/PlayerHistory")>("app/components/PlayerHistory.tsx", {})
const { default: Statistics } = loadCatalogModule<typeof import("../../../app/components/PlayerCurrentStatistics")>("app/components/PlayerCurrentStatistics.tsx", {})
const path = "app/[locale]/jogadores/[slug]/historico/page.tsx"
const profile = { status: "complete" as const, player: mapDatabasePlayer(catalogPlayer()) }
function loadHistory(value: unknown) {
  return loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/historico/page")>(path, {
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND") } },
    "../../../../../services/playerService": { getPlayerBySlug: async () => value },
  })
}

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: history route has breadcrumb, return link and six honest empty sections`, async () => {
    const html = renderToStaticMarkup(await loadHistory(profile).default({ params: Promise.resolve({ locale, slug: "fixture" }) }))
    for (const section of ["summary", "seasons", "transfers", "clubs", "trophies", "international"]) assert.match(html, new RegExp(`id="career-${section}-title"`))
    assert.ok(html.includes(`href="/${locale}/jogadores/fixture"`))
    assert.ok(html.includes(locale === "pt" ? "← Voltar ao perfil" : "← Back to profile"))
    assert.match(html, /aria-current="page"/)
    assert.doesNotMatch(html, /<dd>0<\/dd>|undefined|NaN|contentHash|providerPlayerId|logicalEventKey/)
    assert.ok(html.includes(locale === "pt" ? "Nacionalidade não confirma" : "Nationality does not confirm"))
  })

  test(`${locale}: profile preserves scout sections and statistics, without full history`, async () => {
    const marker = (label: string) => function SectionMarker() { return createElement("p", {}, label) }
    const { default: Page } = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND") } },
      "../../../../services/playerService": { getPlayerBySlug: async () => profile },
      "../../../components/PlayerHeader": marker("HEADER_PRESERVED"), "../../../components/PlayerActions": marker("ACTIONS_PRESERVED"),
      "../../../components/PlayerQuickProfile": marker("QUICK_PRESERVED"), "../../../components/PlayerPositions": marker("POSITIONS_PRESERVED"),
      "../../../components/PlayerAttributes": marker("ATTRIBUTES_PRESERVED"), "../../../components/PlayerPlayStyles": marker("PLAYSTYLES_PRESERVED"),
      "../../../components/ScoutAnalysis": marker("ANALYSIS_PRESERVED"),
    })
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, slug: "fixture" }) }))
    for (const label of ["HEADER", "ACTIONS", "QUICK", "POSITIONS", "ATTRIBUTES", "PLAYSTYLES", "ANALYSIS"]) assert.ok(html.includes(`${label}_PRESERVED`))
    assert.match(html, /id="statistics"[^>]*data-domain="real"/)
    assert.ok(html.includes(locale === "pt" ? "Estatísticas ainda não disponíveis" : "Statistics are not yet available"))
    assert.ok(html.includes(locale === "pt" ? "Ver histórico completo →" : "View full history →"))
    assert.ok(html.includes(`href="/${locale}/jogadores/fixture/historico"`))
    assert.doesNotMatch(html, /transferTimeline|career-seasons-title|href="#history"/)
  })

  test(`${locale}: prepared history renders supplied seasons, raw transfer fee, clubs, trophies and international stats`, () => {
    const data: PlayerHistoryData = { source: "verified fixture", seasons: [{ season: "2025/26", club: "Fixture A", competition: "Fixture Cup", appearances: 12, goals: 0, assists: 2, minutes: 600 }],
      transfers: [{ date: "2025-07-01", from: "Fixture A", to: "Fixture B", typeRaw: "€18M" }],
      clubs: [{ name: "Fixture A", from: "2023-07-01", until: null }],
      trophies: [{ competition: "Fixture Cup", season: "2024/25", team: "Fixture A" }],
      international: [{ team: "Fixture National Team", period: "2024", appearances: 3, goals: 0 }] }
    const html = renderToStaticMarkup(createElement(History, { locale, data }))
    for (const value of ["2025/26", "Fixture Cup", "Fixture A → Fixture B", "€18M", "2024/25", "Fixture National Team"]) assert.ok(html.includes(value))
    assert.match(html, /<dd>0<\/dd>/)
    // Partial season data must never become totals for the whole career.
    assert.match(html, /career-summary-title[\s\S]*?<dd>—<\/dd>/)
    assert.ok(html.includes(locale === "pt" ? "não representam salário nem valor de mercado" : "neither salary nor current market value"))
  })
}

test("missing source blocks every prepared history dataset and operational metadata is never rendered", () => {
  const data = { source: " ", summary: { goals: 99 }, seasons: [{ season: "SECRET", club: "SECRET", competition: "SECRET" }],
    transfers: [{ date: "2025-01-01", from: "SECRET", to: "SECRET", typeRaw: "SECRET" }],
    clubs: [{ name: "SECRET", from: null, until: null }], trophies: [{ competition: "SECRET", season: "SECRET", team: "SECRET" }],
    international: [{ team: "SECRET", period: null }], contentHash: "OPERATIONAL_SECRET" }
  const html = renderToStaticMarkup(createElement(History, { locale: "en", data }))
  assert.doesNotMatch(html, /SECRET|>99</)
  const sourced = renderToStaticMarkup(createElement(History, { locale: "en", data: { ...data, source: "fixture", seasons: [], transfers: [], clubs: [], trophies: [], international: [] } }))
  assert.doesNotMatch(sourced, /OPERATIONAL_SECRET|contentHash/)
})

test("current stats require source and period/competition, keep zero and reject invalid counts", () => {
  const data = { source: "fixture", period: "2026", competition: "Fixture Cup", appearances: 0, goals: 2, minutes: 0, assists: null, starts: -1 }
  const html = renderToStaticMarkup(createElement(Statistics, { locale: "en", data }))
  assert.match(html, /2026 · Fixture Cup/)
  assert.match(html, /Appearances<\/dt><dd>0/)
  assert.match(html, /Assists<\/dt><dd>—/)
  assert.match(html, /Starts<\/dt><dd>—/)
  for (const invalid of [{ ...data, source: "" }, { ...data, period: "" }, { ...data, competition: "" }]) {
    const markup = renderToStaticMarkup(createElement(Statistics, { locale: "pt", data: invalid }))
    assert.doesNotMatch(markup, /<dd>0<\/dd>|<dd>2<\/dd>/)
  }
  for (const value of [null, undefined, NaN, Infinity, -1, 1.5]) assert.equal(displayCareerCount(value), "—")
})

test("history route returns not-found for missing players and supports incomplete EA profiles", async () => {
  await assert.rejects(loadHistory(null).default({ params: Promise.resolve({ locale: "en", slug: "missing" }) }), /NOT_FOUND/)
  const html = renderToStaticMarkup(await loadHistory({ status: "incomplete", name: "Incomplete fixture" }).default({ params: Promise.resolve({ locale: "pt", slug: "incomplete" }) }))
  assert.match(html, /Incomplete fixture/)
  assert.match(html, /career-seasons-title/)
  const metadata = await loadHistory(null).generateMetadata({ params: Promise.resolve({ locale: "en", slug: "missing" }) })
  assert.deepEqual(metadata.robots, { index: false, follow: true })
})

test("history metadata follows existing localized URL convention without exposing observations", async () => {
  const metadata = await loadHistory(profile).generateMetadata({ params: Promise.resolve({ locale: "en", slug: "fixture" }) })
  assert.match(String(metadata.alternates?.canonical), /\/en\/jogadores\/fixture\/historico$/)
  const source = readFileSync(path, "utf8")
  assert.doesNotMatch(source, /from ["'][^"']*(?:transferObservation|currentClub|prisma|provider)/i)
  assert.doesNotMatch(source, /fetch\(|writeTransfer|\.create\(|\.update\(/)
})
