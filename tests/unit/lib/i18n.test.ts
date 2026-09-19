import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { dictionaries, t } from "../../../lib/i18n"
import { isLocale, parseLocale, preferredLocale, localizedHref, switchLanguageHref, localePreferenceCookie } from "../../../lib/i18n/config"
import { localizedMetadata } from "../../../lib/i18n/metadata"
import { formatCurrency } from "../../../utils/formatCurrency"
import { formatDate } from "../../../utils/formatDate"
import { generateScoutAnalysis } from "../../../utils/generateScoutAnalysis"
import { createPlayerSelectionStore, FAVORITES_KEY, COMPARISON_KEY, parsePlayersParam, playersHref } from "../../../lib/playerSelections"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"

const link = ({ children, ...props }: { children?: ReactNode; href: string }) => createElement("a", props, children)
const empty = () => null

for (const locale of ["pt", "en"] as const) {
  test(locale + ": Home passes locale to its cards and search without changing player data", async () => {
    const player = mapDatabasePlayer(catalogPlayer())
    const { default: Home } = loadCatalogModule<typeof import("../../../app/[locale]/page")>("app/[locale]/page.tsx", {
      "next/link": link, "next/server": { connection: async () => {} },
      "../../services/playerService": { getFeaturedPlayers: async () => [player] },
      "../components/HomeSearch": ({ locale: received }: { locale: string }) => {
        assert.equal(received, locale); return null
      },
      "../components/PlayerCard": ({ locale: received, name }: { locale: string; name: string }) => {
        assert.equal(received, locale); assert.equal(name, player.name); return createElement("span", null, name)
      },
    })
    const html = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }))
    assert.ok(html.includes(t(locale, "Jogadores em destaque")))
    assert.ok(html.includes('href="/' + locale + '/jogadores"'))
    assert.ok(html.includes(player.name))
  })

  test(locale + ": real card localizes labels and currency while preserving null and identity", () => {
    const player = mapDatabasePlayer(catalogPlayer())
    const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
      "next/link": link, "./PlayerImage": empty, "./PlayerActions": empty,
      "../../utils/formatCurrency": { formatCurrency },
    })
    const html = renderToStaticMarkup(Card({ ...player, club: "Manchester City", locale, marketValue: 12345, potential: null }))
    assert.ok(html.includes(player.name))
    assert.ok(html.includes("Manchester City"))
    assert.ok(html.includes(t(locale, "Potencial")))
    assert.ok(!html.includes(t(locale, "Forma")))
    assert.ok(html.includes(locale === "pt" ? "Salário" : "Salary"))
    assert.ok(html.includes(formatCurrency(12345, locale)))
    assert.ok(html.includes('href="/' + locale + '/jogadores/' + player.slug + '"'))
  })

  test(locale + ": player detail metadata preserves actual names and supplies reciprocal locale URLs", async () => {
    const player = mapDatabasePlayer(catalogPlayer())
    const dependencies: Record<string, unknown> = {
      "next/link": link, "next/navigation": { notFound: () => { throw new Error("missing") } },
      "../../../../services/playerService": { getPlayerBySlug: async () => ({ status: "ready", player }) },
    }
    for (const component of ["PlayerAttributes", "PlayerGoalkeeperAttributes", "GoalkeeperScoutAnalysis", "PlayerHeader", "PlayerPlayStyles", "PlayerPositions", "PlayerQuickProfile", "ScoutAnalysis", "PlayerActions"]) {
      dependencies["../../../components/" + component] = empty
    }
    const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", dependencies)
    const metadata = await page.generateMetadata({ params: Promise.resolve({ locale, slug: player.slug }) })
    assert.equal(metadata.title, t(locale, "playerDetailTitle", { name: player.name }))
    assert.ok(String(metadata.alternates?.canonical).endsWith("/" + locale + "/jogadores/" + player.slug))
  })

  test(locale + ": club and league not-found states remain localized", async () => {
    for (const [kind, key] of [["clubes", "Clube não encontrado"], ["ligas", "Liga não encontrada"]] as const) {
      const { default: Missing } = loadCatalogModule<{ default: () => Promise<ReactNode> }>(
        "app/[locale]/" + kind + "/[slug]/not-found.tsx",
        { "next/root-params": { locale: async () => locale }, "next/link": link, "next/navigation": { usePathname: () => "/" + locale + "/" + kind + "/missing" } },
      )
      const html = renderToStaticMarkup(await Missing())
      assert.ok(html.includes(t(locale, key)))
      assert.ok(html.includes('href="/' + locale + "/" + kind + '"'))
    }
  })
}


