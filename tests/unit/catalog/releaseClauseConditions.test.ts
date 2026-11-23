import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { formatCurrency } from "../../../utils/formatCurrency"
import type { ClausePayload } from "../../../lib/adminEconomic"

const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
  "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference: () => null },
})
const player = mapDatabasePlayer(catalogPlayer())
const render = (clause?: ClausePayload, locale: "pt" | "en" = "pt") => renderToStaticMarkup(createElement(Header,
  { player, locale, economicOverlay: clause ? { clause } : undefined }))

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: a conditional clause displays its amount together with its future window and restrictions`, () => {
    const conditions = "Faixa reportada €50–60 milhões; valor selecionado €60 milhões. Somente no verão europeu de 2027, para clubes elegíveis; não no inverno."
    const html = render({ status: "YES", amount: "60000000", currency: "EUR", conditions, validUntil: null }, locale)
    assert.match(html, /60[.,]000[.,]000/)
    assert.match(html, /releaseClauseConditions/)
    assert.match(html, /50–60 milhões/)
    assert.match(html, /verão europeu de 2027/)
    assert.match(html, /não no inverno/)
    assert.match(html, /clubes elegíveis/)
  })
  test(`${locale}: absent, unknown and unconditional clauses keep their existing presentation`, () => {
    for (const status of ["NO", "UNKNOWN"] as const) {
      const html = render({ status, amount: null, currency: null, conditions: null, validUntil: null }, locale)
      assert.doesNotMatch(html, /releaseClauseConditions/)
      if (status === "NO") assert.match(html, locale === "pt" ? /Sem cláusula/ : /No clause/)
    }
    assert.doesNotMatch(render(undefined, locale), /releaseClauseConditions/)
    assert.doesNotMatch(render({ status: "YES", amount: "1000000", currency: "EUR", conditions: null, validUntil: null }, locale), /releaseClauseConditions/)
  })
}
test("clause conditions are escaped as text", () => {
  const html = render({ status: "YES", amount: "60000000", currency: "EUR", conditions: "<script>unsafe()</script>", validUntil: null })
  assert.doesNotMatch(html, /<script>unsafe/)
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/)
})
