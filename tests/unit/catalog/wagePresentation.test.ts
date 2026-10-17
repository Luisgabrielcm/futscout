import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { displaySalary } from "../../../lib/playerCareerPresentation"
import type { VerifiedSalary } from "../../../types/playerCareer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { formatCurrency } from "../../../utils/formatCurrency"

const { default: Career } = loadCatalogModule<typeof import("../../../app/components/PlayerCareer")>("app/components/PlayerCareer.tsx", {})
const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
  "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
})
const observed: VerifiedSalary = {
  amount: 1234.56, currency: "EUR", period: "week", source: "Synthetic public salary source",
  nature: "OBSERVED", publicationAllowed: true,
}

for (const locale of ["pt", "en"] as const) {
  const render = (salary?: VerifiedSalary | null) => {
    const profile = renderToStaticMarkup(createElement(Career, {
      locale, catalogClub: "EA fixture club", data: { source: "synthetic career source", salary },
    }))
    const card = renderToStaticMarkup(createElement(Card, {
      ...mapDatabasePlayer(catalogPlayer()), club: null, locale, salary,
    }))
    return { profile, card }
  }

  test(`${locale}: authorized observed salary preserves amount, period and its own public source`, () => {
    const { profile, card } = render(observed)
    for (const html of [profile, card]) {
      assert.match(html, locale === "pt" ? /1\.234,56/ : /1,234\.56/)
      assert.match(html, locale === "pt" ? /\/ semana/ : /\/ week/)
      assert.match(html, locale === "pt" ? /Salário observado/ : /Observed salary/)
      assert.match(html, /Synthetic public salary source/)
      assert.doesNotMatch(html, /Salary source: synthetic career source|Fonte do salário: synthetic career source/)
    }
    assert.match(displaySalary({ ...observed, period: "year", currency: "USD" }, locale)!, locale === "pt" ? /\/ ano$/ : /\/ year$/)
    assert.ok(displaySalary({ ...observed, amount: 0 }, locale))
  })

  test(`${locale}: absent or unauthorized salaries stay unavailable and never leak their amount or source`, () => {
    for (const candidate of [undefined, null, { ...observed, publicationAllowed: false },
      { ...observed, nature: undefined } as unknown as VerifiedSalary,
      { ...observed, publicationAllowed: undefined } as unknown as VerifiedSalary,
      { ...observed, source: "" }]) {
      assert.equal(displaySalary(candidate, locale), null)
      const { profile, card } = render(candidate)
      assert.match(profile, locale === "pt" ? /Salário observado verificado indisponível/ : /Verified observed salary unavailable/)
      assert.match(profile, locale === "pt" ? /Estimativa FutScout indisponível/ : /FutScout estimate unavailable/)
      for (const html of [profile, card]) assert.doesNotMatch(html, /1[.,]234|Synthetic public salary source/)
    }
  })

  test(`${locale}: provider and FutScout estimates cannot be relabeled as observed or published by a permission flag`, () => {
    for (const nature of ["PROVIDER_ESTIMATE", "FUTSCOUT_ESTIMATE"] as const) {
      const estimate = { ...observed, nature }
      assert.equal(displaySalary(estimate, locale), null)
      const { profile, card } = render(estimate)
      for (const html of [profile, card]) assert.doesNotMatch(html, /1[.,]234|Synthetic public salary source/)
    }
  })
}

test("invalid salary values, units and malformed provenance fail closed without conversion or fallback", () => {
  for (const patch of [{ amount: NaN }, { amount: Infinity }, { amount: -1 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "ZZZ" }, { currency: "eur" }, { period: "month" }, { source: undefined }, { nature: "EA_CAREER" }]) {
    assert.equal(displaySalary({ ...observed, ...patch } as VerifiedSalary, "en"), null)
  }
})

test("public salary source is escaped as text", () => {
  const html = renderToStaticMarkup(createElement(Career, {
    locale: "en", catalogClub: null, data: { source: "synthetic", salary: { ...observed, source: "<script>synthetic</script>" } },
  }))
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;synthetic&lt;\/script&gt;/)
})
