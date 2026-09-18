import assert from "node:assert/strict"
import test from "node:test"

import {
  eaSemanticHash,
  normalizedPlayerSnapshot,
  planEaSemanticSync,
  resolveEaPatchValue,
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

test("partial payload fields preserve existing values; clear requires an explicit policy", () => {
  assert.deepEqual(resolveEaPatchValue(90, undefined), {
    operation: "PRESERVE",
    value: 90,
  })
  assert.deepEqual(resolveEaPatchValue(90, null), {
    operation: "PRESERVE",
    value: 90,
  })
  assert.deepEqual(resolveEaPatchValue(90, null, { allowClear: true }), {
    operation: "CLEAR",
    value: null,
  })
  assert.deepEqual(resolveEaPatchValue(90, 91), {
    operation: "UPDATE",
    value: 91,
  })
  assert.deepEqual(resolveEaPatchValue("Spain", ""), {
    operation: "PRESERVE",
    value: "Spain",
  })
})

test("missing potential and optional fields preserve persisted values", () => {
  const current = normalizedPlayerSnapshot(player())
  const incoming = normalizedPlayerSnapshot(player({
    potential: undefined,
    nationality: " ",
    imageUrl: undefined,
    attributes: { ...player().attributes, passing: undefined },
  }))

  const plan = planEaSemanticSync(incoming, current)
  assert.equal(plan.action, "NO_OP")
  assert.deepEqual(plan.changedFields, [])
})

test("present valid potential still updates while absent potential never clears", () => {
  const current = normalizedPlayerSnapshot(player({ potential: 90 }))
  const changed = planEaSemanticSync(
    normalizedPlayerSnapshot(player({ potential: 91 })),
    current,
  )
  const missing = planEaSemanticSync(
    normalizedPlayerSnapshot(player({ potential: undefined })),
    current,
  )

  assert.deepEqual(changed.changedFields, ["potential"])
  assert.equal(missing.action, "NO_OP")
})

test("club artwork is metadata outside the semantic Club domain", () => {
  const current = normalizedPlayerSnapshot(player({
    club: { externalId: "10", name: "Manchester City", imageUrl: "https://old.example/crest.png" },
  }))
  const incoming = normalizedPlayerSnapshot(player({
    club: { externalId: "10", name: "Manchester City", imageUrl: "https://new.example/crest.png" },
  }))

  assert.equal(planEaSemanticSync(incoming, current).action, "NO_OP")
  assert.equal("imageUrl" in (incoming.club ?? {}), false)
})

test("equivalent PlayStyle ordering is NO_OP while a real change remains UPDATE", () => {
  const styles = [
    { code: "tiki-taka", name: "Tiki Taka", level: "plus" as const },
    { code: "power-shot", name: "Power Shot", level: "normal" as const },
  ]
  const current = normalizedPlayerSnapshot(player({ playStyles: styles }))
  const reordered = normalizedPlayerSnapshot(player({ playStyles: [...styles].reverse() }))
  const changed = normalizedPlayerSnapshot(player({
    playStyles: [{ code: "rapid", name: "Rapid", level: "normal" }],
  }))

  assert.equal(planEaSemanticSync(reordered, current).action, "NO_OP")
  assert.deepEqual(planEaSemanticSync(changed, current).changedFields, ["playStyles"])
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

  const position = planEaSemanticSync(normalizedPlayerSnapshot(player({
    position: "MC",
    secondaryPosition: "VOL",
    secondaryPositions: ["VOL"],
  })), current)
  assert.deepEqual(position.changedFields, ["position", "secondaryPosition", "secondaryPositions"])

  const playStyles = planEaSemanticSync(normalizedPlayerSnapshot(player({
    playStyles: [{ code: "power-shot", name: "Power Shot", level: "normal" }],
  })), current)
  assert.deepEqual(playStyles.changedFields, ["playStyles"])
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
