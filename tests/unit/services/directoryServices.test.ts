import assert from "node:assert/strict"
import { test } from "node:test"
import { cache } from "react"
import type { Prisma } from "../../../app/generated/prisma/client"
import * as directory from "../../../lib/directoryCatalogParams"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const club = { id: "club-id", name: "Clube Teste", slug: "clube-teste", imageUrl: null,
  league: { name: "Liga Teste", slug: "liga-teste" }, _count: { players: 30 } }
const league = { id: "league-id", name: "Liga Teste", slug: "liga-teste", country: "Não informado", _count: { clubs: 25 } }
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

function fixture(missing = false) {
  const clubs: Prisma.ClubFindManyArgs[] = []
  const leagues: Prisma.LeagueFindManyArgs[] = []
  const players: Prisma.PlayerFindManyArgs[] = []
  const clubLookups: Prisma.ClubFindUniqueArgs[] = []
  const leagueLookups: Prisma.LeagueFindUniqueArgs[] = []
  const counts: unknown[] = []
  const prisma = {
    club: {
      count: async (args: unknown) => { counts.push(args); return 25 },
      findMany: async (args: Prisma.ClubFindManyArgs) => { clubs.push(args); return [club] },
      findUnique: async (args: Prisma.ClubFindUniqueArgs) => { clubLookups.push(args); return missing ? null : club },
    },
    league: {
      count: async (args: unknown) => { counts.push(args); return 25 },
      findMany: async (args: Prisma.LeagueFindManyArgs) => { leagues.push(args); return [league] },
      findUnique: async (args: Prisma.LeagueFindUniqueArgs) => { leagueLookups.push(args); return missing ? null : league },
    },
    player: {
      groupBy: async () => [],
      count: async (args: unknown) => { counts.push(args); return 25 },
      findMany: async (args: Prisma.PlayerFindManyArgs) => { players.push(args); return [catalogPlayer()] },
    },
  }
  const playerService = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": { prisma }, "../lib/playerCatalogParams": params,
    "../lib/playerCatalogOrder": order, "../mappers/mapDatabasePlayer": mapper,
  })
  const clubService = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma },
    "../lib/directoryCatalogParams": directory, "./playerService": playerService,
  })
  const leagueService = loadCatalogModule<typeof import("../../../services/leagueService")>("services/leagueService.ts", {
    "server-only": {}, react: { cache }, "../lib/prisma": { prisma },
    "../lib/directoryCatalogParams": directory, "./playerService": playerService, "./clubService": clubService,
  })
  return { clubService, leagueService, clubs, leagues, players, clubLookups, leagueLookups, counts }
}

test("clubs pagination uses take 24, skip and stable name/id order", async () => {
  const f = fixture()
  const result = await f.clubService.getClubs({ page: 2 })
  assert.equal(f.clubs[0].take, 24)
  assert.equal(f.clubs[0].skip, 24)
  assert.deepEqual(plain(f.clubs[0].orderBy), [{ name: "asc" }, { id: "asc" }])
  assert.equal(result.totalPages, 2)
  assert.equal(result.clubs[0].id, club.id)
  assert.equal(result.clubs[0].rating.overall, null)
})

test("clubs search and league use identical count/list predicates with relation count", async () => {
  const f = fixture()
  await f.clubService.getClubs({ search: " Teste ", league: " liga-teste " })
  assert.deepEqual(plain(f.clubs[0].where), { name: { contains: "Teste", mode: "insensitive" }, league: { is: { slug: "liga-teste" } } })
  assert.deepEqual(plain(f.counts[0]), { where: plain(f.clubs[0].where) })
  assert.deepEqual(plain(f.clubs[0].select?._count), { select: { players: true } })
  assert.deepEqual(plain(f.clubs[0].select?.league), { select: { name: true, slug: true } })
  assert.equal(f.clubs[0].select?.apiFootballId, undefined)
  assert.equal(f.clubs[0].select?.players, undefined)
})

