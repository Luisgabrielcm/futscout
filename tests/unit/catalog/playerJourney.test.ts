import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import Form from "next/form"
import Link from "next/link"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer, type PlayerProfile } from "../../../mappers/mapDatabasePlayer"
import { playerCatalogContext, playerCatalogReturnHref, playerProfileHref } from "../../../lib/connectedNavigation"
import { parsePlayerCatalogParams, playerCatalogQuery, type CatalogSearchParams } from "../../../lib/playerCatalogParams"
import type { Locale } from "../../../lib/i18n"
import { formatCurrency } from "../../../utils/formatCurrency"

const player = mapDatabasePlayer(catalogPlayer({ slug: "synthetic-player", name: "Synthetic Player" }))
const applied = { search: "João & synthetic", position: "VOL", minPace: "80", sort: "value-asc", page: "3" }
const context = playerCatalogQuery(applied)
const decode = (value: string) => value.replaceAll("&amp;", "&")
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => decode(match[1]))
const marker = () => null

type ControlProps = {
  children?: React.ReactNode; id?: string; className?: string; type?: string; "aria-label"?: string
  onChange?: (event: { target: { value: string } }) => void
  onKeyDown?: (event: { key: string }) => void
  onClick?: () => void
}
function controls(node: React.ReactNode): React.ReactElement<ControlProps>[] {
  if (Array.isArray(node)) return node.flatMap(controls)
  if (!React.isValidElement<ControlProps>(node)) return []
  return [node, ...controls(node.props.children)]
}

// Exercise the existing handlers with persistent state across rerenders. This
// is a UI integration harness, not a DOM/browser or a real database simulation.
function searchControls(locale: Locale, url: URL) {
  const navigations: string[] = []
  const state: unknown[] = []
  let cursor = 0
  const { default: Search } = loadCatalogModule<typeof import("../../../app/components/PlayersSearch")>("app/components/PlayersSearch.tsx", {
    react: { ...React,
      useState: (initial: unknown) => {
        const index = cursor++
        if (index >= state.length) state[index] = initial
        return [state[index], (next: unknown) => {
          state[index] = typeof next === "function" ? (next as (previous: unknown) => unknown)(state[index]) : next
        }]
      },
      useTransition: () => [false, (callback: () => void) => callback()],
    },
    "next/navigation": { usePathname: () => url.pathname, useRouter: () => ({ push: (href: string) => navigations.push(href) }) },
    "./PlayerCard": marker,
  })
  function render() {
    cursor = 0
    return Search({ locale, players: [], leagues: [], initialSearch: url.searchParams.get("search") ?? "",
      initialPosition: url.searchParams.get("position") ?? "", initialMinOverall: url.searchParams.get("minOverall") ?? "" })
  }
  function find(predicate: (node: React.ReactElement<ControlProps>) => boolean) {
    const node = controls(render()).find(predicate)
    assert.ok(node)
    return node
  }
  return { render, navigations,
    change: (id: string, value: string) => {
      const node = find(node => node.props.id === id)
      assert.ok(node.props.onChange)
      node.props.onChange({ target: { value } })
    },
    submit: () => {
      const input = find(node => node.type === "input" && Boolean(node.props["aria-label"]))
      assert.ok(input.props.onKeyDown)
      input.props.onKeyDown({ key: "Enter" })
    },
    clear: () => {
      const button = find(node => node.props.className?.split(" ").includes("clearFiltersButton") ?? false)
      assert.ok(button.props.onClick)
      button.props.onClick()
    },
  }
}

async function home(locale: Locale) {
  const { default: Search } = loadCatalogModule<typeof import("../../../app/components/HomeSearch")>("app/components/HomeSearch.tsx", {
    "next/form": Form, "next/link": Link,
  })
  const page = loadCatalogModule<typeof import("../../../app/[locale]/page")>("app/[locale]/page.tsx", {
    "next/server": { connection: async () => {} },
    "../../services/playerService": { getFeaturedPlayers: async () => [] },
    "../components/HomeSearch": Search, "../components/PlayerCard": marker,
  })
  return renderToStaticMarkup(await page.default({ params: Promise.resolve({ locale }) }))
}

function profilePage(profile: PlayerProfile = { status: "ready", player }) {
  return loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
    "next/navigation": { notFound: (): never => { throw Error("NOT_FOUND") } },
    "../../../../services/playerService": { getPlayerBySlug: async () => profile },
    ...Object.fromEntries(["PlayerActions", "PlayerHeader", "PlayerQuickProfile", "PlayerPositions", "PlayerAttributes",
      "PlayerGoalkeeperAttributes", "PlayerPlayStyles", "ScoutAnalysis", "GoalkeeperScoutAnalysis"].map(name => [`../../../components/${name}`, marker])),
  })
}

