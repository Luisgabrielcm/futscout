import assert from "node:assert/strict"
import { test } from "node:test"
import { directoryHref, directoryPagination, displayCountry, parseDirectoryParams } from "../../../lib/directoryCatalogParams"

test("directory rejects unsafe pages and keeps a fixed size", () => {
  for (const page of ["no", "1.5", "-2", "Infinity", 1e100, [], {}]) {
    assert.equal(parseDirectoryParams({ page }).page, 1)
    assert.equal(parseDirectoryParams({ page }).pageSize, 24)
  }
})

test("directory uses first repeated value, trims search and caps text", () => {
  assert.deepEqual(parseDirectoryParams({ page: ["2", "3"], search: ["  Real  ", "Other"], league: " liga " }),
    { page: 2, pageSize: 24, search: "Real", league: "liga", sort: "name-asc" })
  assert.equal(parseDirectoryParams({ search: "a".repeat(300) }).search?.length, 200)
})

test("directory URLs retain only safe filters and reset page without losing filters", () => {
  assert.equal(directoryHref("/clubes", { search: " Real & Test ", league: "liga", page: 2 }),
    "/clubes?search=Real+%26+Test&league=liga&page=2")
  assert.equal(directoryHref("/clubes", { page: -1 }), "/clubes")
  assert.equal(directoryHref("/clubes", { search: "Real", page: 1 }), "/clubes?search=Real")
})

test("directory page totals cover empty and incomplete last pages", () => {
  assert.equal(directoryPagination(0, 1).totalPages, 1)
  assert.equal(directoryPagination(24, 1).totalPages, 1)
  assert.equal(directoryPagination(25, 2).totalPages, 2)
})

test("country does not expose the EA sync placeholder or invent a replacement", () => {
  for (const country of ["", "  ", "Não informado", " UNKNOWN ", "N/A"]) {
    assert.equal(displayCountry(country), null)
  }
  assert.equal(displayCountry(" Brasil "), "Brasil")
})
