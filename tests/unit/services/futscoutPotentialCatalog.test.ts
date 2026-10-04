import assert from "node:assert/strict"
import { test } from "node:test"
import { potentialPageSql, potentialWhere } from "../../../lib/futscoutPotential/catalog"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import { readFutscoutPotential } from "../../../lib/futscoutPotential/read"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

test("SQL orders rounded careerCeiling, null last and stable ties before pagination", () => {
  for (const sort of ["potential-asc", "potential-desc"] as const) {
    const q = potentialPageSql({ sort, minPotential: 88, maxPotential: 96, page: 2, pageSize: 10 })
    assert.match(q.sql, /FLOOR\(GREATEST\(e\."inputOverall",e\."potentialRaw"\) \+ 0\.5\)/)
    assert.match(q.sql, new RegExp(`ORDER BY score ${sort.endsWith("asc") ? "ASC" : "DESC"} NULLS LAST`))
    assert.match(q.sql, /"officialOverall" DESC,name ASC,id ASC\s+LIMIT \? OFFSET \?/)
    assert.deepEqual(q.values.slice(-4), [88, 96, 10, 10])
    assert.doesNotMatch(q.sql, /p\.potential|legacyPotential|potentialRounded/)
  }
})
test("filter uses same half-open rounding boundaries and validity, not legacy", () => {
  const w = potentialWhere(91, 93)
  const serialized = JSON.stringify(w)
  assert.match(serialized, /90\.5/); assert.match(serialized, /93\.5/)
  assert.match(serialized, /EXPERIMENTAL/); assert.match(serialized, /potential-model-e-v1/)
  assert.doesNotMatch(serialized, /"potential":|legacyPotential/)
  assert.equal(readFutscoutPotential({ potential: 99, currentFutscoutPotential: null }).potential, null)
  for (const [ovr, raw, expected] of [[88, 86.57, 88], [89, 91.5, 92], [89, 91.499, 91]]) {
    assert.equal(readFutscoutPotential({ potential: 1, currentFutscoutPotential: { estimate: {
      modelVersion: "potential-model-e-v1", status: "EXPERIMENTAL", inputOverall: ovr, potentialRaw: raw,
    } } }).potential, expected)
  }
})
test("ranking composes all other catalog filters safely", () => {
  const q = potentialPageSql({ search: "a%'", position: "MC", league: "test", minOverall: 80, maxValue: 1000,
    minPace: 70, playStyle: "rapid", playStyleLevel: "plus" }, { clubId: "club", nationalities: ["Spain"] }, new Date("2000-01-01"))
  assert.doesNotMatch(q.sql, /a%'|Spain|rapid/)
  for (const field of ["clubId", "nationality", "secondaryPositions", "dateOfBirth", "marketValue", "PlayerPlayStyle"]) assert.ok(q.sql.includes(field))
  assert.ok(q.values.includes("%a%'%"))
})
test("service reorders only the bounded page, one batch lookup, no N+1", async () => {
  let lists = 0, ranks = 0
  const rows = [catalogPlayer({ id: "b" }), catalogPlayer({ id: "a" })]
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: {
      $queryRaw: async () => { ranks++; return [{ id: "a" }, { id: "b" }] },
      player: { count: async () => 100, findMany: async (args: { where: { id: { in: string[] } } }) => {
        lists++; assert.deepEqual(Array.from(args.where.id.in), ["a", "b"]); return rows
      } },
    } }, "../mappers/mapDatabasePlayer": mapper, "../lib/playerCatalogParams": params,
    "../lib/playerCatalogOrder": order,
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  })
  const page = await service.getPlayers({ sort: "potential-desc", page: 2, pageSize: 2 })
  assert.deepEqual(Array.from(page.players, p => p.id), ["a", "b"])
  assert.equal(page.total, 100); assert.equal(page.totalPages, 50)
  assert.equal(lists, 1); assert.equal(ranks, 1)
})
