import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateClubRating, compareRatedClubs } from "../../../lib/clubRating"
import { countryName, entityHref, nationalityHref, nationalityKey, relatedPlayersHref } from "../../../lib/connectedNavigation"
import { parsePlayerCatalogParams, playerCatalogQuery, removePlayerCatalogFilter } from "../../../lib/playerCatalogParams"
import { directoryHref, parseDirectoryParams } from "../../../lib/directoryCatalogParams"

test("rating uses player-weighted means; GK never increases outfield rating", () => {
  const result = calculateClubRating([{ position: "ATA", count: 1, totalOverall: 90 }, { position: "MC", count: 3, totalOverall: 210 }, { position: "GOL", count: 2, totalOverall: 198 }], 6)
  assert.deepEqual(result, { overall: 75, goalkeeper: 99, rated: 6, total: 6 })
})
test("rating does not inflate with roster size and preserves decimal precision", () => {
  const one = calculateClubRating([{ position: "MC", count: 4, totalOverall: 293 }], 4)
  const many = calculateClubRating([{ position: "MC", count: 40, totalOverall: 2930 }], 40)
  assert.equal(one.overall, many.overall)
})
test("rating rejects invalid values and unknown positions, showing partial coverage", () => {
  const result = calculateClubRating([{ position: "MC", count: 1, totalOverall: 0 }, { position: "ATA", count: 2, totalOverall: NaN }, { position: "???", count: 1, totalOverall: 99 }], 4)
  assert.deepEqual(result, { overall: 0, goalkeeper: null, rated: 1, total: 4 })
  assert.equal(calculateClubRating([], 0).overall, null)
  assert.equal(calculateClubRating([{ position: "GOL", count: 1, totalOverall: 80 }], 1).overall, null)
})

test("equivalent rosters yield identical ratings regardless of positional grouping/order", () => {
  const groups = [{ position: "MC", count: 3, totalOverall: 241 }, { position: "ATA", count: 4, totalOverall: 319 }]
  assert.equal(calculateClubRating(groups, 7).overall, calculateClubRating([...groups].reverse(), 7).overall)
  assert.equal(calculateClubRating(groups, 7).overall, calculateClubRating([{ position: "MC", count: 7, totalOverall: 560 }], 7).overall)
})
test("best order uses full precision then name then id, null last, zero not null", () => {
  const c = (id: string, name: string, overall: number | null) => ({ id, name, rating: { overall, goalkeeper: null, rated: 1, total: 1 } })
  assert.deepEqual([c("b", "B", 75.11), c("n", "A", null), c("z", "A", 0), c("2", "A", 75.12), c("1", "A", 75.12)].sort(compareRatedClubs).map(c => c.id), ["1", "2", "b", "z", "n"])
})
test("localized entity links require persisted slugs, safely encode segments", () => {
  assert.equal(entityHref("en", "clubes", "actual-slug"), "/en/clubes/actual-slug")
  assert.equal(entityHref("pt", "ligas", null), null)
  assert.equal(entityHref("pt", "clubes", "a/b?c"), "/pt/clubes/a%2Fb%3Fc")
})
test("country aliases converge without official-team claims or merging Congo/DR Congo", () => {
  assert.equal(nationalityKey("Espanha"), nationalityKey("Spain"))
  assert.equal(nationalityHref("en", "Spain"), "/en/selecoes/es")
  assert.equal(countryName("Spain", "pt"), "Espanha")
  assert.notEqual(nationalityKey("Congo"), nationalityKey("Congo DR"))
})
test("contextual filters preserve zero and locale and do not create potential detail routes", () => {
  assert.equal(relatedPlayersHref("pt", { minPotential: 0 }), "/pt/jogadores?minPotential=0")
  assert.equal(relatedPlayersHref("en", { minOverall: 90 }), "/en/jogadores?minOverall=90")
})
test("PlayStyle allowlist accepts all supported codes and rejects arbitrary input/Plus without key", () => {
  assert.equal(parsePlayerCatalogParams({ playStyle: "tiki-taka", playStyleLevel: "plus" }).playStyleLevel, "plus")
  assert.equal(parsePlayerCatalogParams({ playStyle: "intercept" }).playStyle, "intercept")
  assert.equal(parsePlayerCatalogParams({ playStyle: "not-a-style", playStyleLevel: "plus" }).playStyle, undefined)
  assert.equal(parsePlayerCatalogParams({ playStyleLevel: "plus" }).playStyleLevel, undefined)
  const query = playerCatalogQuery({ playStyle: "tiki-taka", playStyleLevel: "plus", page: 2, minOverall: 80 })
  assert.match(query, /page=2/)
  assert.match(query, /playStyleLevel=plus/)
  assert.doesNotMatch(removePlayerCatalogFilter({ playStyle: "tiki-taka", playStyleLevel: "plus", page: 2 }, "playStyle"), /playStyle|page=/)
})
test("directory URL preserves league, search, page and allowlisted sorting", () => {
  assert.equal(parseDirectoryParams({ sort: "arbitrary" }).sort, "name-asc")
  assert.equal(directoryHref("/en/clubes", { search: "City", league: "premier", sort: "best", page: 2 }), "/en/clubes?search=City&league=premier&page=2&sort=best")
})