async function listing(locale: Locale, input: CatalogSearchParams = applied, rows = [player]) {
  const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
    "./PlayerActions": marker, "../../utils/formatCurrency": { formatCurrency },
  })
  let stateIndex = 0
  const { default: Search } = loadCatalogModule<typeof import("../../../app/components/PlayersSearch")>("app/components/PlayersSearch.tsx", {
    react: { ...React, useState: (value: unknown) => [stateIndex++ === 0 ? "unsaved draft" : value, () => {}],
      useTransition: () => [false, () => {}] },
    "next/navigation": { usePathname: () => `/${locale}/jogadores`, useRouter: () => ({ push: marker }) },
    "./PlayerCard": Card,
  })
  const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/page")>("app/[locale]/jogadores/page.tsx", {
    react: React,
    "../../../services/playerService": { getLeagues: async () => [], getPlayers: async (filters: Record<string, unknown>) => {
      const expected = parsePlayerCatalogParams(input)
      // Verify all URL filters reach the service boundary, not only the cards.
      for (const [key, value] of Object.entries(expected)) assert.equal(filters[key], value, key)
      return { players: rows, total: rows.length ? 49 : 0, page: expected.page, totalPages: rows.length ? 3 : 1 }
    } },
    "../../components/PlayersSearch": Search,
  })
  const shell = await page.default({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(input) })
  const child = shell.props.children as React.ReactElement<{ locale: Locale; searchParams: Promise<CatalogSearchParams> }>
  const Results = child.type as (props: typeof child.props) => Promise<React.ReactNode>
  return renderToStaticMarkup(await Results(child.props))
}

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: visitor submits home search, applies filters by Enter, paginates, consults a profile and returns`, async () => {
    const landing = await home(locale)
    const form = landing.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0]
    assert.ok(form)
    const action = form.match(/action="([^"]+)"/)?.[1]
    const field = form.match(/<input[^>]*name="([^"]+)"/)?.[1]
    assert.ok(action && field)
    const destination: URL = new URL(decode(action), "https://example.invalid")
    destination.search = new URLSearchParams({ [field]: `  ${player.name}  ` }).toString()
    assert.equal(destination.pathname, `/${locale}/jogadores`)
    const filter = searchControls(locale, destination)
    filter.change("position", "MC")
    filter.change("minOverall", "70")
    filter.submit()
    assert.equal(filter.navigations.length, 1)
    const filtered = new URL(filter.navigations[0], destination)
    assert.equal(filtered.searchParams.get("search"), player.name)
    assert.equal(filtered.searchParams.get("position"), "MC")
    assert.equal(filtered.searchParams.get("minOverall"), "70")
    assert.equal(filtered.searchParams.has("page"), false)
    const first = await listing(locale, Object.fromEntries(filtered.searchParams))
    const next = first.match(/<a\b[^>]*rel="next"[^>]*href="([^"]+)"/)?.[1]
    assert.ok(next)
    const second = new URL(decode(next), destination)
    assert.equal(second.searchParams.get("page"), "2")
    for (const [key, value] of filtered.searchParams) assert.equal(second.searchParams.get(key), value)
    const results = await listing(locale, Object.fromEntries(second.searchParams))
    const card = results.match(/<a\b[^>]*class="playerCardLink"[^>]*>/)?.[0]
    assert.ok(card)
    const profile = new URL(hrefs(card)[0], destination)
    const detail = renderToStaticMarkup(await profilePage().default({
      params: Promise.resolve({ locale, slug: player.slug }),
      searchParams: Promise.resolve(Object.fromEntries(profile.searchParams)),
    }))
    const back = new URL(hrefs(detail)[0], destination)
    assert.equal(back.pathname, second.pathname)
    assert.deepEqual([...back.searchParams], [...second.searchParams])
    const returned = await listing(locale, Object.fromEntries(back.searchParams))
    assert.match(returned, /Synthetic Player/)
    assert.match(returned, locale === "pt" ? /Página 2 de 3/ : /Page 2 of 3/)
  })

  test(`${locale}: empty results retain a working clear-filters path back to the catalog`, async () => {
    const url = new URL(`https://example.invalid/${locale}/jogadores?search=No+synthetic+match&position=MC&minOverall=99&page=2`)
    const empty = await listing(locale, Object.fromEntries(url.searchParams), [])
    assert.match(empty, locale === "pt" ? /Nenhum jogador encontrado/ : /No players found/)
    assert.doesNotMatch(empty, /class="playerCardLink"/)
    const filter = searchControls(locale, url)
    filter.clear()
    assert.equal(filter.navigations[0], `/${locale}/jogadores`)
    const recovered = await listing(locale, {})
    assert.match(recovered, /class="playerCardLink"/)
    assert.match(recovered, /Synthetic Player/)
  })

  test(`${locale}: catalog card → EA profile → real life → original results retains applied search, filters, sort and page`, async () => {
    const html = await listing(locale)
    assert.match(html, /unsaved draft/)
    const card = html.match(/<a\b[^>]*class="playerCardLink"[^>]*>/)?.[0]
    assert.ok(card)
    const cardUrl = new URL(hrefs(card)[0], "https://example.invalid")
    assert.equal(cardUrl.pathname, `/${locale}/jogadores/synthetic-player`)
    assert.equal(cardUrl.searchParams.get("catalog"), context)
    assert.doesNotMatch(cardUrl.href, /unsaved/)

    const params = Promise.resolve({ locale, slug: player.slug })
    const searchParams = Promise.resolve({ catalog: cardUrl.searchParams.get("catalog")! })
    const ea = renderToStaticMarkup(await profilePage().default({ params, searchParams }))
    const back = hrefs(ea)[0]
    assert.equal(back, `/${locale}/jogadores?${context}`)
    assert.match(ea, locale === "pt" ? /Voltar aos resultados/ : /Back to results/)
    const realLink = hrefs(ea).find(href => href.includes("/vida-real?"))
    assert.ok(realLink)
    const realUrl = new URL(realLink, "https://example.invalid")
    const real = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/vida-real/page")>("app/[locale]/jogadores/[slug]/vida-real/page.tsx", {
      "next/navigation": { notFound: (): never => { throw Error("NOT_FOUND") } },
      "../../../../../services/playerRealLifeService": { getPlayerRealLifeBySlug: async () => ({
        id: player.id, slug: player.slug, name: player.name, imageUrl: null, nationality: null,
        approvedCurrentClub: null, eaCatalogClub: null,
      }) },
      "../../../../components/PlayerRealLifeHeader": marker,
    })
    const realHtml = renderToStaticMarkup(await real.default({ params, searchParams: Promise.resolve({ catalog: realUrl.searchParams.get("catalog")! }) }))
    assert.equal(hrefs(realHtml)[0], back)
    assert.equal(hrefs(realHtml)[1], cardUrl.pathname + cardUrl.search)
    assert.ok(hrefs(realHtml).includes(cardUrl.pathname + cardUrl.search))
    assert.match(realHtml, /aria-current="page"/)
  })

  test(`${locale}: incomplete profiles also retain the result context and public canonical stays query-free`, async () => {
    const page = profilePage({ status: "incomplete", name: player.name })
    const props = { params: Promise.resolve({ locale, slug: player.slug }), searchParams: Promise.resolve({ catalog: context }) }
    const html = renderToStaticMarkup(await page.default(props))
    assert.equal(hrefs(html)[0], `/${locale}/jogadores?${context}`)
    assert.ok(hrefs(html).some(href => href.includes("/vida-real?catalog=")))
    const metadata = await page.generateMetadata(props)
    assert.equal(new URL(String(metadata.alternates?.canonical)).pathname, `/${locale}/jogadores/${player.slug}`)
    assert.equal(new URL(String(metadata.alternates?.canonical)).search, "")
  })

  test(`${locale}: direct and malformed-context visits retain the ordinary catalog fallback`, async () => {
    for (const catalog of [undefined, "https://example.invalid/external", "//example.invalid", "javascript:alert(1)", "x".repeat(4001)]) {
      const html = renderToStaticMarkup(await profilePage().default({
        params: Promise.resolve({ locale, slug: player.slug }), searchParams: Promise.resolve({ catalog }),
      }))
      assert.equal(hrefs(html)[0], `/${locale}/jogadores`)
      assert.ok(hrefs(html).includes(`/${locale}/jogadores/${player.slug}/vida-real`))
      assert.doesNotMatch(html, /catalog=|javascript:|example.invalid/)
    }
  })
}

test("navigation context reuses catalog validation, drops unknown keys and never accepts a return URL", () => {
  const query = "search=A%26B&page=2&page=9&minOverall=999&sort=name-asc&redirect=https://example.invalid&catalog=nested"
  assert.equal(playerCatalogContext(query), "search=A%26B&page=2&sort=name-asc")
  assert.equal(playerCatalogContext([query, "search=second"]), playerCatalogContext(query))
  assert.equal(playerCatalogReturnHref("en", query), "/en/jogadores?search=A%26B&page=2&sort=name-asc")
  assert.match(playerProfileHref("pt", "synthetic/name", query), /^\/pt\/jogadores\/synthetic%2Fname\?catalog=/)
  for (const value of [null, 12, {}, [undefined], "page=-1&sort=bad"]) assert.equal(playerCatalogContext(value), "")
})
