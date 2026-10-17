import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { Prisma } from "../../../app/generated/prisma/client"
import { economicMarketValueReadSelect } from "../../../lib/economicData/read"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const current = () => ({ observation: { observedAt: new Date("2026-01-02T00:00:00.000Z"), state: {
  field: "MARKET_VALUE", context: "REAL_WORLD", provider: "LIVE_FOOTBALL", presence: "VALUE",
  amount: new Prisma.Decimal(2500000), currency: "EUR", confidence: "HIGH", matchState: "MATCHED", status: "VALID",
} } })

async function rendered(locale: "pt" | "en", economicCurrents: unknown[], extra: Record<string, unknown> = {}) {
  let queries = 0
  const service = loadCatalogModule<typeof import("../../../services/playerRealLifeService")>("services/playerRealLifeService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: { findUnique: async (args: { select: Record<string, unknown> }) => {
      queries++
      assert.deepEqual(args.select.economicCurrents, economicMarketValueReadSelect)
      assert.equal(args.select.marketValue, undefined)
      assert.equal(args.select.economicObservations, undefined)
      return { id: "synthetic-player", slug: "synthetic-player", name: "Synthetic Player", nationality: null,
        imageUrl: null, club: null, approvedCurrentClub: null, realLifeStats: [], economicCurrents, ...extra }
    } } } },
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  })
  const player = await service.getPlayerRealLifeBySlug("synthetic-player")
  const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/vida-real/page")>("app/[locale]/jogadores/[slug]/vida-real/page.tsx", {
    "next/navigation": { notFound: (): never => { throw Error("NOT_FOUND") } },
    "../../../../../services/playerRealLifeService": { getPlayerRealLifeBySlug: async () => player },
    "../../../../components/PlayerRealLifeHeader": () => createElement("h1", null, "Synthetic Player"),
  })
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ locale, slug: "synthetic-player" }) }))
  assert.equal(queries, 1)
  const section = html.match(/<section[^>]*aria-labelledby="real-market-title"[\s\S]*?<\/section>/)?.[0]
  assert.ok(section)
  return { html, section, player }
}

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: persisted selected value reaches real-life page with public provenance, without economic or EA mixing`, async () => {
    const { section, player } = await rendered(locale, [current()])
    assert.equal(player?.realMarketValue?.marketValue, 2500000)
    assert.match(section, locale === "pt" ? /Estimativa de valor de mercado da fonte/ : /Provider market value estimate/)
    assert.match(section, locale === "pt" ? /2\.500\.000,00/ : /2,500,000\.00/)
    assert.match(section, /EUR/)
    assert.match(section, locale === "pt" ? /não uma estimativa FutScout/ : /not a FutScout estimate/)
    assert.doesNotMatch(section, /€3M/)
    assert.match(section, /Live Football/)
    assert.match(section, /<time dateTime="2026-01-02T00:00:00.000Z"/)
    assert.doesNotMatch(section, /OVR|EA FC|POTENCIAL|WAGE|Salário|Weekly wage|contentHash|providerPlayerId|evidenceRef/)
  })

  test(`${locale}: explicit null and unselected/legacy values remain unavailable without fallback`, async () => {
    const nullValue = current()
    Object.assign(nullValue.observation.state, { presence: "NULL", amount: null, currency: null, status: "MISSING" })
    for (const currents of [[nullValue], []]) {
      const { section, player } = await rendered(locale, currents, { marketValue: 99000000, economicObservations: [current()] })
      assert.equal(player?.realMarketValue?.marketValue, null)
      assert.match(section, locale === "pt" ? /Valor de mercado verificado indisponível/ : /Verified market value unavailable/)
      assert.match(section, /playerMarketValue">—/)
      assert.doesNotMatch(section, /€|Live Football|<time/)
    }
  })

  test(`${locale}: invalid identity, provenance context, currency and unselected revisions never expose an amount`, async () => {
    for (const patch of [{ confidence: "LOW" }, { matchState: "AMBIGUOUS" }, { status: "REJECTED" },
      { context: "EA_CAREER" }, { currency: "ZZZ" }, { field: "WAGE_WEEKLY" }]) {
      const invalid = current()
      Object.assign(invalid.observation.state, patch)
      const { section } = await rendered(locale, [invalid])
      assert.doesNotMatch(section, /€|Live Football|<time/)
    }
    const { section } = await rendered(locale, [current(), current()])
    assert.doesNotMatch(section, /€|Live Football|<time/)
  })

  test(`${locale}: selected source currencies reach the profile without conversion or euro relabeling`, async () => {
    for (const currency of ["USD", "GBP", "BRL"]) {
      const selected = current()
      selected.observation.state.currency = currency
      selected.observation.state.amount = new Prisma.Decimal("1234.56")
      const { section, player } = await rendered(locale, [selected])
      assert.equal(player?.realMarketValue?.marketValue, 1234.56)
      assert.equal(player?.realMarketValue?.marketCurrency, currency)
      assert.match(section, new RegExp(currency))
      assert.match(section, locale === "pt" ? /1\.234,56/ : /1,234\.56/)
      assert.doesNotMatch(section, /EUR|€/)
      assert.match(section, /Live Football/)
      assert.match(section, /2026-01-02T00:00:00.000Z/)
    }
  })

  test(`${locale}: unknown provider nature is never asserted as observed or FutScout-estimated`, async () => {
    const selected = current()
    selected.observation.state.provider = "SYNTHETIC_PROVIDER"
    const { section } = await rendered(locale, [selected])
    assert.match(section, locale === "pt" ? /Natureza da avaliação não informada/ : /Valuation nature not specified/)
    assert.doesNotMatch(section, /Provider market value estimate|Estimativa de valor de mercado da fonte|FutScout/)
  })
}

test("an explicitly selected zero retains the existing reader semantics", async () => {
  const zero = current()
  zero.observation.state.amount = new Prisma.Decimal(0)
  const { section } = await rendered("en", [zero])
  assert.match(section, /EUR[^\d]*0\.00/)
  assert.match(section, /Live Football/)
})
