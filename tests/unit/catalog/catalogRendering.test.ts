import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { createElement, isValidElement, type ComponentType, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { mapDatabasePlayerProfile, type PlayerProfile } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"
import * as catalogParams from "../../../lib/playerCatalogParams"
import * as profilePositions from "../../../lib/playerProfilePositions"

const link = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
  createElement("a", { href, className }, children)
const image = ({ alt }: { alt: string }) => createElement("span", null, alt)
const marker = (name: string) => function SectionMarker() {
  return createElement("section", { "data-section": name }, name)
}

function detailPage(profile: PlayerProfile | null) {
  const notFoundSignal = new Error("NOT_FOUND")
  const pageModule = loadCatalogModule<{
    default: (props: { params: Promise<{ slug: string }> }) => Promise<ReactNode>
  }>("app/[locale]/jogadores/[slug]/page.tsx", {
    "next/link": link,
    "next/navigation": { notFound: () => { throw notFoundSignal } },
    "../../../../services/playerService": { getPlayerBySlug: async () => profile },
    "../../../components/PlayerHeader": marker("header"),
    "../../../components/PlayerQuickProfile": marker("quick-profile"),
    "../../../components/PlayerPositions": marker("outfield-positions"),
    "../../../components/ScoutAnalysis": marker("outfield-analysis"),
    "../../../components/PlayerAttributes": marker("persisted-attributes"),
    "../../../components/PlayerPlayStyles": marker("playstyles"),
    "../../../components/PlayerActions": () => null,
  })
  return { render: () => pageModule.default({ params: Promise.resolve({ slug: "fixture" }) }), notFoundSignal }
}

test("missing player invokes App Router notFound instead of rendering a success page", async () => {
  const page = detailPage(null)
  await assert.rejects(page.render(), (error: unknown) => error === page.notFoundSignal)
})

test("incomplete player renders explicit feedback without entering attribute components", async () => {
  const page = detailPage(mapDatabasePlayerProfile(catalogPlayer({ attributes: null })))
  const html = renderToStaticMarkup(await page.render())
  assert.match(html, /Perfil incompleto/)
  assert.match(html, /Jogador de teste/)
  assert.doesNotMatch(html, /outfield-|data-section/)
})

test("goalkeeper retains general sections but never enters outfield analysis", async () => {
  const page = detailPage(mapDatabasePlayerProfile(catalogPlayer({ position: "GOL" })))
  const html = renderToStaticMarkup(await page.render())
  assert.match(html, /data-section="header"/)
  assert.match(html, /data-section="quick-profile"/)
  assert.match(html, /data-section="playstyles"/)
  assert.match(html, /Análise específica para goleiros em desenvolvimento/)
  assert.match(html, /data-section="persisted-attributes"/)
  assert.doesNotMatch(html, /outfield-/)
})

test("outfield player keeps the existing analysis and attribute sections", async () => {
  const html = renderToStaticMarkup(await detailPage(mapDatabasePlayerProfile(catalogPlayer())).render())
  assert.match(html, /outfield-positions/)
  assert.match(html, /outfield-analysis/)
  assert.match(html, /persisted-attributes/)
})

test("card keeps market absences honest and actions outside its main link", () => {
  type Props = Parameters<typeof import("../../../app/components/PlayerCard").default>[0]
  const { default: Card } = loadCatalogModule<{ default: ComponentType<Props> }>(
    "app/components/PlayerCard.tsx", {
      "next/link": link, "./PlayerImage": image,
      "./PlayerActions": () => createElement("button", { type: "button" }, "Favoritar"),
      "../../utils/formatCurrency": { formatCurrency },
    },
  )
  const profile = mapDatabasePlayerProfile(catalogPlayer({ marketValue: BigInt(50_000_000) }))
  if (profile.status !== "ready") assert.fail("expected ready")
  const props = { ...profile.player, club: null }
  const html = renderToStaticMarkup(createElement(Card, props))
  assert.match(html, /OVR EA/)
  assert.doesNotMatch(html, /TENDÊNCIA|Estável|OVR ATUAL|OVR FUTSCOUT/)
  assert.match(html, /<button[^>]*>Favoritar<\/button><a/)
  assert.doesNotMatch(html, /<a\b[^>]*>[^]*<button/)
  const dynamic = renderToStaticMarkup(createElement(Card, { ...props, dynamicOverall: 82 }))
  assert.match(dynamic, /OVR FUTSCOUT/)
})

test("header labels the base EA overall and does not invent market stability", () => {
  type Props = Parameters<typeof import("../../../app/components/PlayerHeader").default>[0]
  const { default: Header } = loadCatalogModule<{ default: ComponentType<Props> }>(
    "app/components/PlayerHeader.tsx", {
      "./PlayerImage": image,
      "../../lib/playerProfilePositions": profilePositions,
      "./CountryFlag": ({ country }: { country: string | null }) => createElement("span", null, country),
      "../../utils/formatCurrency": { formatCurrency },
      "../../utils/getOverallDifference": { getOverallDifference },
    },
  )
  const profile = mapDatabasePlayerProfile(catalogPlayer({ marketValue: BigInt(50_000_000) }))
  if (profile.status !== "ready") assert.fail("expected ready")
  const html = renderToStaticMarkup(createElement(Header, { player: profile.player }))
  assert.match(html, /OVR EA/)
  assert.match(html, /Tendência não disponível/)
  assert.doesNotMatch(html, /OVR ATUAL|Estável/)
})

test("Home has no placeholder links or unsupported coverage claims", async () => {
  const { default: Home } = loadCatalogModule<{ default: () => Promise<ReactNode> }>(
    "app/[locale]/page.tsx", {
      "next/server": { connection: async () => {} },
      "next/link": link,
      "../../services/playerService": { getFeaturedPlayers: async () => [] },
      "../components/HomeSearch": marker("home-search"),
      "../components/PlayerCard": marker("card"),
    },
  )
  const html = renderToStaticMarkup(await Home())
  assert.doesNotMatch(html, /href="#"|70\.000\+|900\+|60\+|24H|compare atletas/)
  assert.match(html, /href="\/pt\/jogadores"/)
  assert.doesNotMatch(html, /class="sidebar"|class="menu"/)
  assert.match(html, /Nenhum jogador em destaque disponível/)
})

type ElementProps = {
  children?: ReactNode
  className?: string
  onClick?: () => void
}

function elements(node: ReactNode): React.ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<ElementProps>(node)) return []
  return [node, ...elements(node.props.children)]
}

