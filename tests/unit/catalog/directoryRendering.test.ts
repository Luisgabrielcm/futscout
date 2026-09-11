import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { createElement, type ReactNode, type ComponentType } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as directory from "../../../lib/directoryCatalogParams"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { formatCurrency } from "../../../utils/formatCurrency"
import type { CatalogSearchParams } from "../../../lib/playerCatalogParams"
import * as visualAssets from "../../../lib/visualAssets"
import { clubComponents } from "../../helpers/clubExperienceFixture"

const link = ({ children, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => {
  const attributes = { ...props }
  delete attributes.prefetch
  return createElement("a", attributes, children)
}
const { default: Image } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
  "app/components/PlayerImage.tsx", { react: React, "../../lib/visualAssets": visualAssets },
)
const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>(
  "app/components/PlayerCard.tsx", {
    "next/link": link, "./PlayerImage": Image, "../../utils/formatCurrency": { formatCurrency },
    "./PlayerActions": () => null,
  },
)
const components = loadCatalogModule<typeof import("../../../app/components/DirectoryCatalog")>(
  "app/components/DirectoryCatalog.tsx", {
    "next/link": link, "./PlayerImage": Image, "./PlayerCard": Card, "../../lib/directoryCatalogParams": directory,
  },
)

const club = { id: "club", name: "Clube Teste", slug: "clube-teste", imageUrl: null,
  league: { name: "Liga Teste", slug: "liga-teste" }, _count: { players: 1 } }
const league = { id: "league", name: "Liga Teste", slug: "liga-teste", country: "Não informado", _count: { clubs: 1 } }
const pagination = { page: 1, total: 0, totalPages: 1, pageSize: 24 }
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<CatalogSearchParams> }
type PageModule = {
  default: (props: Props) => Promise<ReactNode>
  generateMetadata: (props: Pick<Props, "params">) => Promise<{ title: string }>
}

function pageFixture(kind: "clubes" | "ligas", detail = false, missing = false, filled = false) {
  const signal = new Error("NOT_FOUND")
  const calls: { name: string; input: unknown }[] = []
  const record = (name: string, input: unknown) => { calls.push({ name, input }) }
  const clubs = { ...pagination, clubs: filled ? [club] : [] }
  const leagues = { ...pagination, leagues: filled ? [league] : [] }
  const players = { ...pagination, players: filled ? [mapDatabasePlayer(catalogPlayer())] : [] }
  const clubService = {
    getClubRoster: async () => { record("overview", {}); return filled ? [{ ...catalogPlayer(), imageUrl: null }] : [] },
    getClubRatings: async () => new Map([[club.id, { overall: null, goalkeeper: null, rated: 0, total: 1 }]]),
    getClubBySlug: async () => missing ? null : club,
    getClubs: async (input: unknown) => { record("clubs", input); return clubs },
    getClubPlayers: async (_id: string, input: unknown) => { record("clubPlayers", input); return players },
  }
  const leagueService = {
    getLeagueBySlug: async () => missing ? null : league,
    getLeagueCatalog: async (input: unknown) => { record("leagues", input); return leagues },
    getLeagueClubs: async (_slug: string, input: unknown) => { record("leagueClubs", input); return clubs },
    getLeaguePlayers: async (_slug: string, input: unknown) => { record("leaguePlayers", input); return players },
  }
  const prefix = detail ? "../../../../" : "../../../"
  const page = loadCatalogModule<PageModule>(`app/[locale]/${kind}/${detail ? "[slug]/" : ""}page.tsx`, {
    "next/link": link, "next/navigation": { notFound: () => { throw signal } },
    [prefix + "lib/directoryCatalogParams"]: directory,
    [prefix + "services/clubService"]: clubService,
    [prefix + "services/officialLineupService"]: { getLatestOfficialClubLineup: async () => null },
    [prefix + "services/leagueService"]: leagueService,
    [prefix + "services/playerService"]: { getLeagues: async () => [league], getPlayers: async (input: unknown) => { record("squad", input); return players } },
    "../../../components/ClubExperience": clubComponents,
    [detail ? "../../../components/DirectoryCatalog" : "../../components/DirectoryCatalog"]: components,
  })
  const props = (search: CatalogSearchParams = {}): Props => ({ params: Promise.resolve({ slug: "fixture" }), searchParams: Promise.resolve(search) })
  return { page, props, signal, calls, clubs, players }
}

