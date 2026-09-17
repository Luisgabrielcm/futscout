import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { filterNationalities, popularNationalities, ALPHABET_BUCKETS } from "../../../lib/nationalityDirectory"
import { displaySalary, displayCareerDate } from "../../../lib/playerCareerPresentation"
import { displayPosition } from "../../../lib/i18n/presentation"
import { getVisualAssetSrc } from "../../../lib/visualAssets"
import { playerCatalogQuery } from "../../../lib/playerCatalogParams"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { formatCurrency } from "../../../utils/formatCurrency"
import * as directoryParams from "../../../lib/directoryCatalogParams"
import { countryNames } from "../../../lib/i18n/countryNames"
import { displayNationality } from "../../../lib/i18n/countries"

const load = <T,>(file: string, dependencies: Record<string, unknown> = {}) => loadCatalogModule<T>(`app/components/${file}.tsx`, { react: React, ...dependencies })
const { default: Pagination } = load<typeof import("../../../app/components/CatalogPagination")>("CatalogPagination")
const { default: Countries } = load<typeof import("../../../app/components/NationalityDirectory")>("NationalityDirectory")
const { default: Career } = load<typeof import("../../../app/components/PlayerCareer")>("PlayerCareer")
const { default: History } = load<typeof import("../../../app/components/PlayerHistory")>("PlayerHistory")
const { default: Card } = load<typeof import("../../../app/components/PlayerCard")>("PlayerCard", {
  "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
})
const { LeagueCard, DirectorySearch } = load<typeof import("../../../app/components/DirectoryCatalog")>("DirectoryCatalog", {
  "./PlayerCard": Card, "../../lib/directoryCatalogParams": directoryParams,
})
const countries = [
  { slug: "fr", name: "France", total: 30 }, { slug: "br", name: "Brazil", total: 40 },
  { slug: "de", name: "Germany", total: 30 }, { slug: "ar", name: "Argentina", total: 20 },
]

test("SSR/client nationality labels cover existing codes without runtime ICU differences", () => {
  const source = readFileSync("lib/countryFlags.ts", "utf8")
  const codes = [...source.matchAll(/code: "([A-Z]{2})"/g)].map(match => match[1])
  for (const code of codes) {
    assert.ok(countryNames[code]?.[0], `Missing PT label for ${code}`)
    assert.ok(countryNames[code]?.[1], `Missing EN label for ${code}`)
  }
  assert.equal(displayNationality("Hong Kong", "en"), "Hong Kong SAR China")
  assert.equal(displayNationality("Hong Kong", "pt"), "Hong Kong, RAE da China")
  assert.equal(displayNationality("Unknown fixture", "en"), "Unknown fixture")
  assert.doesNotMatch(readFileSync("lib/i18n/countries.ts", "utf8"), /Intl\.DisplayNames/)
  assert.doesNotMatch(readFileSync("lib/nationalityDirectory.ts", "utf8"), /localeCompare|Intl\.Collator/)
})

