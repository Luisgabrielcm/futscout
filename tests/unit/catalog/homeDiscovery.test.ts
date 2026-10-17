import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import Form from "next/form"
import Link from "next/link"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { parsePlayerCatalogParams } from "../../../lib/playerCatalogParams"

// Render the actual Next Form/Link, without a router, hydration or a database.
const { default: HomeSearch } = loadCatalogModule<typeof import("../../../app/components/HomeSearch")>("app/components/HomeSearch.tsx", {
  "next/form": Form, "next/link": Link,
})
const decode = (value: string) => value.replaceAll("&amp;", "&")

for (const locale of ["pt", "en"] as const) {
  const html = () => renderToStaticMarkup(HomeSearch({ locale }))

  test(`${locale}: home search emits a labeled GET form and named input before hydration`, () => {
    const rendered = html()
    const form = rendered.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0]
    assert.ok(form)
    assert.match(form, new RegExp(`action="/${locale}/jogadores"`))
    assert.match(form, /role="search"/)
    assert.match(form, locale === "pt" ? /aria-label="Pesquisar jogador, clube ou nacionalidade"/ : /aria-label="Search player, club or nationality"/)
    assert.match(form, /<input[^>]*type="search"[^>]*name="search"/)
    assert.match(form, /maxLength="200"/)
    assert.match(form, /enterKeyHint="search"/)
    assert.match(form, /<button[^>]*type="submit"/)
    assert.match(form, locale === "pt" ? />Buscar<\/button>/ : />Search<\/button>/)
    // Native forms default to GET. No required field: an empty query opens the catalog.
    assert.doesNotMatch(form, /method="post"|required|type="hidden"|javascript:/i)
  })

  test(`${locale}: native query encoding reaches the existing catalog parser without injecting filters`, () => {
    const rendered = html()
    const action = rendered.match(/<form[^>]*action="([^"]+)"/)?.[1]
    const name = rendered.match(/<input[^>]*name="([^"]+)"/)?.[1]
    assert.ok(action && name)
    for (const query of ["  João Félix  ", "Paris Saint-Germain", "Côte d’Ivoire", "A&B + #? /", "x&minOverall=99", "", "   "]) {
      const destination: URL = new URL(decode(action), "https://example.invalid")
      destination.search = new URLSearchParams({ [name]: query }).toString()
      const parsed = parsePlayerCatalogParams(Object.fromEntries(destination.searchParams))
      assert.equal(destination.pathname, `/${locale}/jogadores`)
      assert.equal(parsed.search, query.trim() || undefined)
      assert.equal(parsed.minOverall, undefined)
      assert.equal(parsed.page, 1)
    }
  })

  test(`${locale}: all four discovery shortcuts are crawlable links with preserved filters and localized text`, () => {
    const anchors = [...html().matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    assert.equal(anchors.length, 4)
    const expected = [
      { position: "VOL", maxAge: 23, minPotential: 85 },
      { position: "PE", minPace: 90 },
      { position: "ZAG", maxValue: 20000000 },
      { position: "MEI", minPassing: 85, minDribbling: 85 },
    ]
    const labels = locale === "pt"
      ? ["Volante promissor", "Ponta rápido", "Zagueiro barato", "Meia criativo"]
      : ["Promising defensive midfielder", "Fast winger", "Affordable centre-back", "Creative midfielder"]
    anchors.forEach(([, href, label], index) => {
      const destination = new URL(decode(href), "https://example.invalid")
      assert.equal(destination.pathname, `/${locale}/jogadores`)
      const parsed = parsePlayerCatalogParams(Object.fromEntries(destination.searchParams))
      for (const [key, value] of Object.entries(expected[index])) assert.equal(parsed[key as keyof typeof parsed], value)
      assert.equal(parsed.page, 1)
      assert.equal(label, labels[index])
    })
  })
}
