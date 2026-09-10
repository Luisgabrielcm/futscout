import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { Image, Flag, clubComponents } from "../../helpers/clubExperienceFixture"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { displayNationality } from "../../../lib/i18n/countries"
import { displayForm } from "../../../lib/i18n/presentation"
import { nationalityHref } from "../../../lib/connectedNavigation"
import { getCountryFlag } from "../../../lib/countryFlags"
import * as positions from "../../../lib/playerProfilePositions"
import * as directory from "../../../lib/directoryCatalogParams"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"

const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
  "./PlayerImage": Image, "./CountryFlag": Flag, "../../lib/playerProfilePositions": positions,
  "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference },
})
const { default: Quick } = loadCatalogModule<typeof import("../../../app/components/PlayerQuickProfile")>("app/components/PlayerQuickProfile.tsx", {})
const { default: Overview } = loadCatalogModule<typeof import("../../../app/components/PlayerOverview")>("app/components/PlayerOverview.tsx", { "../../utils/getOverallDifference": { getOverallDifference } })
const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
  "./PlayerImage": Image, "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
})
const components = loadCatalogModule<typeof import("../../../app/components/DirectoryCatalog")>("app/components/DirectoryCatalog.tsx", {
  "./PlayerImage": Image, "./PlayerCard": Card, "../../lib/directoryCatalogParams": directory,
})
// Assertions inspect rendered text, not canonical values in URLs/serialized props.
const visibleText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")

for (const [canonical, pt, en, code] of [
  ["Germany", "Alemanha", "Germany", "de"], ["Spain", "Espanha", "Spain", "es"],
  ["France", "França", "France", "fr"], ["England", "Inglaterra", "England", "gb-eng"],
  ["Italy", "Itália", "Italy", "it"], ["Netherlands", "Países Baixos", "Netherlands", "nl"],
  ["Norway", "Noruega", "Norway", "no"], ["Brazil", "Brasil", "Brazil", "br"],
  ["Japan", "Japão", "Japan", "jp"],
]) {
  test(`nationality matrix: ${canonical} preserves identity and flag in PT/EN`, () => {
    assert.equal(displayNationality(canonical, "pt"), pt)
    assert.equal(displayNationality(canonical, "en"), en)
    assert.equal(nationalityHref("pt", canonical), `/pt/selecoes/${code}`)
    assert.equal(nationalityHref("en", canonical), `/en/selecoes/${code}`)
    assert.equal(getCountryFlag(canonical)?.iconSrc, `/flags/${code}.svg`)
  })
}
test("text-only identities and unknown nationality have deliberate display fallbacks", () => {
  for (const [canonical, pt] of [["Northern Ireland", "Irlanda do Norte"], ["Chinese Taipei", "Taipei Chinesa"]]) {
    assert.equal(displayNationality(canonical, "pt"), pt)
    assert.equal(displayNationality(canonical, "en"), canonical)
    assert.equal(getCountryFlag(canonical), null)
  }
  assert.equal(displayNationality("Unknown Nation", "pt"), "Unknown Nation")
  assert.equal(displayNationality("Congo", "pt"), "Congo")
})

test("form presentation preserves missing and unknown values without inferring a supported status", () => {
  for (const locale of ["pt", "en"] as const) {
    assert.equal(displayForm(null, locale), null)
    assert.equal(displayForm("Unlisted form", locale), "Unlisted form")
  }
})

for (const locale of ["pt", "en"] as const) {
  for (const [name, slug, nationality, pt, code] of [
    ["Marc-André ter Stegen", "marc-andre-ter-stegen", "Germany", "Alemanha", "de"],
    ["Jauregizar", "jauregizar", "Spain", "Espanha", "es"],
    ["Jude Bellingham", "jude-bellingham", "England", "Inglaterra", "gb-eng"],
  ]) {
    test(`${locale}: real header, quick profile and squad localize ${name}`, () => {
      const row = catalogPlayer({ name, slug, nationality })
      const player = mapDatabasePlayer(row)
      for (const html of [
        renderToStaticMarkup(createElement(Header, { locale, player })),
        renderToStaticMarkup(createElement(Quick, { locale, player })),
        renderToStaticMarkup(createElement(clubComponents.SquadList, { locale, players: [player] })),
      ]) {
        assert.ok(visibleText(html).includes(locale === "pt" ? pt : nationality))
        assert.ok(!visibleText(html).includes(locale === "pt" ? nationality : pt))
        assert.ok(html.includes(`href="/${locale}/selecoes/${code}"`))
      }
      assert.equal(player.nationality, nationality)
      assert.equal(row.nationality, nationality)
    })
  }
  for (const [form, en] of [["Péssima", "Very poor"], ["Ruim", "Poor"], ["Normal", "Normal"], ["Boa", "Good"], ["Excelente", "Excellent"]] as const) {
    test(`${locale}: form ${form} is localized in card, overview and squad without changing DTO`, () => {
      const player = mapDatabasePlayer(catalogPlayer({ form }))
      for (const html of [
        renderToStaticMarkup(createElement(Card, { ...player, club: null, locale })),
        renderToStaticMarkup(createElement(Overview, { player, locale })),
        renderToStaticMarkup(createElement(clubComponents.SquadList, { players: [player], locale })),
      ]) {
        assert.ok(visibleText(html).includes(locale === "pt" ? form : en))
        if (form !== en) assert.ok(!visibleText(html).includes(locale === "pt" ? en : form))
      }
      assert.equal(player.form, form)
    })
  }
  test(`${locale}: league card and real league page localize known country without changing slug`, async () => {
    const league = { name: "Fixture League", slug: "fixture-league", country: "Germany", _count: { clubs: 0 } }
    const pagination = { page: 1, total: 0, totalPages: 1, pageSize: 24 }
    const page = loadCatalogModule<typeof import("../../../app/[locale]/ligas/[slug]/page")>("app/[locale]/ligas/[slug]/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Unexpected notFound") } },
      "../../../../services/leagueService": { getLeagueBySlug: async () => league, getLeagueClubs: async () => ({ ...pagination, clubs: [] }), getLeaguePlayers: async () => ({ ...pagination, players: [] }) },
      "../../../../lib/directoryCatalogParams": directory, "../../../components/DirectoryCatalog": components,
    })
    for (const html of [renderToStaticMarkup(createElement(components.LeagueCard, { locale, league })),
      renderToStaticMarkup(await page.default({ params: Promise.resolve({ locale, slug: league.slug }), searchParams: Promise.resolve({}) }))]) {
      assert.ok(visibleText(html).includes(locale === "pt" ? "Alemanha" : "Germany"))
      assert.ok(!visibleText(html).includes(locale === "pt" ? "Germany" : "Alemanha"))
    }
    assert.equal(league.country, "Germany")
    assert.ok(renderToStaticMarkup(createElement(components.LeagueCard, { locale, league })).includes(`href="/${locale}/ligas/fixture-league"`))
  })
}
