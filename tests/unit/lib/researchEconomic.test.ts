import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { formatResearchContract, parseResearchPayload, prepareResearchCommand, researchFixedSalary, researchWage } from "../../../lib/researchEconomic"
import { publicClause, publicContractUntil, publicEconomicOverlay } from "../../../lib/publicEconomicOverlay"
import { wagePresentation } from "../../../lib/wagePublication"

const base = { playerId: "p", eaId: "123", clubId: "c", sourceUrl: "https://example.test/a",
  sourcePublishedOn: "2026-11-01", capturedOn: "2026-11-08", classification: "OFFICIAL" as const,
  field: "CONTRACT" as const, action: "PUBLISH" as const, requestId: randomUUID(), expectedHeadRevision: 0 }

test("research evidence validates precision, provenance and salary composition", () => {
  assert.equal(formatResearchContract({ until: "2030", precision: "YEAR" }, "pt"), "2030")
  assert.equal(formatResearchContract({ until: "2030-06", precision: "MONTH" }, "pt"), "06/2030")
  assert.throws(() => parseResearchPayload("CONTRACT", "PUBLISH", { until: "2030-02-31", precision: "DAY" }))
  assert.throws(() => parseResearchPayload("SALARY", "PUBLISH", { weeklyEur: "500", taxType: "GROSS", composition: "BASE" }))
  assert.deepEqual(parseResearchPayload("SALARY", "RECORD", { weeklyAmount: "500", currency: "EUR", taxType: "GROSS", composition: "BASE" }),
    { weeklyAmount: "500", currency: "EUR", taxType: "GROSS", composition: "BASE" })
  assert.deepEqual(parseResearchPayload("SALARY", "PUBLISH", { weeklyAmount: "500", currency: "EUR", taxType: "GROSS", composition: "BASE" }),
    { weeklyAmount: "500", currency: "EUR", taxType: "GROSS", composition: "BASE" })
  assert.throws(() => parseResearchPayload("SALARY", "PUBLISH", { weeklyAmount: "500", currency: "EUR", taxType: "NET", composition: "BASE" }))
  assert.throws(() => prepareResearchCommand({ ...base, sourceUrl: "http://example.test", payload: { until: "2030", precision: "YEAR" } }))
  const first = prepareResearchCommand({ ...base, payload: { until: "2030", precision: "YEAR" } })
  const second = prepareResearchCommand({ ...base, payload: { precision: "YEAR", until: "2030" } })
  assert.equal(first.requestHash, second.requestHash)
})

test("manual values dominate researched contract, clause and wage", () => {
  const research = { contract: { until: "2030", precision: "YEAR" as const },
    clause: { status: "YES" as const, amount: "1000000", currency: "EUR", conditions: null, validUntil: null },
    salary: { value: { weeklyEur: "1000", taxType: "GROSS" as const, composition: "TOTAL" as const },
      classification: "REPORTED" as const, sourceUrl: "https://example.test/a", sourcePublishedOn: "2026-11-01" } }
  const manual = { revisions: { CONTRACT: 1, CLAUSE: 1 },
    contract: { start: null, until: "2029-06-30", renewed: null },
    clause: { status: "NO" as const, amount: null, currency: null, conditions: null, validUntil: null } }
  const merged = publicEconomicOverlay(manual, research)
  assert.equal(publicContractUntil(merged, "pt"), "30/06/2029")
  assert.equal(publicClause(merged, "pt"), "Sem cláusula")
  assert.equal(publicContractUntil(publicEconomicOverlay(undefined, research), "pt"), "2030")
  const wage = researchWage("p", research)
  assert.match(wagePresentation(wage, "p", "pt")?.label ?? "", /pesquisado/)
  assert.equal(wagePresentation(wage, "wrong", "pt"), null)
  assert.equal(researchWage("p", { salary: { ...research.salary, value: { ...research.salary.value, composition: "BASE" } } }), undefined)
  const fixed = { salary: { value: { weeklyAmount: "300577", currency: "EUR" as const,
    taxType: "GROSS" as const, composition: "BASE" as const }, sourceUrl: "https://example.test/a",
    classification: "ESTIMATED" as const, sourcePublishedOn: null } }
  assert.equal(researchWage("p", fixed), undefined)
  assert.equal(researchFixedSalary(fixed, "pt")?.value, "€ 300.577/semana")
  assert.equal(researchFixedSalary({ salary: { ...fixed.salary, value: { ...fixed.salary.value, taxType: "NET" } } }, "pt"), undefined)
})