test("club service validates malformed navigation independently", async () => {
  const f = fixture()
  const result = await f.clubService.getClubs({ page: "not-a-page", search: {}, league: [] })
  assert.equal(result.page, 1)
  assert.equal(f.clubs[0].skip, 0)
  assert.deepEqual(plain(f.clubs[0].where), {})
})

test("club detail uses the unique slug and returns null for absent records", async () => {
  const f = fixture()
  assert.equal(await f.clubService.getClubBySlug("clube-teste"), club)
  assert.deepEqual(plain(f.clubLookups[0].where), { slug: "clube-teste" })
  assert.equal(await fixture(true).clubService.getClubBySlug("absent"), null)
})

test("club roster keeps scope, pagination and the existing catalog attribute contract", async () => {
  const f = fixture()
  const result = await f.clubService.getClubPlayers("club-id", { page: 2 })
  assert.equal(result.players[0].slug, "fixture-player")
  assert.equal(f.players[0].where?.clubId, "club-id")
  assert.deepEqual(plain(f.players[0].where?.attributes), { isNot: null })
  assert.equal(f.players[0].take, 24)
  assert.equal(f.players[0].skip, 24)
  assert.deepEqual(f.players[0].orderBy, order.getPlayerOrderBy("overall-desc"))
  assert.deepEqual(plain(f.counts[0]), { where: plain(f.players[0].where) })
})

test("league listing is paginated with stable order and club counts, without loading clubs", async () => {
  const f = fixture()
  const result = await f.leagueService.getLeagueCatalog({ page: 2 })
  assert.equal(result.leagues[0], league)
  assert.equal(result.totalPages, 2)
  assert.equal(f.leagues[0].take, 24)
  assert.equal(f.leagues[0].skip, 24)
  assert.deepEqual(plain(f.leagues[0].orderBy), [{ name: "asc" }, { id: "asc" }])
  assert.deepEqual(plain(f.leagues[0].select?._count), { select: { clubs: true } })
  assert.equal(f.leagues[0].select?.clubs, undefined)
})

test("league search is case insensitive and malformed page falls back", async () => {
  const f = fixture()
  const result = await f.leagueService.getLeagueCatalog({ search: " Liga ", page: Infinity })
  assert.equal(result.page, 1)
  assert.deepEqual(plain(f.leagues[0].where), { name: { contains: "Liga", mode: "insensitive" } })
  assert.deepEqual(plain(f.counts[0]), { where: plain(f.leagues[0].where) })
})

test("league unique slug lookup returns null for missing league", async () => {
  const f = fixture()
  assert.equal(await f.leagueService.getLeagueBySlug("liga-teste"), league)
  assert.deepEqual(plain(f.leagueLookups[0].where), { slug: "liga-teste" })
  assert.equal(await fixture(true).leagueService.getLeagueBySlug("absent"), null)
})

test("league clubs delegate to the same bounded club query with league scope", async () => {
  const f = fixture()
  await f.leagueService.getLeagueClubs("liga-teste", { page: 2 })
  assert.equal(f.clubs[0].take, 24)
  assert.equal(f.clubs[0].skip, 24)
  assert.deepEqual(plain(f.clubs[0].where), { league: { is: { slug: "liga-teste" } } })
})

test("league players traverse club relation with matching count and stable roster order", async () => {
  const f = fixture()
  await f.leagueService.getLeaguePlayers("liga-teste", { page: 2 })
  assert.deepEqual(plain(f.players[0].where?.club), { is: { league: { is: { slug: "liga-teste" } } } })
  assert.equal(f.players[0].take, 24)
  assert.equal(f.players[0].skip, 24)
  assert.deepEqual(f.players[0].orderBy, order.getPlayerOrderBy("overall-desc"))
  assert.deepEqual(plain(f.counts[0]), { where: plain(f.players[0].where) })
})
