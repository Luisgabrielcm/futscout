import assert from "node:assert/strict"
import { test } from "node:test"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

test("real-life reader selects only approved Current Club V2 and performs no writes", async () => {
  let query: unknown
  const writes: string[] = []
  const row = {
    id: "player-rodri", slug: "rodri", name: "Rodri", imageUrl: null, nationality: "Spain",
    club: { slug: "manchester-city", name: "Manchester City" },
    approvedCurrentClub: { approvedClub: {
      id: "club-barcelona", slug: "barcelona", name: "Barcelona", imageUrl: null,
      league: { slug: "laliga", name: "LaLiga" },
    } },
  }
  const service = loadCatalogModule<typeof import("../../../services/playerRealLifeService")>("services/playerRealLifeService.ts", {
    "server-only": {},
    "../lib/prisma": { prisma: { player: {
      findUnique: async (args: unknown) => { query = args; return row },
      create: () => writes.push("create"), update: () => writes.push("update"),
    } } },
  })
  const result = await service.getPlayerRealLifeBySlug("rodri")
  assert.equal(result?.eaCatalogClub?.name, "Manchester City")
  assert.equal(result?.approvedCurrentClub?.name, "Barcelona")
  assert.deepEqual(writes, [])
  assert.match(JSON.stringify(query), /approvedCurrentClub/)
  assert.doesNotMatch(JSON.stringify(query), /transferObservations|currentClubProposals|evidenceHash/)
})

test("real-life reader returns null approved club and null player honestly", async () => {
  let result: unknown = { approvedCurrentClub: { approvedClub: null } }
  const service = loadCatalogModule<typeof import("../../../services/playerRealLifeService")>("services/playerRealLifeService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: { findUnique: async () => result } } },
  })
  result = { id: "p", slug: "salah", name: "Salah", imageUrl: null, nationality: null, club: null, approvedCurrentClub: null }
  assert.equal((await service.getPlayerRealLifeBySlug("salah"))?.approvedCurrentClub, null)
  result = null
  assert.equal(await service.getPlayerRealLifeBySlug("missing"), null)
})
