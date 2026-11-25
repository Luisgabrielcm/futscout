import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { zeroGameFreeAgentEconomics, publicClause, publicContractUntil } from "../../../lib/publicEconomicOverlay"
import { jointTransferViews } from "../../../lib/jointTransferContexts"
import { freeAgentFixture, jointFixture } from "../../fixtures/jointTransfer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { formatCurrency } from "../../../utils/formatCurrency"
import * as comparison from "../../../lib/playerComparison"
import type { PublishedWage } from "../../../lib/wagePublication"

const payload = freeAgentFixture(), views = jointTransferViews(payload, "2026-11-16")
const player = { ...mapDatabasePlayer(catalogPlayer({ marketValue: BigInt(765432) })), transferContexts: views }
const wage: PublishedWage = { playerId: player.id, weeklyEur: 123456, kind: "MANUAL", source: "FutScout", period: null, confidence: "LOW", contractVerified: false,
  classification: { taxType: "GROSS", composition: "BASE", method: "MANUAL_ENTRY" } }
const economic = { contract: { until: "2031", precision: "YEAR" as const }, clause: { status: "YES" as const, amount: "98765432", currency: "EUR", conditions: "Synthetic REAL clause condition", validUntil: null } }
const deps = { "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference: () => null }, "./PlayerActions": () => null }
const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", deps)
const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", deps)

test("only positive GAME free agency plus a confirmed REAL club zeros the GAME display", () => {
  assert.equal(zeroGameFreeAgentEconomics(player), true)
  assert.equal(zeroGameFreeAgentEconomics(player, "REAL"), false)
  assert.equal(zeroGameFreeAgentEconomics({ transferContexts: { ...views, real: null } }), false)
  for (const state of ["UNKNOWN", "NOT_IN_SQUAD", "FREE_AGENT", "RETIRED"] as const)
    assert.equal(zeroGameFreeAgentEconomics({ transferContexts: { ...views, real: { ...views.real!, clubState: state, playingClub: null } } }), false)
  assert.equal(zeroGameFreeAgentEconomics({ transferContexts: { ...views, game: null } }), false)
  assert.equal(zeroGameFreeAgentEconomics({ transferContexts: jointTransferViews(jointFixture(), "2026-11-16") }), false)
  assert.equal(zeroGameFreeAgentEconomics({}), false)
})

test("native NG-FA with a confirmed REAL club uses the same rule without assuming real unemployment", () => {
  assert.equal(zeroGameFreeAgentEconomics({ clubContexts: payload }), true)
  assert.equal(zeroGameFreeAgentEconomics({ clubContexts: { ...payload, real: null } }), false)
  assert.equal(zeroGameFreeAgentEconomics({ clubContexts: { ...payload, real: { ...payload.real!, status: "FREE_AGENT", club: null } } }), false)
  assert.equal(zeroGameFreeAgentEconomics({ clubContexts: payload }, "REAL"), false)
})

for (const locale of ["pt", "en"] as const) test(`${locale}: profile zeros three GAME fields and hides REAL wage alternatives and clause conditions`, () => {
  const before = structuredClone({ player, wage, economic })
  const html = renderToStaticMarkup(createElement(Header, { player, locale, wage, economicOverlay: economic,
    fixedSalary: { title: "Synthetic REAL alternate wage", value: "888888", detail: "Synthetic REAL detail", sourceUrl: "https://example.invalid/real-wage" } }))
  assert.match(html, /data-game-economics="free-agent-zeroed"/)
  assert.equal((html.match(/€0/g) ?? []).length, 2)
  assert.match(html, /<dd>0<\/dd>/)
  assert.doesNotMatch(html, /123[.,]456|888888|2031|98[.,]765[.,]432|Synthetic REAL|real-wage/)
  assert.match(html, /765[.,]432/)
  assert.deepEqual({ player, wage, economic }, before)
  assert.equal(publicContractUntil(economic, locale), "2031")
  assert.match(publicClause(economic, locale), /98[.,]765[.,]432/)
})

test("cards preserve REAL wages while GAME cards ignore every wage source", () => {
  for (const transferContext of ["GAME", "REAL"] as const) {
    const html = renderToStaticMarkup(createElement(Card, { ...player, club: "Legacy", wage, transferContext,
      salary: { amount: 888888, currency: "EUR", period: "week", source: "Synthetic REAL wage source", nature: "OBSERVED", publicationAllowed: true } }))
    if (transferContext === "GAME") { assert.match(html, /free-agent-zeroed/); assert.match(html, /€0/); assert.doesNotMatch(html, /123[.,]456|888[.,]888|Synthetic REAL/)}
    else { assert.doesNotMatch(html, /free-agent-zeroed/); assert.match(html, /123[.,]456/) }
  }
})

test("unknown GAME and actual real free agents preserve their existing economic presentation", () => {
  const actualFree = { ...views, real: { ...views.real!, clubState: "FREE_AGENT" as const, playingClub: null } }
  for (const transferContexts of [actualFree, { ...views, game: { ...views.game!, clubState: "UNKNOWN" as const } }]) {
    const html = renderToStaticMarkup(createElement(Header, { player: { ...player, transferContexts }, wage, economicOverlay: economic }))
    assert.doesNotMatch(html, /free-agent-zeroed/); assert.match(html, /123\.456/); assert.match(html, /2031/)
  }
})

test("comparison zeros only GAME wages and preserves market value and input records", () => {
  const { default: Comparison } = loadCatalogModule<typeof import("../../../app/components/PlayerComparison")>("app/components/PlayerComparison.tsx", { ...deps, "../../lib/playerComparison": comparison })
  const selected = { ...player, club: "Legacy", wage, transferContext: "GAME" as const, attributes: null, valueTrend: null }
  const inputs = [selected, { ...selected, id: "control", wage: { ...wage, playerId: "control" }, transferContexts: undefined }] as const
  const before = structuredClone(inputs)
  const html = renderToStaticMarkup(createElement(Comparison, { players: [...inputs] }))
  assert.equal((html.match(/data-game-economics="free-agent-zeroed"/g) ?? []).length, 1)
  assert.match(html, /€0/); assert.match(html, /123\.456/); assert.match(html, /765\.432/)
  assert.deepEqual(inputs, before)
})
