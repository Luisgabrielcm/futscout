import assert from "node:assert/strict"
import { test } from "node:test"
import type { Prisma } from "../../../app/generated/prisma/client"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

function serviceFixture(row: mapper.DatabasePlayer | null = null) {
  const reads: Prisma.PlayerFindManyArgs[] = []
  const service = loadCatalogModule<typeof import("../../../services/playerService")>(
    "services/playerService.ts", {
      "server-only": {},
      "../lib/prisma": { prisma: { player: {
        count: async () => 0,
        findMany: async (args: Prisma.PlayerFindManyArgs) => { reads.push(args); return [] },
        findUnique: async () => row,
      } } },
      "../mappers/mapDatabasePlayer": mapper,
      "../lib/playerCatalogParams": params,
      "../lib/playerCatalogOrder": order,
      "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
    },
  )
  return { service, reads }
}

test("service independently rejects invalid numbers before constructing Prisma filters", async () => {
  const { service, reads } = serviceFixture()
  const result = await service.getPlayers({
    maxValue: 1.5, maxAge: Infinity, minPace: NaN, minOverall: -1, page: 1e100, pageSize: 1000,
  })
  assert.equal(result.page, 1)
  assert.equal(result.pageSize, 24)
  assert.equal(reads[0].skip, 0)
  assert.equal(reads[0].take, 24)
  assert.equal(reads[0].where?.marketValue, undefined)
  assert.equal(reads[0].where?.dateOfBirth, undefined)
  assert.equal(reads[0].where?.officialOverall, undefined)
})

test("valid service filters preserve BigInt, pagination and deterministic sort", async () => {
  const { service, reads } = serviceFixture()
  await service.getPlayers({ maxValue: 20_000_000, page: 3, pageSize: 24, sort: "pace-desc" })
  const valueFilter = reads[0].where?.marketValue
  if (!valueFilter || typeof valueFilter !== "object") assert.fail("expected value filter")
  assert.deepEqual(Object.keys(valueFilter), ["lte"])
  assert.equal(valueFilter.lte, BigInt(20_000_000))
  assert.equal(reads[0].skip, 48)
  assert.equal(reads[0].take, 24)
  assert.deepEqual(reads[0].orderBy, order.getPlayerOrderBy("pace-desc"))
})

test("slug lookup distinguishes absent player from incomplete record", async () => {
  assert.equal(await serviceFixture().service.getPlayerBySlug("absent"), null)
  assert.deepEqual(
    await serviceFixture(catalogPlayer({ attributes: null })).service.getPlayerBySlug("fixture"),
    { status: "incomplete", name: "Jogador de teste" },
  )
})
