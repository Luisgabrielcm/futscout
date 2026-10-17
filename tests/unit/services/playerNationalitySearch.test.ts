import assert from "node:assert/strict"
import test from "node:test"
import type { Prisma } from "../../../app/generated/prisma/client"
import { nationalitySearchAliases } from "../../../lib/nationalitySearch"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as order from "../../../lib/playerCatalogOrder"

const cases = [
  ["Brasil", "Brazil"], ["Alemanha", "Germany"], ["  japao  ", "Japan"],
  ["franca", "France"], ["Países Baixos", "Holland"], ["Netherlands", "Holland"],
  ["Inglaterra", "England"], ["Escócia", "Scotland"], ["País de Gales", "Wales"],
  ["Coreia do Sul", "Korea Republic"], ["Estados Unidos", "United States of America"],
] as const

for (const [search, persisted] of cases) {
  test(`public catalog search ${search} finds persisted ${persisted} without changing the record`, async () => {
    const filters: Prisma.PlayerWhereInput[] = []
    const row = catalogPlayer({ nationality: persisted })
    const matches = (where: Prisma.PlayerWhereInput) => {
      filters.push(where)
      const alternatives = where.OR as Prisma.PlayerWhereInput[]
      return alternatives.some(clause => {
        const nationality = clause.nationality
        if (!nationality || typeof nationality === "string") return false
        const values = nationality.in
        return Array.isArray(values) && values.includes(persisted)
      })
    }
    const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
      "server-only": {}, "../lib/prisma": { prisma: { player: {
        count: async ({ where }: { where: Prisma.PlayerWhereInput }) => matches(where) ? 1 : 0,
        findMany: async ({ where }: { where: Prisma.PlayerWhereInput }) => matches(where) ? [row] : [],
      } } },
      "../mappers/mapDatabasePlayer": mapper,
      "../lib/playerCatalogOrder": order,
      "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
    })
    const result = await service.getPlayers({ search, position: "MC", minOverall: 70 })
    assert.equal(result.total, 1)
    assert.equal(result.players[0].nationality, persisted)
    assert.equal(filters[0], filters[1])
    assert.equal(JSON.stringify(filters[0].officialOverall), '{"gte":70}')
    const alternatives = filters[0].OR as Prisma.PlayerWhereInput[]
    assert.ok(alternatives.some(clause => JSON.stringify(clause) === JSON.stringify({ name: { contains: search.trim(), mode: "insensitive" } })))
    assert.ok(alternatives.some(clause => JSON.stringify(clause).includes('"club"')))
  })
}

test("partial, unknown and ambiguous country names do not invent registry aliases", () => {
  for (const term of ["", "Aleman", "Congo", "Synthetic Player", "'); DROP TABLE Player; --"]) {
    assert.deepEqual(nationalitySearchAliases(term), [])
  }
  assert.ok(nationalitySearchAliases("Congo DR").includes("Congo DR"))
  assert.ok(!nationalitySearchAliases("Congo DR").includes("Congo"))
})

test("canonical names and codes retain the same explicit country aliases", () => {
  for (const search of ["Brasil", "Brazil", "BR", "BRASIL"]) {
    assert.ok(nationalitySearchAliases(search).includes("Brazil"))
    assert.ok(!nationalitySearchAliases(search).includes("Portugal"))
  }
  const aliases = nationalitySearchAliases("BR")
  aliases.push("Synthetic Country")
  assert.ok(!nationalitySearchAliases("Brasil").includes("Synthetic Country"))
})
