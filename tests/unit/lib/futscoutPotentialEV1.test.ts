import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { calculateFutscoutPotentialEV1 } from "../../../lib/futscoutPotential/modelEV1"
import { FUTSCOUT_POTENTIAL_E_V1 } from "../../../lib/futscoutPotential/types"
import type { FutscoutPotentialInput, FutscoutPotentialResult } from "../../../lib/futscoutPotential/types"

type Success = Extract<FutscoutPotentialResult, { status: "EXPERIMENTAL" }>
type GoldenCase = {
  id: string
  group: string
  input: FutscoutPotentialInput
  expected: Omit<Success, "modelVersion" | "monthly"> & { monthly: number[][] }
}
const fixture: { modelVersion: string; absoluteTolerance: number; cases: GoldenCase[] } = JSON.parse(
  readFileSync(new URL("../../fixtures/futscoutPotential/model-e-v1.json", import.meta.url), "utf8"),
)

function valid(input: FutscoutPotentialInput): Success {
  const result = calculateFutscoutPotentialEV1(input)
  assert.equal(result.status, "EXPERIMENTAL")
  return result
}

function compare(c: GoldenCase): number {
  const result = valid(c.input)
  assert.equal(result.modelVersion, "potential-model-e-v1")
  assert.equal(result.role, c.expected.role)
  assert.equal(result.potential.rounded, c.expected.potential.rounded)
  assert.equal(result.potential.season, c.expected.potential.season)
  let error = 0
  function near(actual: number, expected: number) {
    assert.ok(Number.isFinite(actual) && Number.isFinite(expected))
    const difference = Math.abs(actual - expected)
    error = Math.max(error, difference)
    // Frozen spec: 1e-10 absolute; no relative tolerance that widens near 99.
    assert.ok(difference <= 1e-10, `${c.id}: ${actual} != ${expected}`)
  }
  near(result.potential.raw, c.expected.potential.raw)
  assert.equal(result.seasons.length, 11)
  assert.equal(result.monthly.length, 120)
  result.seasons.forEach((season, i) => {
    const expected = c.expected.seasons[i]
    assert.equal(season.season, expected.season)
    assert.equal(season.rounded, expected.rounded)
    for (const key of ["age", "level", "growth", "decline", "clampAdjustment"] as const) near(season[key], expected[key])
  })
  result.monthly.forEach((month, i) => {
    const values = [month.month, month.time, month.age, month.previous, month.growth, month.decline, month.preClamp, month.bounded]
    assert.equal(values[0], c.expected.monthly[i][0])
    values.forEach((value, k) => near(value, c.expected.monthly[i][k]))
  })
  return error
}

test("fixture version, 325 frozen cases + 24 probes, unique keys and all boundaries", () => {
  assert.equal(fixture.modelVersion, FUTSCOUT_POTENTIAL_E_V1)
  assert.equal(fixture.absoluteTolerance, 1e-10)
  assert.equal(fixture.cases.length, 349)
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, 349)
  assert.equal(fixture.cases.filter(c => c.group === "real").length, 19)
  assert.equal(fixture.cases.filter(c => c.group === "boundary").length, 24)
  for (const age of [22, 23, 25, 27]) {
    for (const delta of [-1e-6, 0, 1e-6]) {
      for (const position of ["MC", "GOL"]) {
        assert.ok(fixture.cases.some(c => c.group === "boundary" && c.input.age === age + delta && c.input.position === position))
      }
    }
  }
})

for (const c of fixture.cases) test(`E-v1 golden ${c.id}`, () => { compare(c) })

test("report maximum observed raw error without rounding away differences", t => {
  const maximum = Math.max(...fixture.cases.map(compare))
  t.diagnostic(`349 cases; maximum absolute error across potential, annual and monthly numbers: ${maximum}`)
})