test("locale parser only accepts pt/en and safely defaults invalid input", () => {
  for (const value of ["pt", "en"]) assert.equal(isLocale(value), true)
  for (const value of [null, undefined, "fr", "pt-BR", "__proto__", ["en"]]) {
    assert.equal(isLocale(value), false)
    assert.equal(parseLocale(value), "pt")
  }
})
test("explicit language preference precedes weighted browser preference", () => {
  assert.equal(preferredLocale("en", "pt-BR,pt;q=0.9"), "en")
  assert.equal(preferredLocale("pt", "en-US"), "pt")
  assert.equal(preferredLocale(null, "en;q=0.2,pt-BR;q=0.9"), "pt")
  assert.equal(preferredLocale(null, "fr-FR,en;q=0.8"), "en")
  assert.equal(preferredLocale("invalid", "pt;q=0,en"), "en")
  assert.equal(preferredLocale(null, null), "pt")
})
test("locale prefix is idempotent, preserves encoded entity slugs and leaves external URLs alone", () => {
  assert.equal(localizedHref("en", "/pt/jogadores/kylian-mbappe"), "/en/jogadores/kylian-mbappe")
  assert.equal(localizedHref("pt", "/pt"), "/pt")
  assert.equal(localizedHref("pt", "/"), "/pt")
  assert.equal(localizedHref("en", "/clubes/encoded%20club"), "/en/clubes/encoded%20club")
  assert.equal(localizedHref("pt", "https://example.invalid"), "https://example.invalid")
})
test("language switching preserves exact filters, comparison query, repeated values and fragment", () => {
  const query = "search=Kylian%20Mbapp%C3%A9&page=2&players=a,b&x=1&x=2"
  const en = switchLanguageHref("en", "/pt/jogadores/kylian-mbappe", query, "#attributes")
  assert.equal(en, "/en/jogadores/kylian-mbappe?" + query + "#attributes")
  assert.equal(switchLanguageHref("pt", "/en/comparar", "players=a,b"), "/pt/comparar?players=a,b")
})
test("preference cookie is scoped across locales without third-party identity", () => {
  assert.equal(localePreferenceCookie("en", true), "futscout-locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure")
  assert.ok(!localePreferenceCookie("pt").includes("Domain="))
})
test("dictionaries have identical complete keys and interpolation contracts", () => {
  assert.deepEqual(Object.keys(dictionaries.pt).sort(), Object.keys(dictionaries.en).sort())
  for (const key of Object.keys(dictionaries.pt) as (keyof typeof dictionaries.pt)[]) {
    assert.ok(dictionaries.en[key].trim(), key)
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(placeholders(dictionaries.pt[key]), placeholders(dictionaries.en[key]), key)
  }
  assert.equal(t("en", "ageYears", { age: 25 }), "25 years old")
})

for (const locale of ["pt", "en"] as const) {
  test(locale + ": navigation and language selector retain the current entity and query", () => {
    const { default: Nav } = loadCatalogModule<typeof import("../../../app/components/SiteNav")>("app/components/SiteNav.tsx", {
      "next/link": link,
      "next/navigation": { usePathname: () => "/" + locale + "/jogadores/kylian-mbappe", useSearchParams: () => new URLSearchParams("search=Kylian&page=2") },
      react: { useState: () => [null, empty], useRef: () => ({ current: null }) },
    })
    const html = renderToStaticMarkup(Nav({ locale }))
    assert.ok(html.includes(t(locale, "Jogadores")))
    assert.ok(html.includes('href="/' + locale + '/jogadores" aria-current="page"'))
    for (const target of ["pt", "en"]) assert.ok(html.includes('href="/' + target + '/jogadores/kylian-mbappe?search=Kylian&amp;page=2"'))
    assert.ok(html.includes(t(locale, "Em breve")))
  })

  test(locale + ": server root renders correct html language and metadata without hydration changes", async () => {
    const layout = loadCatalogModule<typeof import("../../../app/[locale]/layout")>("app/[locale]/layout.tsx", {
      "../globals.css": {}, "next/server": { connection: async () => {} }, "../components/SiteNav": empty,
      "next/navigation": { redirect: () => { throw new Error("redirect") } },
    })
    const props = { children: null, params: Promise.resolve({ locale }) }
    const html = renderToStaticMarkup(await layout.default(props))
    assert.ok(html.includes('lang="' + (locale === "pt" ? "pt-BR" : "en") + '"'))
    const metadata = await layout.generateMetadata(props)
    assert.equal(metadata.description, t(locale, "Explore jogadores, clubes e ligas para planejar seu Modo Carreira."))
  })

  test(locale + ": missing entity and error boundary are localized with working retry", async () => {
    const dependencies = { "next/root-params": { locale: async () => locale }, "next/link": link, "next/navigation": { usePathname: () => "/" + locale + "/jogadores/missing" } }
    const { default: Missing } = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/not-found")>(
      "app/[locale]/jogadores/[slug]/not-found.tsx", dependencies)
    assert.ok(renderToStaticMarkup(await Missing()).includes(t(locale, "Jogador não encontrado")))
    let retried = false
    const { default: ErrorUI } = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/error")>("app/[locale]/jogadores/error.tsx", dependencies)
    const node = ErrorUI({ retry: () => { retried = true } })
    assert.ok(renderToStaticMarkup(node).includes(t(locale, "Tentar novamente")))
    const walk = (value: ReactNode): void => {
      if (Array.isArray(value)) { value.forEach(walk); return }
      if (!value || typeof value !== "object" || !("props" in value)) return
      const element = value as React.ReactElement<{ children?: ReactNode; onClick?: () => void }>
      if (element.type === "button") element.props.onClick!()
      else walk(element.props.children)
    }
    walk(node)
    assert.equal(retried, true)
  })

  test(locale + ": favorite empty state and comparison entry link use localized routes", () => {
    const { default: Favorites } = loadCatalogModule<typeof import("../../../app/components/FavoritesView")>("app/components/FavoritesView.tsx", {
      "next/link": link, "next/navigation": { useRouter: () => ({ replace: empty }) },
      react: { useEffect: empty },
      "./usePlayerSelections": { usePlayerSelections: () => ({ slugs: [], ready: true, toggle: empty }) },
      "../../lib/playerSelections": { FAVORITES_LIMIT: 24, playersHref },
      "./PlayerCard": empty,
    })
    const html = renderToStaticMarkup(Favorites({ locale, requested: [], players: [] }))
    assert.ok(html.includes(t(locale, "Nenhum favorito ainda")))
    assert.ok(html.includes('href="/' + locale + '/jogadores"'))
  })
}

