import assert from "node:assert/strict"
import { test } from "node:test"
import { mapDatabasePlayer, mapDatabasePlayerProfile } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

test("profile without attributes returns an explicit incomplete state without crashing", () => {
  const row = catalogPlayer({ attributes: null })
  assert.deepEqual(mapDatabasePlayerProfile(row), {
    status: "incomplete", name: "Jogador de teste",
  })
  assert.equal(row.attributes, null)
})

test("incomplete profile does not fabricate attributes or invoke position scoring", () => {
  // Even an incomplete legacy row with an invalid position is safely identified first.
  const profile = mapDatabasePlayerProfile(catalogPlayer({ attributes: null, position: "legacy" }))
  assert.equal(profile.status, "incomplete")
  assert.equal(Object.hasOwn(profile, "player"), false)
  assert.equal(Object.hasOwn(profile, "attributes"), false)
})

test("ready profile preserves available attributes and missing optional data", () => {
  const profile = mapDatabasePlayerProfile(catalogPlayer())
  assert.equal(profile.status, "ready")
  if (profile.status !== "ready") assert.fail("expected ready profile")
  assert.equal(profile.player.attributes.pace.overall, 80)
  assert.equal(profile.player.attributes.pace.acceleration, 81)
  assert.equal(profile.player.dynamicOverall, null)
  assert.equal(profile.player.potential, null)
  assert.equal(profile.player.marketValue, null)
  assert.equal(profile.player.form, null)
  assert.equal(profile.player.age, null)
  assert.equal(profile.player.valueTrend, null)
})

test("an available market value does not imply a stable trend", () => {
  const player = mapDatabasePlayer(catalogPlayer({ marketValue: BigInt(50_000_000) }))
  assert.equal(player.marketValue, 50_000_000)
  assert.equal(player.valueTrend, null)
})

test("goalkeeper general information is preserved without inventing keeper statistics", () => {
  const profile = mapDatabasePlayerProfile(catalogPlayer({
    position: "GOL", height: 190, nationality: "Brasil", officialOverall: 85,
  }))
  if (profile.status !== "ready") assert.fail("expected ready profile")
  assert.equal(profile.player.position, "GOL")
  assert.equal(profile.player.height, 190)
  assert.equal(profile.player.nationality, "Brasil")
  assert.equal(profile.player.baseOverall, 85)
  assert.equal(Object.hasOwn(profile.player.attributes, "goalkeeping"), false)
})