test("both roles deterministic, inputs untouched and outputs do not share state", () => {
  for (const position of ["MC", "GOL"]) {
    const input = Object.freeze({ age: 23.2, overall: 89, position })
    const before = { ...input }
    const a = valid(input)
    const b = valid(input)
    assert.deepEqual(a, b)
    assert.deepEqual(input, before)
    assert.notStrictEqual(a.seasons, b.seasons)
    assert.notStrictEqual(a.monthly, b.monthly)
    assert.notStrictEqual(a.potential, b.potential)
    assert.equal(a.role, position === "GOL" ? "goalkeeper" : "outfield")
  }
})

test("primary position only determines GK vs outfield; recognized codes are not player rules", () => {
  const line = valid({ age: 23, overall: 89, position: "MC" })
  for (const position of ["ZAG", "LD", "LE", "ALA", "VOL", "MEI", "MD", "ME", "PD", "PE", "SA", "ATA"]) {
    assert.deepEqual(valid({ age: 23, overall: 89, position }), line)
  }
  assert.notDeepEqual(valid({ age: 23, overall: 89, position: "GOL" }), line)
})

test("invalid or missing inputs never produce a numeric estimate; finite endpoints and fractional OVR accepted", () => {
  for (const input of [null, undefined, {}, { age: 22 },
    ...[-1, 100.1, NaN, Infinity, -Infinity, "22"].map(age => ({ age, overall: 80, position: "MC" })),
    ...[0, 99.1, NaN, Infinity, "80"].map(overall => ({ age: 22, overall, position: "MC" })),
    ...["GK", "", "mc", null].map(position => ({ age: 22, overall: 80, position })),
  ]) {
    assert.deepEqual(calculateFutscoutPotentialEV1(input as FutscoutPotentialInput), {
      status: "INVALID", modelVersion: FUTSCOUT_POTENTIAL_E_V1,
    })
  }
  for (const age of [0, 100]) for (const overall of [1, 80.25, 99]) valid({ age, overall, position: "GOL" })
})

test("at 99 growth is zero for that step, decline is retained and clipping stays observable", () => {
  const atCeiling = valid({ age: 23, overall: 99, position: "MC" })
  assert.equal(atCeiling.monthly[0].growth, 0)
  assert.ok(atCeiling.monthly[0].decline > 0)
  assert.ok(atCeiling.monthly[0].bounded < 99)
  const clipping = fixture.cases.filter(c => c.expected.monthly.some(m => m[6] > 99))
  assert.ok(clipping.length > 0)
  for (const c of clipping) {
    const result = valid(c.input)
    assert.ok(result.monthly.some(m => m.preClamp > 99 && m.bounded === 99))
    assert.ok(result.seasons.some(s => s.clampAdjustment < 0))
  }
  assert.ok(fixture.cases.some(c => c.expected.potential.rounded === 99 && c.expected.potential.raw < 99))
})

test("decline, lower clamp, annual bookkeeping, first maximum and T0 exclusion", () => {
  const veteran = valid({ age: 40, overall: 85, position: "MC" })
  assert.ok(veteran.potential.raw < 85)
  assert.equal(veteran.potential.season, 1)
  const floor = valid({ age: 100, overall: 1, position: "GOL" })
  assert.equal(floor.potential.raw, 1)
  assert.equal(floor.potential.season, 1)
  assert.ok(floor.monthly.some(m => m.preClamp < 1 && m.bounded === 1))
  for (const c of fixture.cases) {
    const result = valid(c.input)
    const future = result.seasons.slice(1)
    const maximum = Math.max(...future.map(s => s.level))
    assert.equal(result.potential.raw, maximum)
    assert.equal(result.potential.season, future.find(s => s.level === maximum)?.season)
    assert.equal(result.potential.rounded, Math.round(maximum))
    future.forEach((s, i) => {
      assert.ok(Math.abs(s.level - (result.seasons[i].level + s.growth - s.decline + s.clampAdjustment)) <= 1e-10)
      assert.equal(s.level, result.monthly[(i + 1) * 12 - 1].bounded)
    })
  }
})