test("invalid root locale redirects safely instead of using an undefined dictionary", async () => {
  const signal = new Error("redirect")
  const layout = loadCatalogModule<typeof import("../../../app/[locale]/layout")>("app/[locale]/layout.tsx", {
    "../globals.css": {}, "next/server": { connection: async () => {} }, "../components/SiteNav": empty,
    "next/navigation": { redirect: (path: string) => { assert.equal(path, "/pt"); throw signal } },
  })
  await assert.rejects(layout.default({ children: null, params: Promise.resolve({ locale: "fr" }) }), (error) => error === signal)
})
test("canonical and reciprocal hreflang reference the same entity without personal query data", () => {
  for (const locale of ["pt", "en"] as const) {
    const metadata = localizedMetadata(locale, "/jogadores/kylian-mbappe", "Kylian Mbappé")
    assert.ok(String(metadata.alternates?.canonical).endsWith("/" + locale + "/jogadores/kylian-mbappe"))
    assert.ok(String(metadata.alternates?.languages?.["pt-BR"]).endsWith("/pt/jogadores/kylian-mbappe"))
    assert.ok(String(metadata.alternates?.languages?.en).endsWith("/en/jogadores/kylian-mbappe"))
  }
})
test("favorites and comparison use the same persisted identities across both locales", () => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  for (const key of [FAVORITES_KEY, COMPARISON_KEY]) {
    const first = createPlayerSelectionStore(() => storage, key, 2)
    first.toggle("kylian-mbappe")
    first.toggle("erling-haaland")
    const second = createPlayerSelectionStore(() => storage, key, 2)
    assert.deepEqual(JSON.parse(second.getSnapshot()), ["kylian-mbappe", "erling-haaland"])
  }
  const url = localizedHref("en", playersHref("/comparar", ["kylian-mbappe", "erling-haaland"]))
  assert.deepEqual(parsePlayersParam(new URL(url, "https://example.invalid").searchParams.get("players")), ["kylian-mbappe", "erling-haaland"])
  assert.deepEqual([...data.keys()].sort(), [COMPARISON_KEY, FAVORITES_KEY].sort())
})
test("currency respects locale while preserving zero and existing million rounding", () => {
  assert.equal(formatCurrency(12345, "pt"), "€12.345")
  assert.equal(formatCurrency(12345, "en"), "€12,345")
  for (const locale of ["pt", "en"] as const) {
    assert.equal(formatCurrency(0, locale), "€0")
    assert.equal(formatCurrency(145000000, locale), "€145M")
  }
})
test("dates have stable UTC meaning and explicit invalid/absent fallback", () => {
  const date = "2026-01-02T00:00:00Z"
  assert.equal(formatDate(date, "pt"), new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(date)))
  assert.equal(formatDate(date, "en"), "Jan 2, 2026")
  assert.equal(formatDate(null, "en"), "—")
  assert.equal(formatDate("invalid", "pt"), "—")
})
test("heuristic analysis translates templates without changing conditions, counts or player data", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  const snapshot = JSON.stringify(player)
  const pt = generateScoutAnalysis(player, "pt")
  const en = generateScoutAnalysis(player, "en")
  for (const key of ["strengths", "weaknesses", "roles"] as const) {
    assert.equal(pt[key].length, en[key].length)
    assert.deepEqual(en[key], pt[key].map((text) => text in dictionaries.en ? dictionaries.en[text as keyof typeof dictionaries.en] : text))
  }
  assert.equal(JSON.stringify(player), snapshot)
})
