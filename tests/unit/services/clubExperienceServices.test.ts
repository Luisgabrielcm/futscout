import assert from "node:assert/strict"
import { test } from "node:test"
import { cache } from "react"
import * as directory from "../../../lib/directoryCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import type { Prisma } from "../../../app/generated/prisma/client"

test("overview shares one compact roster query for XI and full position panel without pagination or joins", async () => {
  const queries: Prisma.PlayerFindManyArgs[] = []
  const rows = [{ id: "p", secondaryPosition: "VOL", secondaryPositions: ["MC"], potential: null, marketValue: BigInt(0) }]
  const service = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma: { player: {
      findMany: async (args: Prisma.PlayerFindManyArgs) => { queries.push(args); return rows },
    } } }, "../lib/directoryCatalogParams": directory, "./playerService": {},
  })
  const result = await service.getClubRoster("one-club")
  assert.equal(queries.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(queries[0].where)), { clubId: "one-club" })
  assert.deepEqual(Object.keys(queries[0].select!).sort(), ["id", "slug", "name", "imageUrl", "position", "officialOverall", "secondaryPosition", "secondaryPositions", "potential", "marketValue"].sort())
  assert.equal(queries[0].take, undefined)
  assert.equal(queries[0].skip, undefined)
  assert.equal(queries[0].include, undefined)
  assert.equal(result[0].potential, null)
  assert.equal(result[0].marketValue, BigInt(0))
})

test("best clubs sorts across all matching club metadata BEFORE pagination, ties deterministic", async () => {
  const queries: Prisma.ClubFindManyArgs[] = []
  const aggregate: Prisma.PlayerGroupByArgs[] = []
  const clubs = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `Club ${String(i).padStart(2, "0")}`, slug: String(i), imageUrl: null, league: { name: "League", slug: "league" }, _count: { players: 1 } }))
  const prisma = { club: {
    count: async () => 25,
    findMany: async (args: Prisma.ClubFindManyArgs) => { queries.push(args); return clubs },
  }, player: { groupBy: async (args: Prisma.PlayerGroupByArgs) => { aggregate.push(args); return clubs.map((club, i) => ({ clubId: club.id, position: "MC", _sum: { officialOverall: i }, _count: { _all: 1 } })) } } }
  const service = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma }, "../lib/directoryCatalogParams": directory, "./playerService": {},
  })
  const result = await service.getClubs({ sort: "best", page: 2, league: "league" })
  assert.deepEqual(JSON.parse(JSON.stringify(result.clubs.map(c => c.id))), ["0"])
  assert.equal(queries[0].take, undefined)
  assert.equal(queries[0].select?.players, undefined)
  assert.equal(aggregate.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(aggregate[0].where)), { clubId: { in: clubs.map(c => c.id) }, officialOverall: { gte: 0, lte: 99 } })
  assert.equal(result.totalPages, 2)
})

test("country grouping normalizes exact aliases, skips null, scopes pages to persisted variants", async () => {
  const calls: unknown[] = []
  const service = loadCatalogModule<typeof import("../../../services/countryService")>("services/countryService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma: { player: { groupBy: async () => [
      { nationality: "Spain", _count: { _all: 2 } }, { nationality: "Espanha", _count: { _all: 1 } }, { nationality: null, _count: { _all: 1 } },
    ] } } }, "./playerService": { getPlayers: async (...args: unknown[]) => { calls.push(args); return {} } },
  })
  const country = await service.getCountry("es")
  assert.equal(country?.total, 3)
  assert.equal(await service.getCountry("not-a-country"), null)
  await service.getCountryPlayers(country!.nationalities, { page: 2, sort: "potential-desc" })
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), [{ page: 2, sort: "potential-desc" }, { nationalities: ["Spain", "Espanha"] }])
})

test("player filters compose secondary positions, search, nationality and PlayStyle+ in count AND list", async () => {
  const counts: Prisma.PlayerCountArgs[] = [], lists: Prisma.PlayerFindManyArgs[] = []
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: {
      count: async (args: Prisma.PlayerCountArgs) => { counts.push(args); return 0 },
      findMany: async (args: Prisma.PlayerFindManyArgs) => { lists.push(args); return [] },
    } } }, "../lib/playerCatalogOrder": order, "../mappers/mapDatabasePlayer": mapper,
  })
  await service.getPlayers({ search: "Player", position: "MC", playStyle: "tiki-taka", playStyleLevel: "plus", page: 2 }, { nationalities: ["Spain"] })
  const where = JSON.parse(JSON.stringify(lists[0].where))
  assert.deepEqual(where, JSON.parse(JSON.stringify(counts[0].where)))
  assert.equal(where.OR[0].name.contains, "Player")
  assert.deepEqual(where.AND, [{ OR: [{ position: "MC" }, { secondaryPositions: { has: "MC" } }, { secondaryPosition: "MC" }] }])
  assert.deepEqual(where.nationality, { in: ["Spain"] })
  assert.deepEqual(where.playStyles, { some: { playStyle: { code: "tiki-taka" }, level: "plus" } })
  assert.equal(lists[0].take, 24)
  assert.equal(lists[0].skip, 24)
})
