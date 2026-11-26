import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { canReadRealEconomics } from "../lib/realEconomicReadGate"
import { loadCatalogModule } from "./helpers/loadCatalogModule"
import * as overlay from "../lib/publicEconomicOverlay"
import * as research from "../lib/researchEconomic"
import * as wage from "../lib/wagePublication"
import * as visual from "../lib/i18n/visualRevision"

test("real economics is off by default, rejects malformed rollout, and selects exact EA IDs", () => {
  assert.equal(canReadRealEconomics("12", {}), false)
  const on = { REAL_ECONOMICS_READ_ENABLED: "1", REAL_ECONOMICS_READ_EA_IDS: "12,123" }
  assert.equal(canReadRealEconomics("12", on), true)
  assert.equal(canReadRealEconomics("1", on), false)
  for (const raw of ["", "12,12", "12, 13", "012", "12,", Array.from({ length: 1025 }, (_, i) => i + 1).join(",")])
    assert.equal(canReadRealEconomics("12", { ...on, REAL_ECONOMICS_READ_EA_IDS: raw }), false)
  const expanded = { ...on, REAL_ECONOMICS_READ_EA_IDS: Array.from({ length: 297 }, (_, i) => i + 1).join(",") }
  assert.equal(canReadRealEconomics("297", expanded), true)
  assert.equal(canReadRealEconomics("298", expanded), false)
})

function component(enabled: boolean, manual: object | undefined, published: object | undefined) {
  const calls: string[] = []
  const value = loadCatalogModule<{ default: (p: { playerId: string; eaId: string; locale: "pt" | "en" }) => Promise<React.ReactElement | null> }>(
    "app/components/PlayerPublishedEconomics.tsx", {
      "next/server": { connection: async () => { calls.push("connection") } },
      "../../lib/realEconomicReadGate": { canReadRealEconomics: () => enabled },
      "../../lib/i18n/visualRevision": visual,
      "../../lib/publicEconomicOverlay": overlay,
      "../../lib/researchEconomic": research,
      "../../lib/wagePublication": wage,
      "../../services/adminEconomic.server": {
        readManualEconomics: async (ids: string[]) => { assert.deepEqual(Array.from(ids), ["p"]); calls.push("manual"); return new Map([["p", manual]]) },
        manualWage: () => undefined,
      },
      "../../services/researchEconomicRead.server": {
        readResearchEconomics: async (ids: string[]) => { assert.deepEqual(Array.from(ids), ["p"]); calls.push("research"); return new Map([["p", published]]) },
      },
    }, { process: { env: { REAL_ECONOMICS_READ_ENABLED: enabled ? "1" : "0", REAL_ECONOMICS_READ_EA_IDS: "12" } } })
  return { render: value.default, calls }
}

test("excluded profiles perform no economic queries", async () => {
  const c = component(false, undefined, undefined)
  assert.equal(await c.render({ playerId: "p", eaId: "12", locale: "pt" }), null)
  assert.deepEqual(c.calls, [])
})

test("REAL reuses published salary, contract and conditional clause; manual contract wins", async () => {
  const c = component(true, { contract: { until: "2030", precision: "YEAR" } }, {
    salary: { value: { weeklyAmount: "1000", weeklyEur: "1000", currency: "EUR", taxType: "GROSS", composition: "BASE", season: "2026-2027", fx: null }, sourceUrl: "https://example.com/evidence", classification: "ESTIMATED", sourcePublishedOn: null },
    contract: { until: "2028", precision: "YEAR" },
    clause: { status: "YES", amount: "65000000", currency: "EUR", conditions: "Somente a partir do verão de 2027", validUntil: null },
  })
  const markup = renderToStaticMarkup(await c.render({ playerId: "p", eaId: "12", locale: "pt" }))
  assert.match(markup, /1\.000\/semana/)
  assert.match(markup, /2030/)
  assert.doesNotMatch(markup, /2028/)
  assert.match(markup, /65\.000\.000/)
  assert.match(markup, /Somente a partir do verão de 2027/)
  assert.deepEqual(c.calls, ["connection", "manual", "research"])
})

test("missing data stays absent and does not become zero or no clause", async () => {
  const c = component(true, undefined, undefined)
  const markup = renderToStaticMarkup(await c.render({ playerId: "p", eaId: "12", locale: "pt" }))
  assert.doesNotMatch(markup, /Sem cláusula|€ 0/)
  assert.match(markup, /—/)
})

test("REAL renders original-currency salary without overriding a manual salary or fabricating FX", async () => {
  const published = { salary: { value: { weeklyAmount: "1250", currency: "BRL", taxType: "UNKNOWN", composition: "UNKNOWN" },
    sourceUrl: "https://example.com/evidence", classification: "ESTIMATED", sourcePublishedOn: null } }
  const shown = component(true, undefined, published)
  const markup = renderToStaticMarkup(await shown.render({ playerId: "p", eaId: "12", locale: "pt" }))
  assert.match(markup, /R\$ 1\.250\/semana/)
  assert.match(markup, /sem conversão/)
  assert.doesNotMatch(markup, /€ 1\.250|bônus excluídos/)
  const manual = component(true, { salary: { weeklyEur: "10" } }, published)
  assert.doesNotMatch(renderToStaticMarkup(await manual.render({ playerId: "p", eaId: "12", locale: "pt" })), /R\$/)
})
