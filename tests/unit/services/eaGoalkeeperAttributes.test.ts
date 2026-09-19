import assert from "node:assert/strict"
import test from "node:test"

import { mapEARatingsPlayer } from "../../../mappers/mapEARatingsPlayer"
import { normalizePlayer } from "../../../normalizers/normalizePlayer"
import {
  eaGoalkeeperPayloadHash,
  planEaGoalkeeperAttributes,
  type EaGoalkeeperPlayerState,
} from "../../../services/eaGoalkeeperAttributes"
import type { GoalkeeperAttributeValues } from "../../../types/goalkeeperAttributes"

const attributes: GoalkeeperAttributeValues = {
  diving: 88, handling: 86, kicking: 84, positioning: 89, reflexes: 90,
}

const current = (overrides: Partial<EaGoalkeeperPlayerState> = {}): EaGoalkeeperPlayerState => ({
  playerId: "player-1", externalId: "1", position: "GOL", attributes, ...overrides,
})

test("maps all five EA goalkeeper fields only for a primary goalkeeper", () => {
  const source = { id: 1, commonName: "Keeper", position: { label: "Goalkeeper" }, overallRating: 88,
    stats: { gkDiving: { value: 88 }, gkHandling: { value: 86 }, gkKicking: { value: 84 },
      gkPositioning: { value: 89 }, gkReflexes: { value: 90 } } }
  const normalized = normalizePlayer(mapEARatingsPlayer(source))
  assert.equal(normalized.position, "GOL")
  assert.deepEqual(normalized.goalkeeperAttributes, attributes)
  assert.equal(Object.hasOwn(normalized.attributes, "diving"), false)
  const outfield = normalizePlayer(mapEARatingsPlayer({ ...source, id: 2, position: { label: "Center Midfielder" } }))
  assert.equal(outfield.position, "MC")
  assert.equal(outfield.goalkeeperAttributes, undefined)
})

test("creates complete goalkeeper attributes and is idempotent", () => {
  const create = planEaGoalkeeperAttributes({ externalId: "1", position: "GOL", incoming: attributes, current: null })
  assert.equal(create.action, "CREATE")
  assert.deepEqual(create.changedFields, ["diving", "handling", "kicking", "positioning", "reflexes"])
  const noOp = planEaGoalkeeperAttributes({ externalId: "1", position: "GOL", incoming: attributes, current: current() })
  assert.equal(noOp.action, "NO_OP")
  assert.deepEqual(noOp.changedFields, [])
})

test("updates changed fields and preserves missing source values", () => {
  const plan = planEaGoalkeeperAttributes({ externalId: "1", position: "GOL",
    incoming: { diving: 91, handling: 87 }, current: current() })
  assert.equal(plan.action, "UPDATE")
  assert.deepEqual(plan.changedFields, ["diving", "handling"])
  assert.deepEqual(plan.preservedFields, ["kicking", "positioning", "reflexes"])
  assert.deepEqual(plan.after, { ...attributes, diving: 91, handling: 87 })
})

test("rejects incomplete creates and invalid ratings without clearing existing values", () => {
  const missing = planEaGoalkeeperAttributes({ externalId: "1", position: "GOL", incoming: { diving: 80 }, current: null })
  assert.equal(missing.action, "INVALID")
  assert.match(missing.reason, /CREATE_INCOMPLETE/)
  for (const value of [-1, 100, 80.5, Number.NaN]) {
    const invalid = planEaGoalkeeperAttributes({ externalId: "1", position: "GOL",
      incoming: { ...attributes, reflexes: value }, current: current() })
    assert.equal(invalid.action, "INVALID")
    assert.equal(invalid.after, null)
  }
})

test("outfield players cannot create goalkeeper attributes and stale GK state conflicts", () => {
  const ignored = planEaGoalkeeperAttributes({ externalId: "2", position: "MC", incoming: attributes, current: null })
  assert.equal(ignored.action, "NO_OP")
  assert.equal(ignored.reason, "OUTFIELD_PLAYER_NOT_APPLICABLE")
  const conflict = planEaGoalkeeperAttributes({ externalId: "1", position: "MC", incoming: attributes, current: current() })
  assert.equal(conflict.action, "CONFLICT")
})

test("semantic hash is stable and excludes observation time", () => {
  assert.equal(eaGoalkeeperPayloadHash("1", attributes), eaGoalkeeperPayloadHash("1", { ...attributes }))
  assert.notEqual(eaGoalkeeperPayloadHash("1", attributes),
    eaGoalkeeperPayloadHash("1", { ...attributes, reflexes: 91 }))
})
