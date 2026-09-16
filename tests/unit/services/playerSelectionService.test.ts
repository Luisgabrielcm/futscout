import assert from "node:assert/strict"
import { test } from "node:test"
import type { Prisma } from "../../../app/generated/prisma/client"
import * as selections from "../../../lib/playerSelections"
import { calculateAge } from "../../../mappers/mapDatabasePlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const row = (slug: string) => ({
  id: slug, slug, name: slug, position: "MC", dateOfBirth: null, imageUrl: null,
  nationality: slug === "a" ? "Germany" : null, secondaryPosition: null, secondaryPositions: slug === "a" ? ["MEI", "VOL"] : [],
  officialOverall: 80, dynamicOverall: null, potential: null, marketValue: null, form: null,
  club: null, attributes: null,
})
function fixture() {
  const reads: Prisma.PlayerFindManyArgs[] = []
  const service = loadCatalogModule<typeof import("../../../services/playerSelectionService")>("services/playerSelectionService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: {
      findMany: async (args: Prisma.PlayerFindManyArgs) => { reads.push(args); return [row("a"), row("b")] },
    } } },
    "../lib/playerSelections": selections, "../mappers/mapDatabasePlayer": { calculateAge },
  })
  return { service, reads }
}

test("comparison resolves two players in one bounded IN query and restores URL order", async () => {
  const f = fixture()
  const result = await f.service.getSelectedPlayers(["b", "a", "c"], 2)
  assert.equal(f.reads.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(f.reads[0].where)), { slug: { in: ["b", "a"] } })
  assert.equal(f.reads[0].take, 2)
  assert.deepEqual(Array.from(result, (player) => player.slug), ["b", "a"])
  assert.equal(f.reads[0].include, undefined)
  assert.equal(f.reads[0].select?.externalId, undefined)
  assert.equal(f.reads[0].select?.realLifeStats, undefined)
})

test("selection service avoids DB calls for an empty or invalid selection", async () => {
  const f = fixture()
  assert.equal((await f.service.getSelectedPlayers([])).length, 0)
  assert.equal((await f.service.getSelectedPlayers(["../bad"])).length, 0)
  assert.equal(f.reads.length, 0)
})

test("unknown slug is omitted without fabricating a player or filling missing attributes", async () => {
  const f = fixture()
  const result = await f.service.getSelectedPlayers(["missing", "a"], 2)
  assert.equal(result.length, 1)
  assert.equal(result[0].slug, "a")
  assert.equal(result[0].attributes, null)
  assert.equal(result[0].dynamicOverall, null)
  assert.equal(result[0].potential, null)
  assert.equal(result[0].marketValue, null)
  assert.equal(result[0].age, null)
  assert.equal(result[0].baseOverall, 80)
})

test("favorites lookup caps volume and deduplicates instead of querying each player", async () => {
  const f = fixture()
  await f.service.getSelectedPlayers(["a", "a", ...Array.from({ length: 100 }, (_, i) => "p-" + i)])
  assert.equal(f.reads.length, 1)
  assert.equal(f.reads[0].take, selections.FAVORITES_LIMIT)
})

test("selected cards receive existing nationality and alternate positions in the same bounded read", async () => {
  const f = fixture()
  const result = await f.service.getSelectedPlayers(["a", "b"])
  assert.equal(f.reads.length, 1)
  assert.equal(f.reads[0].select?.nationality, true)
  assert.equal(f.reads[0].select?.secondaryPositions, true)
  assert.deepEqual(JSON.parse(JSON.stringify(f.reads[0].select?.club)), { select: { name: true, imageUrl: true } })
  assert.equal(result[0].nationality, "Germany")
  assert.deepEqual(Array.from(result[0].secondaryPositions ?? []), ["MEI", "VOL"])
  assert.equal(result[1].nationality, null)
  assert.equal(result[1].clubImageUrl, null)
})