test("nationality search matches localized and canonical names, ignores case and accents", () => {
  for (const term of ["FRANÇA", "franca", "france"]) assert.equal(filterNationalities(countries, "pt", term, "all")[0]?.slug, "fr")
  assert.equal(filterNationalities(countries, "pt", "brasil", "all")[0]?.slug, "br")
  assert.equal(filterNationalities(countries, "en", "Germany", "all")[0]?.slug, "de")
})
test("alphabet ranges use localized names and intersect search", () => {
  assert.deepEqual(filterNationalities(countries, "pt", "Germany", "A–C").map(c => c.slug), ["de"])
  assert.equal(filterNationalities(countries, "en", "Germany", "A–C").length, 0)
  assert.equal(filterNationalities(countries, "pt", "France", "A–C").length, 0)
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(name => ({ slug: name, name: name + " fixture", total: 1 }))
  const selected = ALPHABET_BUCKETS.slice(1).flatMap(bucket => filterNationalities(alphabet, "en", "", bucket))
  assert.equal(selected.length, 26)
  assert.equal(new Set(selected.map(c => c.slug)).size, 26)
})
test("top ten is dynamic, descending, stable across input order and does not mutate input", () => {
  const entries = [...countries, ...Array.from({ length: 12 }, (_, i) => ({ slug: `x${i}`, name: `Fixture ${i}`, total: i }))]
  const before = structuredClone(entries)
  const top = popularNationalities(entries)
  assert.equal(top.length, 10)
  assert.deepEqual(top.slice(0, 4).map(c => c.slug), ["br", "de", "fr", "ar"])
  assert.deepEqual(top, popularNationalities([...entries].reverse()))
  assert.deepEqual(entries, before)
})
test("nationality directory has labelled local search, pressed buckets, count and empty state in both locales", () => {
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(React.createElement(Countries, { locale, countries: [] }))
    assert.match(html, /type="search"/)
    assert.match(html, /for="nationality-search"/)
    assert.match(html, /aria-pressed="true"/)
    assert.match(html, /role="status"/)
    assert.match(html, /disabled=""/)
    assert.ok(html.includes(locale === "pt" ? "Nenhum país encontrado" : "No countries found"))
  }
})
test("nationality interaction filters and clears without routing or fetch dependencies", () => {
  const state: unknown[] = ["", "all"]
  let slot = 0
  const { default: Stateful } = load<typeof import("../../../app/components/NationalityDirectory")>("NationalityDirectory", {
    react: { useState: () => { const current = slot++; return [state[current], (value: unknown) => { state[current] = value }] } },
  })
  const render = () => { slot = 0; return Stateful({ locale: "pt", countries }) }
  type Node = React.ReactElement<{ children?: React.ReactNode; onChange?: (e: { target: { value: string } }) => void; onClick?: () => void; type?: string; "aria-pressed"?: boolean }>
  function nodes(node: React.ReactNode): Node[] {
    if (!React.isValidElement(node)) return []
    const element = node as Node
    return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)]
  }
  nodes(render()).find(node => node.type === "input")!.props.onChange!({ target: { value: "zzzz" } })
  assert.match(renderToStaticMarkup(render()), /Nenhum país encontrado/)
  nodes(render()).find(node => node.type === "button" && node.props["aria-pressed"] === undefined)!.props.onClick!()
  assert.equal(state[0], "")
  assert.match(renderToStaticMarkup(render()), /4 países encontrados/)
  nodes(render()).find(node => node.type === "input")!.props.onChange!({ target: { value: "franca" } })
  assert.match(renderToStaticMarkup(render()), /1 país encontrado/)
})
test("pagination preserves filter queries, has navigation semantics and real disabled boundaries", () => {
  const href = (page: number) => `/en/jogadores?${playerCatalogQuery({ search: "Nome & Clube", position: "MC", page })}`
  const html = renderToStaticMarkup(React.createElement(Pagination, { locale: "en", page: 1, totalPages: 3, href, label: "Players pagination" }))
  assert.match(html, /<nav[^>]+aria-label="Players pagination"/)
  assert.match(html, /<span[^>]+aria-disabled="true"/)
  assert.match(html, /rel="next"/)
  assert.match(html, /search=Nome\+%26\+Clube/)
  assert.match(html, /position=MC/)
  assert.match(html, /page=2/)
  assert.match(html, /Page 1 of 3/)
  assert.match(html, /aria-current="page"/)
  assert.match(html, /paginationCompact/)
  const last = renderToStaticMarkup(React.createElement(Pagination, { locale: "pt", page: 3, totalPages: 3, href, label: "Paginação" }))
  assert.match(last, /rel="prev"/)
  assert.doesNotMatch(last, /rel="next"/)
})
test("pagination hides a single page and offers recovery for out-of-range pages", () => {
  const props = { href: (page: number) => `/pt/jogadores?page=${page}&position=MC`, label: "Paginação" }
  assert.equal(renderToStaticMarkup(React.createElement(Pagination, { ...props, page: 1, totalPages: 1 })), "")
  const html = renderToStaticMarkup(React.createElement(Pagination, { ...props, page: 9, totalPages: 2 }))
  assert.match(html, /Voltar à primeira página/)
  assert.match(html, /position=MC/)
})
test("shared search uses primary submit and secondary navigation reset", () => {
  const html = renderToStaticMarkup(React.createElement(DirectorySearch, { locale: "en", action: "/en/clubes", search: "Test" }))
  assert.match(html, /<button class="uiButton uiButtonPrimary" type="submit">Search/)
  assert.match(html, /<a[^>]+class="uiButton uiButtonSecondary"/)
  assert.match(html, /method="get"/)
})
test("card renders only real unique positions, localized labels and nationality, not national team", () => {
  const player = mapDatabasePlayer(catalogPlayer({ nationality: "Germany", position: "MC", secondaryPositions: ["MEI", "VOL"], secondaryPosition: "MEI" }))
  const html = renderToStaticMarkup(React.createElement(Card, { ...player, club: null, locale: "en" }))
  assert.match(html, />CM<\/span>/)
  assert.match(html, />CAM<\/span>/)
  assert.match(html, />CDM<\/span>/)
  assert.equal((html.match(/>CAM<\/span>/g) ?? []).length, 1)
  assert.match(html, /Nationality/)
  assert.match(html, /Germany/)
  assert.doesNotMatch(html, /National team|\/week|\/year/)
  assert.match(html, /Salary<\/span> <strong>—<\/strong>/)
  assert.equal(displayPosition("GOL", "en"), "GK")
  assert.equal(displayPosition("ZAG", "pt"), "ZAG")
  assert.equal(displayPosition("unknown", "en"), "unknown")
})
test("card consumes supplied Manchester City badge and preserves missing optional data", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  const html = renderToStaticMarkup(React.createElement(Card, { ...player, club: "Manchester City", clubImageUrl: "/clubs/manchester-city.svg", locale: "pt" }))
  assert.match(html, /src="\/clubs\/manchester-city.svg"/)
  assert.match(html, /width="24" height="24"/)
  assert.match(html, /Potencial/)
  assert.doesNotMatch(html, /Forma|OVR FUTSCOUT/)
  assert.match(html, /—/)
  const fallback = renderToStaticMarkup(React.createElement(Card, { ...player, club: "Manchester City", clubImageUrl: "/player-shields/123.png" }))
  assert.doesNotMatch(fallback, /src="\/player-shields/)
  assert.match(fallback, /Manchester City — imagem indisponível/)
})
test("salary is independent, sourced, finite and explicitly weekly or annual; missing is not estimated", () => {
  assert.equal(displaySalary(null, "pt"), null)
  const salary = { amount: 1000, currency: "EUR", period: "week" as const, source: "synthetic verified fixture" }
  assert.match(displaySalary(salary, "pt")!, /semana$/)
  assert.match(displaySalary({ ...salary, period: "year" }, "en")!, /year$/)
  assert.equal(displaySalary({ ...salary, source: "" }, "en"), null)
  assert.equal(displaySalary({ ...salary, amount: NaN }, "en"), null)
  assert.equal(displaySalary({ ...salary, amount: -1 }, "en"), null)
  assert.ok(displaySalary({ ...salary, amount: 0 }, "en"))
  const player = mapDatabasePlayer(catalogPlayer({ marketValue: BigInt(9000000) }))
  const html = renderToStaticMarkup(React.createElement(Card, { ...player, club: null, salary, locale: "en" }))
  assert.match(html, /Salary/)
  assert.match(html, /1,000/)
  assert.match(html, /week/)
})
test("career distinguishes catalog club from confirmed club and does not invent absent data", () => {
  const html = renderToStaticMarkup(React.createElement(Career, { locale: "en", catalogClub: "Catalog Fixture" }))
  assert.match(html, /EA FC catalog club/)
  assert.match(html, /Catalog Fixture/)
  assert.match(html, /Confirmed current club<\/dt><dd>—/)
  assert.match(html, /National team represented<\/dt><dd>—/)
  assert.match(html, /Salary<\/dt><dd>—/)
  assert.doesNotMatch(html, /href="#history"/)
  assert.doesNotMatch(html, /transferTimeline/)
})
test("prepared transfer presentation keeps raw fee separate and does not infer salary or market value", () => {
  const html = renderToStaticMarkup(React.createElement(History, { locale: "pt", data: { source: "fixture", transfers: [
    { date: "2026-01-03", from: "Fixture A", to: "Fixture B", typeRaw: "Free" },
  ] } }))
  assert.match(html, /Fixture A → Fixture B/)
  assert.match(html, />Free</)
  assert.match(html, /não representam salário nem valor de mercado/)
  assert.equal(displayCareerDate("2026-02-30", "en"), "—")
})
test("league logo is optional, never initials or a club/player asset", () => {
  const league = { name: "Fixture League", slug: "fixture", country: "England", _count: { clubs: 10 } }
  const missing = renderToStaticMarkup(React.createElement(LeagueCard, { league }))
  assert.match(missing, /Fixture League/)
  assert.doesNotMatch(missing, /<img|directoryBadge/)
  const withLogo = renderToStaticMarkup(React.createElement(LeagueCard, { league: { ...league, logoUrl: "/leagues/fixture.svg" } }))
  assert.match(withLogo, /src="\/leagues\/fixture.svg"/)
  for (const src of ["/players/1.png", "/player-portraits/1.png", "/player-shields/1.png", "/portraits/1.png"]) {
    assert.equal(getVisualAssetSrc(src, "club"), null)
    assert.equal(getVisualAssetSrc(src, "league"), null)
  }
  assert.equal(getVisualAssetSrc("/teams/1.png", "league"), null)
  assert.equal(getVisualAssetSrc("/leagues/1.png", "club"), null)
})
test("responsive contracts wrap secondary positions and offer focus, touch targets and compact pagination", () => {
  const css = readFileSync("app/globals.css", "utf8")
  assert.match(css, /\.cardPositions\s*\{[^}]*flex-wrap:\s*wrap/)
  assert.match(css, /\.playersPagination\s*\{[^}]*display:\s*grid/)
  assert.match(css, /\.uiButton:focus-visible/)
  assert.match(css, /\.uiButton:disabled/)
  assert.match(css, /\.paginationCompact/)
  assert.match(css, /min-height:\s*44px/)
})
