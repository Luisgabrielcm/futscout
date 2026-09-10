import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { clubComponents, Flag } from "../../helpers/clubExperienceFixture"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"

function fixture(locale: "pt" | "en", missing = false) {
  const calls: unknown[] = [], signal = new Error("NOT_FOUND")
  const pageModule = loadCatalogModule<typeof import("../../../app/[locale]/selecoes/[slug]/page")>("app/[locale]/selecoes/[slug]/page.tsx", {
    "next/navigation": { notFound: () => { throw signal } },
    "../../../../services/countryService": { getCountry: async () => missing ? null : { slug: "es", name: "Spain", nationalities: ["Spain", "Espanha"], total: 48 },
      getCountryPlayers: async (...args: unknown[]) => { calls.push(args); return { players: [], page: 2, total: 48, totalPages: 3, pageSize: 24 } } },
    "../../../components/CountryFlag": Flag,
    "../../../components/ClubExperience": clubComponents,
    "../../../components/DirectoryCatalog": {
      DirectoryNav: () => null,
      DirectoryPagination: ({ href, label }: { href: (page: number) => string; label: string }) => createElement("a", { href: href(3) }, label),
    },
  })
  const props = (query: CatalogSearchParams = {}) => ({ params: Promise.resolve({ locale, slug: "es" }), searchParams: Promise.resolve(query) })
  const render = async (node: Promise<ReactNode>) => renderToStaticMarkup(await node)
  return { pageModule, props, calls, signal, render }
}
for (const locale of ["pt", "en"] as const) {
  test(`${locale}: missing nationality stops before player query`, async () => {
    const f = fixture(locale, true)
    await assert.rejects(f.pageModule.default(f.props()), error => error === f.signal)
    assert.equal(f.calls.length, 0)
  })
  test(`${locale}: nationality page has honest call-up disclaimer, localized links and retained sort/search`, async () => {
    const f = fixture(locale)
    const html = await f.render(f.pageModule.default(f.props({ search: "Name", sort: "potential-desc", page: "2" })))
    assert.match(html, locale === "pt" ? /Não representa uma convocação oficial/ : /not an official squad call-up/)
    assert.ok(html.includes(`href="/${locale}/selecoes"`))
    assert.ok(html.includes(`href="/${locale}/selecoes/es?search=Name&amp;page=3&amp;sort=potential-desc"`))
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), [["Spain", "Espanha"], { search: "Name", page: 2, sort: "potential-desc" }])
  })
}
