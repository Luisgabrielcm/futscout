import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as selections from "../../../lib/playerSelections"
import * as comparison from "../../../lib/playerComparison"
import type { SelectedPlayer } from "../../../types/playerSelection"
import { formatCurrency } from "../../../utils/formatCurrency"

const link = ({ children, ...props }: { href: string; children: ReactNode }) => createElement("a", props, children)
const image = ({ alt }: { alt: string }) => createElement("span", null, alt)
const card = (player: SelectedPlayer) => createElement("article", null, createElement("a", { href: "/jogadores/" + player.slug }, player.name))
const selected = (slug: string, changes: Partial<SelectedPlayer> = {}): SelectedPlayer => ({
  id: slug, slug, name: "Jogador " + slug, position: "MC", age: null, club: null,
  baseOverall: 80, dynamicOverall: null, potential: null, marketValue: null,
  form: null, valueTrend: null, attributes: null, ...changes,
})
const { default: Comparison } = loadCatalogModule<typeof import("../../../app/components/PlayerComparison")>(
  "app/components/PlayerComparison.tsx", {
    "next/link": link, "./PlayerImage": image, "./PlayerActions": () => null,
    "../../lib/playerComparison": comparison, "../../utils/formatCurrency": { formatCurrency },
  },
)

function comparePage(players: SelectedPlayer[]) {
  const calls: unknown[] = []
  const page = loadCatalogModule<typeof import("../../../app/comparar/page")>("app/comparar/page.tsx", {
    "next/link": link, "../components/DirectoryCatalog": { DirectoryNav: () => null },
    "../components/PlayerCard": card, "../components/PlayerComparison": Comparison,
    "../components/ComparisonSelection": () => null,
    "../../services/playerSelectionService": { getSelectedPlayers: async (...args: unknown[]) => { calls.push(args); return players } },
    "../../lib/playerSelections": selections,
  })
  return { page, calls }
}

test("comparison empty URL renders selection guidance instead of an empty table", async () => {
  const f = comparePage([])
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({}) }))
  assert.match(html, /Escolha dois jogadores/)
  assert.doesNotMatch(html, /<table/)
})

test("comparison with one player renders the player and asks for the second", async () => {
  const f = comparePage([selected("a")])
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ players: "a" }) }))
  assert.match(html, /Falta um jogador/)
  assert.match(html, /href="\/jogadores\/a"/)
  assert.doesNotMatch(html, /<table/)
})

test("comparison URL is bounded before the service; two players render a semantic table", async () => {
  const f = comparePage([selected("b"), selected("a")])
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ players: ["b,a,c", "d,e"] }) }))
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [[["b", "a"], 2]])
  assert.match(html, /<table/)
  assert.match(html, /scope="row"/)
  assert.ok(html.indexOf("Jogador b") < html.indexOf("Jogador a"))
})

test("unknown URL player is identified without inventing its comparison data", async () => {
  const f = comparePage([selected("a")])
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ players: "a,missing" }) }))
  assert.match(html, /Jogador não encontrado: missing/)
  assert.doesNotMatch(html, /<table/)
})

test("comparison keeps absences as dashes and ties neutral", () => {
  const html = renderToStaticMarkup(createElement(Comparison, { players: [selected("a"), selected("b")] }))
  assert.match(html, /—/)
  assert.doesNotMatch(html, /comparisonHigher|Maior valor|OVR FutScout/)
})

test("comparison highlights only a greater available numeric value", () => {
  const html = renderToStaticMarkup(createElement(Comparison, {
    players: [selected("a", { baseOverall: 90 }), selected("b")],
  }))
  assert.match(html, /class="comparisonHigher">90/)
  assert.match(html, /aria-label="Maior valor"/)
})

test("a goalkeeper preserves general fields but suppresses outfield attribute comparison", () => {
  const attributes = { pace: 99, shooting: 98, passing: 97, dribbling: 96, defending: 95, physical: 94 }
  const html = renderToStaticMarkup(createElement(Comparison, {
    players: [selected("a", { attributes }), selected("b", { position: "GOL", attributes })],
  }))
  assert.match(html, /Há um goleiro/)
  assert.match(html, /OVR EA/)
  assert.doesNotMatch(html, />99<|>98<|comparisonHigher/)
})

function favoritesView(slugs: string[], ready = true) {
  const navigations: string[] = []
  const effects: (() => void)[] = []
  const removals: string[] = []
  const view = loadCatalogModule<typeof import("../../../app/components/FavoritesView")>("app/components/FavoritesView.tsx", {
    "next/link": link, react: { useEffect: (effect: () => void) => { effects.push(effect) } },
    "next/navigation": { useRouter: () => ({ replace: (href: string) => { navigations.push(href) } }) },
    "./usePlayerSelections": { usePlayerSelections: () => ({ slugs, ready, toggle: (slug: string) => { removals.push(slug) } }) },
    "../../lib/playerSelections": selections, "./PlayerCard": card,
  })
  return { View: view.default, effects, navigations, removals }
}

test("favorites starts SSR-safe and does not display URL results before reading local storage", () => {
  const f = favoritesView([], false)
  const html = renderToStaticMarkup(createElement(f.View, { requested: ["a"], players: [selected("a")] }))
  assert.match(html, /Carregando seus favoritos locais/)
  assert.doesNotMatch(html, /Jogador a/)
  f.effects.forEach((effect) => effect())
  assert.equal(f.navigations.length, 0)
})

