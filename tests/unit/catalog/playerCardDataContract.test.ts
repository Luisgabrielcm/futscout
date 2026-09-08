import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Prisma } from "../../../app/generated/prisma/client"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import { formatCurrency } from "../../../utils/formatCurrency"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const link = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
  createElement("a", { href, className }, children)

// Keep the real service, mapper, DTO, callers and card. Only infrastructure and
// unrelated interactive/image components are faked; no Prisma client is loaded.
function contractFixture(row: mapper.DatabasePlayer) {
  const service = loadCatalogModule<typeof import("../../../services/playerService")>(
    "services/playerService.ts", {
      "server-only": {},
      "../lib/prisma": { prisma: { player: {
        count: async () => 1,
        findMany: async (args: Prisma.PlayerFindManyArgs) => {
          // include retains scalar columns. Fail if a future query excludes them.
          for (const field of ["potential", "form", "marketValue"] as const) {
            if (args.select) assert.equal(args.select[field], true, `${field} selected`)
            assert.notEqual(args.omit?.[field], true, `${field} not omitted`)
          }
          // Featured queries can request a fill after deduplication.
          return args.where?.id ? [] : [row]
        },
      } } },
      "../mappers/mapDatabasePlayer": mapper,
      "../lib/playerCatalogParams": params,
      "../lib/playerCatalogOrder": order,
    },
  )
  const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>(
    "app/components/PlayerCard.tsx", {
      "next/link": link,
      "./PlayerImage": () => null,
      "./PlayerActions": () => null,
      "../../utils/formatCurrency": { formatCurrency },
    },
  )
  const { default: Search } = loadCatalogModule<typeof import("../../../app/components/PlayersSearch")>(
    "app/components/PlayersSearch.tsx", {
      react: React,
      "next/navigation": { usePathname: () => "/jogadores", useRouter: () => ({ push: () => {} }) },
      "./PlayerCard": Card,
      "../../lib/playerCatalogParams": params,
    },
  )
  const { default: Home } = loadCatalogModule<typeof import("../../../app/page")>(
    "app/page.tsx", {
      "next/link": link,
      "../services/playerService": service,
      "./components/HomeSearch": () => null,
      "./components/PlayerCard": Card,
    },
  )
  return { service, Search, Home }
}

for (const scenario of [
  { name: "valid persisted values", potential: 94, form: "Excelente", marketValue: BigInt(145_000_000),
    expectedPotential: "94", expectedForm: "Excelente", expectedMarket: "€145M" },
  { name: "true nulls without overall/form/value fallback", potential: null, form: null, marketValue: null,
    expectedPotential: "—", expectedForm: "—", expectedMarket: "—" },
  { name: "zero values without mistaking them for null", potential: 0, form: "Normal", marketValue: BigInt(0),
    expectedPotential: "0", expectedForm: "Normal", expectedMarket: "€0" },
]) {
  test(`catalog query → mapper → callers → PlayerCard preserves ${scenario.name}`, async () => {
    const { service, Search, Home } = contractFixture(catalogPlayer({
      potential: scenario.potential, form: scenario.form, marketValue: scenario.marketValue,
    }))
    const { players } = await service.getPlayers()
    assert.equal(players.length, 1)
    assert.equal(players[0].potential, scenario.potential)
    assert.equal(players[0].form, scenario.form)
    assert.equal(players[0].marketValue, scenario.marketValue === null ? null : Number(scenario.marketValue))
    // The client DTO must not retain Prisma's bigint.
    assert.doesNotThrow(() => JSON.stringify(players))

    for (const html of [
      renderToStaticMarkup(createElement(Search, { players, leagues: [] })),
      renderToStaticMarkup(await Home()),
    ]) {
      assert.ok(html.includes(`<span>Potencial</span><strong>${scenario.expectedPotential}</strong>`))
      assert.ok(html.includes(`<span>Forma</span><strong>${scenario.expectedForm}</strong>`))
      assert.ok(html.includes(`<strong class="marketValue">${scenario.expectedMarket}</strong>`))
      assert.doesNotMatch(html, /TENDÊNCIA|NaN|undefined/)
    }
  })
}

test("mapper retains every supported persisted form independently of absent market trend", () => {
  for (const form of ["Péssima", "Ruim", "Normal", "Boa", "Excelente"] as const) {
    const player = mapper.mapDatabasePlayer(catalogPlayer({ form }))
    assert.equal(player.form, form)
    assert.equal(player.valueTrend, null)
  }
  assert.equal(mapper.mapDatabasePlayer(catalogPlayer({ form: "unsupported" })).form, null)
})
