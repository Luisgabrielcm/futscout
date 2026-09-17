import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { displayCareerCount } from "../../../lib/i18n/playerHistory"
import type { PlayerHistoryData } from "../../../types/playerHistory"

const { default: History } = loadCatalogModule<typeof import("../../../app/components/PlayerHistory")>("app/components/PlayerHistory.tsx", {})
const { default: Statistics } = loadCatalogModule<typeof import("../../../app/components/PlayerCurrentStatistics")>("app/components/PlayerCurrentStatistics.tsx", {})

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: real-life history keeps six honest empty sections`, () => {
    const html = renderToStaticMarkup(createElement(History, { locale }))
    for (const section of ["summary", "seasons", "transfers", "clubs", "trophies", "international"]) assert.match(html, new RegExp(`id="career-${section}-title"`))
    assert.doesNotMatch(html, /<dd>0<\/dd>|undefined|NaN|contentHash|providerPlayerId|logicalEventKey/)
    assert.ok(html.includes(locale === "pt" ? "Nacionalidade não confirma" : "Nationality does not confirm"))
  })

  test(`${locale}: verified history and real statistics render only supplied public data`, () => {
    const data: PlayerHistoryData = {
      source: "verified fixture",
      seasons: [{ season: "2025/26", club: "Fixture A", competition: "Fixture Cup", appearances: 12, goals: 0, assists: 2, minutes: 600 }],
      transfers: [{ date: "2025-07-01", from: "Fixture A", to: "Fixture B", typeRaw: "€18M" }],
      clubs: [{ name: "Fixture A", from: "2023-07-01", until: null }],
      trophies: [{ competition: "Fixture Cup", season: "2024/25", team: "Fixture A" }],
      international: [{ team: "Fixture National Team", period: "2024", appearances: 3, goals: 0 }],
    }
    const html = renderToStaticMarkup(createElement(History, { locale, data }))
    for (const value of ["2025/26", "Fixture Cup", "Fixture A → Fixture B", "€18M", "2024/25", "Fixture National Team"]) assert.ok(html.includes(value))
    assert.match(html, /<dd>0<\/dd>/)
    assert.match(html, /career-summary-title[\s\S]*?<dd>—<\/dd>/)
    const statistics = renderToStaticMarkup(createElement(Statistics, { locale, data: {
      source: "verified fixture", period: "2025/26", competition: "Fixture League", appearances: 2, starts: 0, goals: 0,
    } }))
    assert.match(statistics, /2025\/26 · Fixture League/)
    assert.match(statistics, /<dd>0<\/dd>/)
  })
}

test("missing provenance blocks prepared history data and missing counts remain unknown", () => {
  const html = renderToStaticMarkup(createElement(History, { locale: "en", data: {
    source: " ", summary: { goals: 99 }, transfers: [{ date: "2025-01-01", from: "SECRET", to: "SECRET", typeRaw: "SECRET" }],
  } }))
  assert.doesNotMatch(html, /SECRET|99/)
  for (const value of [null, undefined, NaN, Infinity, -1, 1.5]) assert.equal(displayCareerCount(value), "—")
})

test("legacy history route redirects to the single localized real-life experience", async () => {
  const targets: string[] = []
  const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/historico/page")>(
    "app/[locale]/jogadores/[slug]/historico/page.tsx",
    { "next/navigation": { redirect: (href: string): never => { targets.push(href); throw new Error("REDIRECT") } } },
  )
  await assert.rejects(page.default({ params: Promise.resolve({ locale: "pt", slug: "fixture" }) }), /REDIRECT/)
  await assert.rejects(page.default({ params: Promise.resolve({ locale: "en", slug: "fixture" }) }), /REDIRECT/)
  assert.deepEqual(targets, ["/pt/jogadores/fixture/vida-real", "/en/jogadores/fixture/vida-real"])
})
