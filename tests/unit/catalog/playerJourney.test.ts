import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer, type PlayerProfile } from "../../../mappers/mapDatabasePlayer"
import { playerCatalogContext, playerCatalogReturnHref, playerProfileHref } from "../../../lib/connectedNavigation"
import { playerCatalogQuery, type CatalogSearchParams } from "../../../lib/playerCatalogParams"
import type { Locale } from "../../../lib/i18n"
import { formatCurrency } from "../../../utils/formatCurrency"

const player = mapDatabasePlayer(catalogPlayer({ slug: "synthetic-player", name: "Synthetic Player" }))
const applied = { search: "João & synthetic", position: "VOL", minPace: "80", sort: "value-asc", page: "3" }
const context = playerCatalogQuery(applied)
const decode = (value: string) => value.replaceAll("&amp;", "&")
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => decode(match[1]))
const marker = () => null

function profilePage(profile: PlayerProfile = { status: "ready", player }) {
  return loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
    "next/navigation": { notFound: (): never => { throw Error("NOT_FOUND") } },
    "../../../../services/playerService": { getPlayerBySlug: async () => profile },
    ...Object.fromEntries(["PlayerActions", "PlayerHeader", "PlayerQuickProfile", "PlayerPositions", "PlayerAttributes",
      "PlayerGoalkeeperAttributes", "PlayerPlayStyles", "ScoutAnalysis", "GoalkeeperScoutAnalysis"].map(name => [`../../../components/${name}`, marker])),
  })
}

async function listing(locale: Locale) {
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
      assert.equal(filters.search, applied.search)
      assert.equal(filters.page, 3)
      return { players: [player], total: 49, page: 3, totalPages: 3 }
    } },
    "../../components/PlayersSearch": Search,
  })
  const shell = await page.default({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(applied) })
  const child = shell.props.children as React.ReactElement<{ locale: Locale; searchParams: Promise<CatalogSearchParams> }>
  const Results = child.type as (props: typeof child.props) => Promise<React.ReactNode>
  return renderToStaticMarkup(await Results(child.props))
}

for (const locale of ["pt", "en"] as const) {
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