test("favorites empty local storage renders a real catalog link", () => {
  const f = favoritesView([])
  const html = renderToStaticMarkup(createElement(f.View, { requested: [], players: [] }))
  assert.match(html, /Nenhum favorito ainda/)
  assert.match(html, /href="\/jogadores"/)
})

test("favorites reconciles local slugs with server results using a safe replace URL", () => {
  const f = favoritesView(["b", "a"])
  const html = renderToStaticMarkup(createElement(f.View, { requested: [], players: [] }))
  assert.match(html, /Carregando/)
  f.effects.forEach((effect) => effect())
  assert.deepEqual(f.navigations, ["/favoritos?players=b,a"])
})

test("favorites renders resolved players and a removable unavailable-player state", () => {
  const f = favoritesView(["a", "missing"])
  const html = renderToStaticMarkup(createElement(f.View, { requested: ["a", "missing"], players: [selected("a")] }))
  assert.match(html, /href="\/jogadores\/a"/)
  assert.match(html, /Jogadores indisponíveis/)
  assert.match(html, /aria-label="Remover missing dos favoritos"/)
  buttons(f.View({ requested: ["a", "missing"], players: [selected("a")] }))[0].props.onClick?.()
  assert.deepEqual(f.removals, ["missing"])
  f.effects.forEach((effect) => effect())
  assert.equal(f.navigations.length, 0)
})

test("favorites server shell requests the bounded slug set in one service call", async () => {
  const calls: unknown[] = []
  const page = loadCatalogModule<typeof import("../../../app/favoritos/page")>("app/favoritos/page.tsx", {
    "../components/DirectoryCatalog": { DirectoryNav: () => null },
    "../components/FavoritesView": () => null, "../../lib/playerSelections": selections,
    "../../services/playerSelectionService": { getSelectedPlayers: async (slugs: unknown) => { calls.push(slugs); return [] } },
  })
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ players: "a,a,b" }) }))
  assert.match(html, /Favoritos/)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["a", "b"]])
})

test("real local hook and actions render without window/localStorage during SSR", () => {
  const hook = loadCatalogModule<typeof import("../../../app/components/usePlayerSelections")>("app/components/usePlayerSelections.ts", {
    react: React, "../../lib/playerSelections": selections,
  })
  const { default: Actions } = loadCatalogModule<typeof import("../../../app/components/PlayerActions")>("app/components/PlayerActions.tsx", {
    react: React, "next/link": link, "./usePlayerSelections": hook, "../../lib/playerSelections": selections,
  })
  const html = renderToStaticMarkup(createElement(Actions, { slug: "a", name: "Jogador A" }))
  assert.match(html, /aria-pressed="false"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /Adicionar Jogador A aos favoritos/)
})

function buttons(node: ReactNode): React.ReactElement<{ children?: ReactNode; onClick?: () => void }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons)
  if (!React.isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return []
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props.children)]
}

function actionsFixture(persist = true) {
  const values = new Map<string, string>()
  const storage = () => persist ? {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  } : undefined
  const stores = {
    favorites: selections.createPlayerSelectionStore(storage, selections.FAVORITES_KEY, 24),
    comparison: selections.createPlayerSelectionStore(storage, selections.COMPARISON_KEY, 2),
  }
  let message = ""
  const { default: Actions } = loadCatalogModule<typeof import("../../../app/components/PlayerActions")>("app/components/PlayerActions.tsx", {
    react: { useState: () => [message, (next: string) => { message = next }] }, "next/link": link,
    "../../lib/playerSelections": selections,
    "./usePlayerSelections": { usePlayerSelections: (kind: keyof typeof stores) => ({
      slugs: selections.parseStoredPlayers(stores[kind].getSnapshot()), ready: true, toggle: stores[kind].toggle,
    }) },
  })
  const render = (slug: string) => Actions({ slug, name: "Jogador " + slug })
  return { render, values, stores }
}

test("favorite button persists a toggle, changes accessible state and removes without navigation", () => {
  const f = actionsFixture()
  buttons(f.render("a"))[0].props.onClick?.()
  assert.equal(f.values.get(selections.FAVORITES_KEY), '["a"]')
  const html = renderToStaticMarkup(f.render("a"))
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /Remover Jogador a dos favoritos/)
  buttons(f.render("a"))[0].props.onClick?.()
  assert.equal(f.values.get(selections.FAVORITES_KEY), "[]")
})

test("comparison buttons fill two slots, expose shared URL and reject a third until removal", () => {
  const f = actionsFixture()
  buttons(f.render("a"))[1].props.onClick?.()
  buttons(f.render("b"))[1].props.onClick?.()
  assert.equal(f.values.get(selections.COMPARISON_KEY), '["a","b"]')
  assert.match(renderToStaticMarkup(f.render("b")), /href="\/comparar\?players=a,b"/)
  buttons(f.render("c"))[1].props.onClick?.()
  assert.match(renderToStaticMarkup(f.render("c")), /Seleção cheia/)
  assert.equal(f.values.get(selections.COMPARISON_KEY), '["a","b"]')
  buttons(f.render("a"))[1].props.onClick?.()
  buttons(f.render("c"))[1].props.onClick?.()
  assert.equal(f.values.get(selections.COMPARISON_KEY), '["b","c"]')
})

test("favorite action explains session-only fallback when storage is unavailable", () => {
  const f = actionsFixture(false)
  buttons(f.render("a"))[0].props.onClick?.()
  assert.match(renderToStaticMarkup(f.render("a")), /apenas nesta sessão/)
  assert.equal(f.stores.favorites.getSnapshot(), '["a"]')
})
