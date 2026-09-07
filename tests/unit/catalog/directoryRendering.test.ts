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

const link = ({ children, ...props }: { href: string; children: ReactNode }) => createElement("a", props, children)
const { default: Image } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
  "app/components/PlayerImage.tsx", { react: React },
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
  const prefix = detail ? "../../../" : "../../"
  const page = loadCatalogModule<PageModule>(`app/${kind}/${detail ? "[slug]/" : ""}page.tsx`, {
    "next/link": link, "next/navigation": { notFound: () => { throw signal } },
    [prefix + "lib/directoryCatalogParams"]: directory,
    [prefix + "services/clubService"]: clubService,
    [prefix + "services/leagueService"]: leagueService,
    [prefix + "services/playerService"]: { getLeagues: async () => [league] },
    [detail ? "../../components/DirectoryCatalog" : "../components/DirectoryCatalog"]: components,
  })
  const props = (search: CatalogSearchParams = {}): Props => ({ params: Promise.resolve({ slug: "fixture" }), searchParams: Promise.resolve(search) })
  return { page, props, signal, calls, clubs, players }
}

for (const kind of ["clubes", "ligas"] as const) {
  test(`${kind}: missing slug stops before roster queries and metadata also signals notFound`, async () => {
    const f = pageFixture(kind, true, true)
    await assert.rejects(f.page.default(f.props()), (error) => error === f.signal)
    await assert.rejects(f.page.generateMetadata(f.props()), (error) => error === f.signal)
    assert.equal(f.calls.length, 0)
  })

  test(`${kind}: list renders empty state, GET search and safe invalid navigation`, async () => {
    const f = pageFixture(kind)
    const html = renderToStaticMarkup(await f.page.default(f.props({ page: "NaN", search: [" Teste ", "ignore"] })))
    assert.match(html, kind === "clubes" ? /Nenhum clube encontrado/ : /Nenhuma liga encontrada/)
    assert.match(html, /method="get"/)
    assert.match(html, /value="Teste"/)
    assert.equal((f.calls[0].input as { page: number }).page, 1)
    assert.match(html, /href="\/clubes"/)
    assert.match(html, /href="\/ligas"/)
    assert.doesNotMatch(html, /href="#"/)
  })

  test(`${kind}: detail empty roster and metadata use only actual entity fields`, async () => {
    const f = pageFixture(kind, true)
    const html = renderToStaticMarkup(await f.page.default(f.props()))
    assert.match(html, /Nenhum jogador com atributos disponíveis/)
    if (kind === "ligas") assert.match(html, /Nenhum clube encontrado/)
    assert.doesNotMatch(html, /Não informado|apiFootballId|Estádio|Títulos/)
    const metadata = await f.page.generateMetadata(f.props())
    assert.equal(metadata.title, kind === "clubes"
      ? "Clube Teste — jogadores e elenco | FutScout" : "Liga Teste — clubes e jogadores | FutScout")
  })

  test(`${kind}: lists and profiles expose real entity and player links`, async () => {
    const list = pageFixture(kind, false, false, true)
    const html = renderToStaticMarkup(await list.page.default(list.props()))
    assert.match(html, kind === "clubes" ? /href="\/clubes\/clube-teste"/ : /href="\/ligas\/liga-teste"/)
    const f = pageFixture(kind, true, false, true)
    const detail = renderToStaticMarkup(await f.page.default(f.props()))
    assert.match(detail, /href="\/jogadores\/fixture-player"/)
    assert.match(detail, kind === "clubes" ? /href="\/ligas\/liga-teste"/ : /href="\/clubes\/clube-teste"/)
  })
}

test("league's two paginations preserve each other and provide independent page recovery", async () => {
  const f = pageFixture("ligas", true)
  Object.assign(f.clubs, { page: 2, totalPages: 3 })
  Object.assign(f.players, { page: 3, totalPages: 5 })
  const html = renderToStaticMarkup(await f.page.default(f.props({ page: "3", clubsPage: "2" })))
  assert.match(html, /href="\/ligas\/liga-teste\?page=3&amp;clubsPage=3#clubes"/)
  assert.match(html, /href="\/ligas\/liga-teste\?page=4&amp;clubsPage=2#jogadores"/)
  Object.assign(f.clubs, { page: 999 })
  const recovery = renderToStaticMarkup(await f.page.default(f.props({ page: "3", clubsPage: "999" })))
  assert.match(recovery, /href="\/ligas\/liga-teste\?page=3#clubes"/)
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
  let failed = false
  const { default: TestImage } = loadCatalogModule<{ default: ComponentType<ImageProps> }>(
    "app/components/PlayerImage.tsx", { react: { useState: () => [failed, (value: boolean) => { failed = value }] } },
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
