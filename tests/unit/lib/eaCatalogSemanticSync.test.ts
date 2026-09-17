import assert from "node:assert/strict"
import test from "node:test"

import {
  eaSemanticHash,
  normalizedPlayerSnapshot,
  planEaSemanticSync,
} from "../../../lib/eaCatalogSemanticSync"
import type { NormalizedPlayer } from "../../../types/normalizedPlayer"

const attributeNames = (
  "pace acceleration sprintSpeed shooting positioning finishing shotPower longShots volleys penalties " +
  "passing vision crossing freeKickAccuracy shortPassing longPassing curve dribbling agility balance reactions " +
  "ballControl dribblingStat composure defending interceptions headingAccuracy defensiveAwareness standingTackle " +
  "slidingTackle physical jumping stamina strength aggression"
).split(" ")

function player(overrides: Partial<NormalizedPlayer> = {}): NormalizedPlayer {
  return {
    externalId: "231866",
    source: "ea-ratings",
    name: "Rodri",
    dateOfBirth: new Date("1996-06-22T00:00:00.000Z"),
    nationality: "Spain",
    position: "VOL",
    secondaryPosition: "MC",
    secondaryPositions: ["MC"],
    preferredFoot: "Direito",
    height: 191,
    skillMoves: 3,
    weakFootAbility: 4,
    imageUrl: "https://example.test/rodri.png",
    club: { externalId: "10", name: "Manchester City" },
    league: { name: "Premier League" },
    officialOverall: 90,
    potential: 90,
    attributes: Object.fromEntries(attributeNames.map((name) => [name, 80])),
    playStyles: [{ code: "tiki-taka", name: "Tiki Taka", level: "plus" }],
    ...overrides,
  }
}

test("semantic hash is stable and excludes observation time", () => {
  const first = normalizedPlayerSnapshot(player({ sourceUpdatedAt: undefined }))
  const reordered = normalizedPlayerSnapshot(player({
    secondaryPositions: ["MC"],
    playStyles: [...player().playStyles].reverse(),
    sourceUpdatedAt: new Date("2026-09-17T00:00:00.000Z"),
  }))

  assert.equal(eaSemanticHash(first), eaSemanticHash(reordered))
  assert.equal("sourceUpdatedAt" in first, false)
})

test("same normalized domain is NO_OP and a real club change is UPDATE", () => {
  const current = normalizedPlayerSnapshot(player())
  assert.equal(planEaSemanticSync(normalizedPlayerSnapshot(player()), current).action, "NO_OP")

  const changed = normalizedPlayerSnapshot(player({
    club: { externalId: "241", name: "FC Barcelona" },
    league: { externalId: "53", name: "LALIGA EA SPORTS" },
  }))
  const plan = planEaSemanticSync(changed, current)
  assert.equal(plan.action, "UPDATE")
  assert.deepEqual(plan.changedFields, [
    "club.externalId", "club.name", "league.externalId", "league.name",
  ])
})

test("rating, attribute and league changes are semantic updates", () => {
  const current = normalizedPlayerSnapshot(player())

  const rating = planEaSemanticSync(normalizedPlayerSnapshot(player({ officialOverall: 91 })), current)
  assert.deepEqual(rating.changedFields, ["officialOverall"])

  const attributes = { ...player().attributes, passing: 91 }
  const attribute = planEaSemanticSync(normalizedPlayerSnapshot(player({ attributes })), current)
  assert.deepEqual(attribute.changedFields, ["attributes.passing"])

  const league = planEaSemanticSync(normalizedPlayerSnapshot(player({
    league: { externalId: "53", name: "LALIGA EA SPORTS" },
  })), current)
  assert.deepEqual(league.changedFields, ["league.externalId", "league.name"])
})

test("planner classifies CREATE, CONFLICT and INVALID without writes", () => {
  const incoming = normalizedPlayerSnapshot(player())
  assert.equal(planEaSemanticSync(incoming, null).action, "CREATE")
  assert.equal(planEaSemanticSync(incoming, { ...incoming, externalId: "other" }).action, "CONFLICT")
  assert.equal(planEaSemanticSync({ ...incoming, name: "" }, null).action, "INVALID")
})

test("four observed Phase A club fixtures are idempotent semantic NO_OPs", () => {
  const fixtures = [
    ["231866", "Rodri", "10", "Manchester City"],
    ["237678", "Ibrahima Konaté", "9", "Liverpool"],
    ["239231", "Marc Cucurella", "5", "Chelsea"],
    ["218667", "Bernardo Silva", "10", "Manchester City"],
  ] as const

  for (const [externalId, name, clubId, clubName] of fixtures) {
    const incoming = normalizedPlayerSnapshot(player({
      externalId,
      name,
      club: { externalId: clubId, name: clubName },
    }))
    assert.equal(planEaSemanticSync(incoming, structuredClone(incoming)).action, "NO_OP")
  }
})
