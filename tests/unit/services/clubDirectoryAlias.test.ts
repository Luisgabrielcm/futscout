import assert from "node:assert/strict"
import test from "node:test"
import { cache } from "react"
import * as directory from "../../../lib/directoryCatalogParams"
import * as aliases from "../../../services/clubIdentityAliases"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const league = { id: "bundesliga", name: "Bundesliga", slug: "bundesliga" }
const placeholder = { id: "placeholder", name: "Bayer Leverkusen", slug: "bayer-leverkusen",
  externalId: "mock-bayer-leverkusen", apiFootballId: null, leagueId: league.id, league, imageUrl: null, _count: { players: 0 } }
const target = { ...placeholder, id: "target", name: "Leverkusen", slug: "leverkusen",
  externalId: "32", apiFootballId: 168, _count: { players: 26 } }
type Row = Omit<typeof target, "apiFootballId"> & { apiFootballId: number | null }
type Query = { where: { id?: { not: string }; name?: { contains: string }; OR?: ({ name?: { contains: string }; id?: string })[] }; skip?: number; take?: number; orderBy?: { name?: string }[] }
function fixture(rows: Row[]) {
  const queries: Query[] = []
  const asset = { marker: "canonical-crest" }
  function filter(q: Query) {
    return rows.filter(row => row.id !== q.where.id?.not && (!q.where.name || row.name.toLowerCase().includes(q.where.name.contains.toLowerCase())) &&
      (!q.where.OR || q.where.OR.some(term => term.id === row.id || term.name && row.name.toLowerCase().includes(term.name.contains.toLowerCase()))))
  }
  const service = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache }, "../lib/directoryCatalogParams": directory,
    "./playerService": {}, "./clubIdentityAliases": aliases,
    "../lib/prisma": { prisma: { club: {
      findUnique: async ({ where }: { where: { slug?: string; apiFootballId?: number } }) => rows.find(row => where.slug ? row.slug === where.slug : row.apiFootballId === where.apiFootballId) ?? null,
      count: async (q: Query) => { queries.push(q); return filter(q).length },
      findMany: async (q: Query) => { queries.push(q); const sorted = filter(q).sort((a,b) => a.name.localeCompare(b.name) * (q.orderBy?.[0].name === "desc" ? -1 : 1)); return sorted.slice(q.skip ?? 0, q.take ? (q.skip ?? 0) + q.take : undefined) },
    }, player: { groupBy: async () => [] } } },
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map([[target.id, asset]]), leagues: new Map() }) },
  })
  return { service, queries, asset }
}

for (const sort of ["name-asc", "name-desc", "best"]) test(`directory deduplicates verified Bayer before pagination: ${sort}`, async () => {
  const others = Array.from({ length: 25 }, (_, i) => ({ ...placeholder, id: `other-${i}`, name: `Club ${i}`, slug: `club-${i}`, externalId: `other-${i}` }))
  const f = fixture([placeholder, target, ...others])
  const first = await f.service.getClubs({ league: "bundesliga", sort })
  const second = await f.service.getClubs({ league: "bundesliga", sort, page: 2 })
  const all = [...first.clubs, ...second.clubs]
  assert.equal(first.total, 26)
  assert.equal(first.clubs.length, 24)
  assert.equal(second.clubs.length, 2)
  assert.equal(new Set(all.map(row => row.id)).size, 26)
  assert.equal(all.some(row => row.id === placeholder.id), false)
  assert.equal(all.filter(row => row.id.startsWith("other-")).length, 25)
  const bayer = all.find(row => row.id === target.id)!
  assert.equal(bayer._count.players, 26)
  assert.equal(bayer.slug, "bayer-leverkusen")
  assert.equal(bayer.asset, f.asset)
  assert.equal((await f.service.getClubBySlug(bayer.slug))?.id, bayer.id)
  assert.deepEqual(f.queries[0].where, f.queries[1].where)
})

test("legacy search resolves the canonical identity without a duplicate", async () => {
  const f = fixture([placeholder, target])
  const result = await f.service.getClubs({ search: "Bayer" })
  assert.equal(result.total, 1)
  assert.equal(result.clubs[0].id, target.id)
})

for (const [label, rows] of [
  ["missing target", [placeholder]],
  ["wrong EA identity", [placeholder, { ...target, externalId: "168" }]],
  ["different league", [placeholder, { ...target, leagueId: "other" }]],
  ["placeholder has players", [{ ...placeholder, _count: { players: 1 } }, target]],
] as const) test(`directory preserves records when alias is unsafe: ${label}`, async () => {
  const result = await fixture([...rows]).service.getClubs()
  assert.equal(result.total, rows.length)
  assert.equal(result.clubs.some(row => row.id === placeholder.id), true)
})
