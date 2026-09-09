import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, type ReactNode } from "react"
import { getSiteUrl } from "../../../lib/siteUrl"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

test("public origin accepts HTTPS and local smoke, never credential-bearing or ambiguous URLs", () => {
  assert.equal(getSiteUrl("https://beta.example.org/"), "https://beta.example.org")
  assert.equal(getSiteUrl("http://localhost:3100"), "http://localhost:3100")
  for (const value of ["http://example.org", "https://user:private@example.org", "https://example.org/path", "https://example.org?secret=value", "https://example.org/#fragment", "not-a-url"]) {
    assert.throws(() => getSiteUrl(value), (error: unknown) => error instanceof Error &&
      error.message.startsWith("SITE_URL") && !error.message.includes(value))
  }
})

test("sitemap contains only the localized indexable entry routes and uses the configured origin", () => {
  const { default: sitemap } = loadCatalogModule<typeof import("../../../app/sitemap")>("app/sitemap.ts", {
    "../lib/siteUrl": { getSiteUrl: () => "https://beta.example.org" },
  })
  assert.deepEqual(Array.from(sitemap(), (entry) => entry.url),
    ["pt", "en"].flatMap((locale) => ["", "/jogadores", "/clubes", "/ligas"].map((path) => `https://beta.example.org/${locale}${path}`)))
})

test("robots permits public crawling and points to the minimal sitemap", () => {
  const { default: robots } = loadCatalogModule<typeof import("../../../app/robots")>("app/robots.ts", {
    "../lib/siteUrl": { getSiteUrl: () => "https://beta.example.org" },
  })
  const result = robots()
  assert.equal(result.sitemap, "https://beta.example.org/sitemap.xml")
  assert.equal(JSON.stringify(result.rules), JSON.stringify({ userAgent: "*", allow: "/" }))
})

test("Home waits for a request before any catalog read", async () => {
  const events: string[] = []
  const { default: Home } = loadCatalogModule<typeof import("../../../app/[locale]/page")>("app/[locale]/page.tsx", {
    "next/server": { connection: async () => { events.push("request") } },
    "next/link": ({ children }: { children: ReactNode }) => createElement("span", null, children),
    "../../services/playerService": { getFeaturedPlayers: async () => { events.push("database"); return [] } },
    "../components/HomeSearch": () => null, "../components/PlayerCard": () => null,
  })
  assert.deepEqual(events, [])
  await Home()
  assert.deepEqual(events, ["request", "database"])
})

test("global metadata and language are honest and fonts require no external module", async () => {
  const layout = loadCatalogModule<typeof import("../../../app/[locale]/layout")>("app/[locale]/layout.tsx", {
    "../globals.css": {}, "next/server": { connection: async () => {} }, "next/navigation": { redirect: () => { throw new Error("unexpected redirect") } }, "../components/SiteNav": () => null,
  })
  const props = { children: null, params: Promise.resolve({ locale: "pt" }) }
  const metadata = await layout.generateMetadata(props)
  assert.equal(JSON.stringify(metadata.title), JSON.stringify({ default: "FutScout — Career Mode", template: "%s | FutScout" }))
  assert.equal((await layout.default(props)).props.lang, "pt-BR")
  assert.equal(metadata.description, "Explore jogadores, clubes e ligas para planejar seu Modo Carreira.")
})
