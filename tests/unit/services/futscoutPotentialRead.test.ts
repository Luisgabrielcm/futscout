import assert from "node:assert/strict"
import { test } from "node:test"
import { readFutscoutPotential, futscoutPotentialReadSelect } from "../../../lib/futscoutPotential/read"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as params from "../../../lib/playerCatalogParams"
import * as order from "../../../lib/playerCatalogOrder"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const current = (inputOverall = 89, potentialRaw = 91.38979545750449) => ({ estimate: {
  modelVersion: "potential-model-e-v1", status: "EXPERIMENTAL" as const, inputOverall, potentialRaw,
} })

test("current projects careerCeiling, retaining futurePeak/version/status and legacy separately", () => {
  const result = readFutscoutPotential({ potential: 92, currentFutscoutPotential: current() })
  assert.equal(result.potential, 91)
  assert.equal(result.legacyPotential, 92)
  assert.equal(result.futscoutPotential?.futurePeak, 91.38979545750449)
  assert.equal(result.futscoutPotential?.modelVersion, "potential-model-e-v1")
  assert.equal(result.futscoutPotential?.status, "EXPERIMENTAL")
  assert.equal(result.potentialReadState, "READY")
})
test("absent/withdrawn current is observable absence, never EA or OVR fallback", () => {
  for (const selected of [undefined, null, { estimate: null }]) {
    const result = readFutscoutPotential({ potential: 94, currentFutscoutPotential: selected })
    assert.equal(result.potential, null)
    assert.equal(result.potentialReadState, "MISSING_CURRENT")
    assert.equal(result.legacyPotential, 94)
  }
})
test("mature player futurePeak below OVR preserves careerCeiling", () => {
  assert.equal(readFutscoutPotential({ potential: 88, currentFutscoutPotential: current(88, 86.57) }).potential, 88)
})
test("invalid status/domain and unknown version cannot become display values", () => {
  const c = current()
  assert.equal(readFutscoutPotential({ potential: 99, currentFutscoutPotential: { estimate: { ...c.estimate, status: "INVALID" } } }).potentialReadState, "INVALID_CURRENT")
  assert.equal(readFutscoutPotential({ potential: 99, currentFutscoutPotential: current(89, NaN) }).potential, null)
  assert.equal(readFutscoutPotential({ potential: 99, currentFutscoutPotential: { estimate: { ...c.estimate, modelVersion: "other" } } }).potentialReadState, "UNSUPPORTED_MODEL")
})

function fixture(size: number) {
  let lists = 0, profiles = 0
  const rows = Array.from({ length: size }, (_, n) => catalogPlayer({ id: String(n), potential: 92, currentFutscoutPotential: current() }))
  const infrastructure = { prisma: { player: {
    count: async () => size,
    findMany: async (args: { include?: { currentFutscoutPotential?: unknown }; select?: { currentFutscoutPotential?: unknown } }) => {
      lists++; assert.deepEqual(args.include?.currentFutscoutPotential ?? args.select?.currentFutscoutPotential, futscoutPotentialReadSelect); return rows
    },
    findUnique: async (args: { include: { currentFutscoutPotential: unknown } }) => {
      profiles++; assert.deepEqual(args.include.currentFutscoutPotential, futscoutPotentialReadSelect); return rows[0]
    },
  } } }
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": infrastructure, "../mappers/mapDatabasePlayer": mapper,
    "../lib/playerCatalogParams": params, "../lib/playerCatalogOrder": order,
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  })
  const clubs = loadCatalogModule<typeof import("../../../services/clubService")>("services/clubService.ts", {
    "server-only": {}, react: { cache: (fn: unknown) => fn }, "../lib/prisma": infrastructure,
    "../lib/directoryCatalogParams": {}, "./playerService": service,
    "./clubIdentityAliases": {}, "./brandAssetReadService": {},
  })
  return { service, clubs, counts: () => ({ lists, profiles }) }
}
test("catalog/search/filter and club scoped read have constant list query count", async () => {
  for (const size of [1, 24, 100]) {
    const f = fixture(size)
    const result = await f.service.getPlayers({ search: "Pedri", minOverall: 80 }, { clubId: "fixture" })
    assert.equal(result.players.length, size)
    assert.ok(result.players.every(p => p.potential === 91 && p.legacyPotential === 92))
    assert.equal(f.counts().lists, 1)
    const roster = await f.clubs.getClubRoster("fixture")
    assert.ok(roster.every(p => p.potential === 91))
    assert.equal(f.counts().lists, 2)
  }
})
test("profile exposes same contract in one lookup", async () => {
  const f = fixture(1)
  const result = await f.service.getPlayerBySlug("fixture")
  assert.equal(result?.status, "ready")
  if (result?.status === "ready") assert.equal(result.player.potential, 91)
  assert.deepEqual(f.counts(), { lists: 0, profiles: 1 })
})
