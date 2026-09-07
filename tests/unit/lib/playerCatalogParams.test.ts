import assert from "node:assert/strict"
import { test } from "node:test"
import {
  NUMERIC_FILTER_LIMITS,
  parsePlayerCatalogParams,
  playerCatalogQuery,
  removePlayerCatalogFilter,
} from "../../../lib/playerCatalogParams"

test("maxValue decimal is ignored before it can reach BigInt", () => {
  assert.equal(parsePlayerCatalogParams({ maxValue: "1.5" }).maxValue, undefined)
  assert.equal(parsePlayerCatalogParams({ maxValue: 1.5 }).maxValue, undefined)
  const value = parsePlayerCatalogParams({ maxValue: "50000000" }).maxValue
  assert.notEqual(value, undefined)
  if (value === undefined) assert.fail("expected valid integer")
  assert.equal(BigInt(value), BigInt(50_000_000))
})

test("repeated parameters consistently use their first value", () => {
  const parsed = parsePlayerCatalogParams({
    search: [" a ", "b"], page: ["2", "3"], maxAge: ["20", "21"],
    maxValue: ["1.5", "100"], position: ["MC", "GOL"], sort: ["name-desc", "age-asc"],
  })
  assert.equal(parsed.search, "a")
  assert.equal(parsed.page, 2)
  assert.equal(parsed.maxAge, 20)
  assert.equal(parsed.maxValue, undefined)
  assert.equal(parsed.position, "MC")
  assert.equal(parsed.sort, "name-desc")
})

test("empty and malformed arrays do not coerce into scalar values", () => {
  const parsed = parsePlayerCatalogParams({ search: [], maxAge: [[]], page: [undefined, "2"] })
  assert.equal(parsed.search, undefined)
  assert.equal(parsed.maxAge, undefined)
  assert.equal(parsed.page, 1)
})

test("invalid pages safely fall back to one", () => {
  for (const page of ["0", "-1", "1.5", "Infinity", "NaN", "1e100", "", 100_001, NaN]) {
    assert.equal(parsePlayerCatalogParams({ page }).page, 1)
  }
  assert.equal(parsePlayerCatalogParams({ page: "100000" }).page, 100_000)
})

test("page size cannot produce unsafe or unbounded skips", () => {
  for (const pageSize of [0, -1, 101, 1.5, Infinity, NaN]) {
    assert.equal(parsePlayerCatalogParams({ pageSize }).pageSize, 24)
  }
  const parsed = parsePlayerCatalogParams({ page: 100_000, pageSize: 100 })
  assert.equal((parsed.page - 1) * parsed.pageSize, 9_999_900)
})

test("all numeric filters reject non-integers and values outside their domains", () => {
  for (const [key, [min, max]] of Object.entries(NUMERIC_FILTER_LIMITS)) {
    for (const value of [min - 1, max + 1, 1.5, Infinity, NaN, "bad", {}, true, ""]) {
      const parsed = parsePlayerCatalogParams({ [key]: value })
      assert.equal(Object.hasOwn(parsed, key), false, key + ": " + String(value))
    }
  }
})

test("zero and domain boundaries are valid filters, not absent data", () => {
  for (const [key, [min, max]] of Object.entries(NUMERIC_FILTER_LIMITS)) {
    for (const value of [min, max]) {
      const parsed = parsePlayerCatalogParams({ [key]: String(value) })
      assert.equal(Reflect.get(parsed, key), value)
    }
  }
})

test("existing valid filter combinations preserve values", () => {
  const filters = {
    search: " João ", position: "MC", league: "premier-league", maxAge: "23",
    minOverall: "80", minPotential: "85", maxValue: "20000000", minPace: "90",
    minShooting: "75", minPassing: "85", minDribbling: "85",
    minDefending: "60", minPhysical: "70", page: "2", sort: "value-asc",
  }
  const parsed = parsePlayerCatalogParams(filters)
  assert.equal(parsed.search, "João")
  assert.equal(parsed.league, "premier-league")
  assert.equal(parsed.minPassing, 85)
  assert.equal(parsed.maxValue, 20_000_000)
  assert.equal(parsed.sort, "value-asc")
  assert.deepEqual(parsePlayerCatalogParams(Object.fromEntries(new URLSearchParams(playerCatalogQuery(filters)))), parsed)
})

test("invalid position/sort and unknown parameters do not escape to the query", () => {
  const input = { position: "INVALID", sort: "drop-table", unknown: "ignored" }
  assert.equal(parsePlayerCatalogParams(input).position, undefined)
  assert.equal(parsePlayerCatalogParams(input).sort, "overall-desc")
  assert.equal(playerCatalogQuery(input), "")
})

test("canonical pagination preserves valid filters and omits invalid/internal fields", () => {
  const query = new URLSearchParams(playerCatalogQuery({
    search: ["A & B", "ignored"], minPace: "90", page: 3, pageSize: 100, maxValue: "1.5",
  }))
  assert.equal(query.get("search"), "A & B")
  assert.equal(query.get("minPace"), "90")
  assert.equal(query.get("page"), "3")
  assert.equal(query.has("pageSize"), false)
  assert.equal(query.has("maxValue"), false)
})

test("removing an applied chip preserves other applied filters and resets page", () => {
  const query = new URLSearchParams(removePlayerCatalogFilter({
    search: "applied", minPace: 90, league: "bundesliga", page: 4, sort: "name-desc",
  }, "minPace"))
  assert.equal(query.get("search"), "applied")
  assert.equal(query.get("league"), "bundesliga")
  assert.equal(query.get("sort"), "name-desc")
  assert.equal(query.has("minPace"), false)
  assert.equal(query.has("page"), false)
  assert.equal(playerCatalogQuery({}), "")
})

test("non-string search and oversized text cannot break trim or create unbounded text", () => {
  assert.equal(parsePlayerCatalogParams({ search: 42 }).search, undefined)
  assert.equal(parsePlayerCatalogParams({ search: { trim: "bad" } }).search, undefined)
  assert.equal(parsePlayerCatalogParams({ search: "x".repeat(1000) }).search?.length, 200)
})
