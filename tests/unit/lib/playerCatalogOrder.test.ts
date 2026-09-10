import assert from "node:assert/strict"
import { test } from "node:test"
import { getPlayerOrderBy } from "../../../lib/playerCatalogOrder"
import { PLAYER_SORTS, type PlayerSort } from "../../../lib/playerCatalogParams"

const expectedPrimary = {
  "overall-desc": { officialOverall: "desc" },
  "overall-asc": { officialOverall: "asc" },
  "potential-desc": { potential: { sort: "desc", nulls: "last" } },
  "age-asc": { dateOfBirth: { sort: "desc", nulls: "last" } },
  "pace-desc": { attributes: { pace: "desc" } },
  "passing-desc": { attributes: { passing: "desc" } },
  "dribbling-desc": { attributes: { dribbling: "desc" } },
  "value-asc": { marketValue: { sort: "asc", nulls: "last" } },
  "value-desc": { marketValue: { sort: "desc", nulls: "last" } },
  "position-asc": { position: "asc" },
  "name-asc": { name: "asc" },
  "name-desc": { name: "desc" },
} satisfies Record<PlayerSort, object>

for (const sort of PLAYER_SORTS) {
  test(sort + " preserves existing ordering and ends with unique ID", () => {
    const order = getPlayerOrderBy(sort)
    const oldOrder = [expectedPrimary[sort]]
    if (!sort.startsWith("name-")) {
      if (!sort.startsWith("overall-")) oldOrder.push({ officialOverall: "desc" })
      oldOrder.push({ name: "asc" })
    }
    assert.deepEqual(order, [...oldOrder, { id: "asc" }])
  })
}