test("active chips and chip removal use applied filters, never the edited draft", () => {
  const navigations: string[] = []
  let stateIndex = 0
  type Props = Parameters<typeof import("../../../app/components/PlayersSearch").default>[0]
  const { default: Search } = loadCatalogModule<{ default: (props: Props) => ReactNode }>(
    "app/components/PlayersSearch.tsx", {
      react: {
        ...React,
        // Model an edited first input; applied props still describe the URL.
        useState: (initial: unknown) => [stateIndex++ === 0 ? "draft" : initial, () => {}],
        useTransition: () => [false, (callback: () => void) => callback()],
      },
      "next/navigation": {
        usePathname: () => "/pt/jogadores",
        useRouter: () => ({ push: (url: string) => navigations.push(url) }),
      },
      "./PlayerCard": marker("card"),
      "../../lib/playerCatalogParams": catalogParams,
    },
  )
  const tree = Search({ players: [], leagues: [], initialSearch: "applied", initialMinPace: "90" })
  const chips = elements(tree).find((element) => element.props.className === "activeFilters")
  assert.ok(chips)
  const html = renderToStaticMarkup(chips)
  assert.match(html, /Busca: applied/)
  assert.doesNotMatch(html, /draft/)
  const pace = elements(chips).find((element) =>
    element.type === "button" && renderToStaticMarkup(element).includes("Ritmo"))
  assert.ok(pace?.props.onClick)
  pace.props.onClick()
  assert.equal(navigations[0], "/pt/jogadores?search=applied")
  const clear = elements(tree).find((element) => element.props.className?.split(" ").includes("clearFiltersButton"))
  assert.ok(clear?.props.onClick)
  clear.props.onClick()
  assert.equal(navigations[1], "/pt/jogadores")
})