for (const kind of ["clubes", "ligas"] as const) {
  test(`${kind}: missing slug stops before roster queries and has honest missing metadata`, async () => {
    const f = pageFixture(kind, true, true)
    await assert.rejects(f.page.default(f.props()), (error) => error === f.signal)
    const metadata = await f.page.generateMetadata(f.props())
    assert.equal(metadata.title, kind === "clubes" ? "Clube não encontrado" : "Liga não encontrada")
    assert.equal(f.calls.length, 0)
  })

  test(`${kind}: list renders empty state, GET search and safe invalid navigation`, async () => {
    const f = pageFixture(kind)
    const html = renderToStaticMarkup(await f.page.default(f.props({ page: "NaN", search: [" Teste ", "ignore"] })))
    assert.match(html, kind === "clubes" ? /Nenhum clube encontrado/ : /Nenhuma liga encontrada/)
    assert.match(html, /method="get"/)
    assert.match(html, /value="Teste"/)
    assert.equal((f.calls[0].input as { page: number }).page, 1)
    assert.match(html, /href="\/pt"/)
    assert.ok(html.includes(`href="/pt/${kind}"`))
    assert.doesNotMatch(html, /href="#"/)
  })

  test(`${kind}: detail empty roster and metadata use only actual entity fields`, async () => {
    const f = pageFixture(kind, true)
    const html = renderToStaticMarkup(await f.page.default(f.props()))
    assert.match(html, kind === "clubes" ? /Nenhum jogador encontrado/ : /Nenhum jogador com atributos disponíveis/)
    if (kind === "ligas") assert.match(html, /Nenhum clube encontrado/)
    assert.doesNotMatch(html, /Não informado|apiFootballId|Estádio|Títulos/)
    const metadata = await f.page.generateMetadata(f.props())
    assert.equal(metadata.title, kind === "clubes"
      ? "Clube Teste — jogadores e elenco" : "Liga Teste — clubes e jogadores")
  })

  test(`${kind}: lists and profiles expose real entity and player links`, async () => {
    const list = pageFixture(kind, false, false, true)
    const html = renderToStaticMarkup(await list.page.default(list.props()))
    assert.match(html, kind === "clubes" ? /href="\/pt\/clubes\/clube-teste"/ : /href="\/pt\/ligas\/liga-teste"/)
    const f = pageFixture(kind, true, false, true)
    const detail = renderToStaticMarkup(await f.page.default(f.props()))
    assert.match(detail, /href="\/pt\/jogadores\/fixture-player"/)
    assert.match(detail, kind === "clubes" ? /href="\/pt\/ligas\/liga-teste"/ : /href="\/pt\/clubes\/clube-teste"/)
  })
}

test("league's two paginations preserve each other and provide independent page recovery", async () => {
  const f = pageFixture("ligas", true)
  Object.assign(f.clubs, { page: 2, totalPages: 3 })
  Object.assign(f.players, { page: 3, totalPages: 5 })
  const html = renderToStaticMarkup(await f.page.default(f.props({ page: "3", clubsPage: "2" })))
  assert.match(html, /href="\/pt\/ligas\/liga-teste\?page=3&amp;clubsPage=3#clubes"/)
  assert.match(html, /href="\/pt\/ligas\/liga-teste\?page=4&amp;clubsPage=2#jogadores"/)
  Object.assign(f.clubs, { page: 999 })
  const recovery = renderToStaticMarkup(await f.page.default(f.props({ page: "3", clubsPage: "999" })))
  assert.match(recovery, /href="\/pt\/ligas\/liga-teste\?page=3#clubes"/)
})

test("club upcoming tabs do not query squad or overview, and invalid tabs fall back safely", async () => {
  const f = pageFixture("clubes", true)
  const html = renderToStaticMarkup(await f.page.default(f.props({ tab: "fixtures" })))
  assert.match(html, /Em breve/)
  assert.equal(f.calls.length, 0)
  await f.page.default(f.props({ tab: "invalid" }))
  assert.equal(f.calls[0].name, "overview")
})

test("club squad preserves sorting/search/page and avoids unopened overview queries", async () => {
  const f = pageFixture("clubes", true, false, true)
  Object.assign(f.players, { page: 2, totalPages: 3 })
  const html = renderToStaticMarkup(await f.page.default(f.props({ tab: "squad", sort: "potential-desc", search: "Player", page: "2" })))
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].name, "squad")
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].input)), { search: "Player", page: 2, sort: "potential-desc" })
  assert.match(html, /tab=squad&amp;search=Player&amp;page=3&amp;sort=potential-desc/)
})

test("league sorting persists in BOTH independent paginations", async () => {
  const f = pageFixture("ligas", true)
  Object.assign(f.clubs, { page: 2, totalPages: 3 })
  Object.assign(f.players, { page: 3, totalPages: 5 })
  const html = renderToStaticMarkup(await f.page.default(f.props({ page: "3", clubsPage: "2", sort: "best" })))
  assert.match(html, /page=3&amp;sort=best&amp;clubsPage=3#clubes/)
  assert.match(html, /page=4&amp;sort=best&amp;clubsPage=2#jogadores/)
})

test("league detail sanitizes both page parameters without applying list search to rosters", async () => {
  const f = pageFixture("ligas", true)
  await f.page.default(f.props({ page: "-1", clubsPage: "Infinity", search: "ignored" }))
  assert.deepEqual(f.calls.map(({ input }) => (input as { page: number }).page), [1, 1])
})

test("directory card uses existing image fallback and does not invent a league logo", () => {
  const clubHtml = renderToStaticMarkup(createElement(components.ClubCard, { club }))
  const leagueHtml = renderToStaticMarkup(createElement(components.LeagueCard, { league }))
  assert.match(clubHtml, /directoryBadgeFallback[^>]*>C<\/span>/)
  assert.match(leagueHtml, /directoryBadgeFallback[^>]*>L<\/span>/)
  assert.doesNotMatch(leagueHtml, /<img|Não informado/)
})

test("directory badge falls back after an image load error without retrying/proxying", () => {
  type ImageProps = Parameters<typeof Image>[0]
  let failed: string | null = null
  const { default: TestImage } = loadCatalogModule<{ default: ComponentType<ImageProps> }>(
    "app/components/PlayerImage.tsx", {
      react: { useState: () => [failed, (value: string | null) => { failed = value }] },
      "../../lib/visualAssets": visualAssets,
    },
  )
  const component = TestImage as (props: ImageProps) => React.ReactElement<{ onError: () => void }>
  const props = { src: "/fixture-badge.png", alt: "Clube Teste", fallbackClassName: "directoryBadgeFallback" }
  const image = component(props)
  assert.equal(image.type, "img")
  image.props.onError()
  const html = renderToStaticMarkup(component(props))
  assert.match(html, /directoryBadgeFallback[^>]*>C<\/span>/)
  assert.doesNotMatch(html, /<img/)
})
