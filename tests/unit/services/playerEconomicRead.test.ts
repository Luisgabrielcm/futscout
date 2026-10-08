import assert from "node:assert/strict"
import { test } from "node:test"
import { Prisma } from "../../../app/generated/prisma/client"
import { readEconomicMarketValue, economicMarketValueReadSelect } from "../../../lib/economicData/read"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import { renderToStaticMarkup } from "react-dom/server"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"
import type { ReactElement } from "react"

const current = (value: number) => [{ observation: { observedAt: new Date("2026-10-06T17:07:25.602Z"), state: {
  field: "MARKET_VALUE", context: "REAL_WORLD", provider: "LIVE_FOOTBALL", presence: "VALUE", amount: new Prisma.Decimal(value),
  currency: "EUR", confidence: "HIGH", matchState: "MATCHED", status: "VALID",
} } }]

test("five canaries project EUR, provenance and actual observation timestamp", () => {
  for (const [name, value] of [["Haaland", 220e6], ["Vini", 130e6], ["Mbappé", 200e6], ["Yamal", 220e6], ["Pedri", 150e6]] as const) {
    const result = readEconomicMarketValue({ economicCurrents: current(value) })
    assert.equal(result.marketValue, value, name); assert.equal(result.marketCurrency, "EUR")
    assert.equal(result.marketValueReadState, "READY"); assert.equal(result.economicMarketValue?.provider, "LIVE_FOOTBALL")
    assert.equal(result.economicMarketValue?.observedAt, "2026-10-06T17:07:25.602Z")
  }
})
test("absence never falls back to legacy, zero remains a value, invalid currency fails closed", () => {
  const legacy = { marketValue: 999999, economicCurrents: [] }
  assert.equal(readEconomicMarketValue(legacy).marketValue, null)
  assert.equal(readEconomicMarketValue({ economicCurrents: current(0) }).marketValue, 0)
  const invalid = current(1); invalid[0].observation.state.currency = "USD"
  assert.equal(readEconomicMarketValue({ economicCurrents: invalid }).marketValue, null)
})
test("catalog/profile and roster use bounded relation queries without N+1", async () => {
  const rows = [220e6, 130e6, 200e6, 220e6, 150e6, null].map((v, i) => ({ ...catalogPlayer({ id: String(i), marketValue: BigInt(999) }), economicCurrents: v === null ? [] : current(v) }))
  let queries = 0
  const infrastructure = { prisma: { player: {
    count: async () => rows.length,
    findMany: async (args: { include?: { economicCurrents?: unknown }; select?: { economicCurrents?: unknown } }) => {
      queries++; assert.deepEqual(args.include?.economicCurrents ?? args.select?.economicCurrents, economicMarketValueReadSelect); return rows
    },
    findUnique: async () => { queries++; return rows[0] },
  } } }
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": infrastructure, "../mappers/mapDatabasePlayer": mapper,
    "../lib/playerCatalogParams": params, "../lib/playerCatalogOrder": order,
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  })
  const page = await service.getPlayers()
  assert.deepEqual(page.players.map(p => p.marketValue), [220e6, 130e6, 200e6, 220e6, 150e6, null]); assert.equal(queries, 1)
  const profile = await service.getPlayerBySlug("fixture"); assert.equal(profile?.status, "ready")
  if (profile?.status === "ready") assert.equal(profile.player.marketValue, 220e6)
  const clubs = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache: (fn: unknown) => fn }, "../lib/prisma": infrastructure, "./playerService": service,
    "../lib/directoryCatalogParams": {}, "./clubIdentityAliases": {}, "./brandAssetReadService": {},
  })
  assert.deepEqual((await clubs.getClubRoster("fixture")).map(p => p.marketValue), [220e6, 130e6, 200e6, 220e6, 150e6, null])
  assert.equal(queries, 3)
})
test("existing No jogo header displays canaries, zero and neutral absence", () => {
  const Header = loadCatalogModule<{ default: (props: unknown) => ReactElement }>("app/components/PlayerHeader.tsx", {
    "../../utils/formatCurrency": { formatCurrency },
    "../../utils/getOverallDifference": { getOverallDifference },
  }).default
  for (const amount of [220e6, 130e6, 200e6, 150e6, 0, null]) {
    const player = { ...mapper.mapDatabasePlayer(catalogPlayer()), marketValue: amount }
    const html = renderToStaticMarkup(Header({ player, valueContext: "career-mode", locale: "pt" }))
    assert.ok(html.includes(amount === null ? 'playerHeaderMarketValue">—' : formatCurrency(amount)))
    assert.ok(!html.includes("VALOR CAREER MODE"))
  }
})
