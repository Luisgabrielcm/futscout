import assert from "node:assert/strict"
import { test } from "node:test"
import { Prisma } from "../../../app/generated/prisma/client"
import { countMarketValuePlayer, emptyMarketValueCoverage } from "../../../lib/economicData/coverage"

function player(amount: string | null, patch: Record<string, unknown> = {}) {
  return { economicCurrents: [{ observation: { observedAt: new Date("2026-10-17T00:00:00Z"), state: {
    field: "MARKET_VALUE", context: "REAL_WORLD", provider: "LIVE_FOOTBALL",
    presence: amount === null ? "NULL" : "VALUE", amount: amount === null ? null : new Prisma.Decimal(amount),
    currency: "EUR", confidence: "HIGH", matchState: "MATCHED", status: amount === null ? "MISSING" : "VALID",
    ...patch,
  } } }] }
}

test("counts published positive, explicit null, unavailable and rejected without offline receipts", () => {
  const total = emptyMarketValueCoverage()
  for (const row of [player("100.00"), player(null), { economicCurrents: [] }, player("50.00", { confidence: "LOW" }),
    player("25.00", { currency: "USD" }), player("0.00")]) countMarketValuePlayer(total, row)
  assert.deepEqual(total, { players: 6, positiveEligible: 1, zeroEligible: 1, explicitNull: 1,
    unavailable: 1, rejectedCurrent: 2 })
})

test("malformed null and invalid monetary values are rejected, not reported as published", () => {
  const total = emptyMarketValueCoverage()
  for (const row of [player(null, { confidence: "LOW" }), player(null, { presence: "ABSENT" }),
    player("-1"), player("9007199254740992"), player("1", { status: "REJECTED" })]) countMarketValuePlayer(total, row)
  assert.equal(total.rejectedCurrent, 5)
  assert.equal(total.explicitNull, 0)
  assert.equal(total.positiveEligible, 0)
})
