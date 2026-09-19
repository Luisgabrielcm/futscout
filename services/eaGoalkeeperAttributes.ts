import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

import {
  GOALKEEPER_ATTRIBUTE_FIELDS,
  type GoalkeeperAttributeField,
  type GoalkeeperAttributePatch,
  type GoalkeeperAttributeValues,
} from "../types/goalkeeperAttributes"
import type { PlayerPosition } from "../types/player"

export type EaGoalkeeperSyncAction = "CREATE" | "UPDATE" | "NO_OP" | "INVALID" | "CONFLICT"

export type EaGoalkeeperPlayerState = Readonly<{
  playerId: string
  externalId: string
  position: PlayerPosition
  attributes: GoalkeeperAttributeValues | null
}>

export type EaGoalkeeperSyncPlan = Readonly<{
  externalId: string
  action: EaGoalkeeperSyncAction
  reason: string
  before: GoalkeeperAttributeValues | null
  after: GoalkeeperAttributeValues | null
  changedFields: GoalkeeperAttributeField[]
  preservedFields: GoalkeeperAttributeField[]
  payloadHash: string
}>

function canonicalPayload(externalId: string, patch: GoalkeeperAttributePatch | undefined) {
  return Object.fromEntries([
    ["externalId", externalId],
    ...GOALKEEPER_ATTRIBUTE_FIELDS.map((field) => [field, patch?.[field] ?? null]),
  ])
}

export function eaGoalkeeperPayloadHash(
  externalId: string,
  patch: GoalkeeperAttributePatch | undefined,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalPayload(externalId, patch)))
    .digest("hex")
}

function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 99
}

export function planEaGoalkeeperAttributes(input: {
  externalId: string
  position: PlayerPosition
  incoming: GoalkeeperAttributePatch | undefined
  current: EaGoalkeeperPlayerState | null
}): EaGoalkeeperSyncPlan {
  const payloadHash = eaGoalkeeperPayloadHash(input.externalId, input.incoming)
  const base = { externalId: input.externalId, payloadHash }

  if (input.position !== "GOL") {
    if (input.current?.attributes) {
      return { ...base, action: "CONFLICT", reason: "OUTFIELD_PLAYER_HAS_GOALKEEPER_ATTRIBUTES",
        before: input.current.attributes, after: null, changedFields: [], preservedFields: [] }
    }
    return { ...base, action: "NO_OP", reason: "OUTFIELD_PLAYER_NOT_APPLICABLE",
      before: null, after: null, changedFields: [], preservedFields: [] }
  }

  if (input.current && input.current.externalId !== input.externalId) {
    return { ...base, action: "CONFLICT", reason: "PLAYER_IDENTITY_CONFLICT",
      before: input.current.attributes, after: null, changedFields: [], preservedFields: [] }
  }

  if (!input.incoming) {
    return { ...base, action: "INVALID", reason: "GOALKEEPER_PAYLOAD_MISSING",
      before: input.current?.attributes ?? null, after: null, changedFields: [], preservedFields: [] }
  }

  const invalidFields = GOALKEEPER_ATTRIBUTE_FIELDS.filter((field) => {
    const value = input.incoming?.[field]
    return value !== undefined && !isValidRating(value)
  })
  if (invalidFields.length) {
    return { ...base, action: "INVALID", reason: `GOALKEEPER_RATING_INVALID:${invalidFields.join(",")}`,
      before: input.current?.attributes ?? null, after: null, changedFields: [], preservedFields: [] }
  }

  const missingFields = GOALKEEPER_ATTRIBUTE_FIELDS.filter((field) => input.incoming?.[field] === undefined)
  if (!input.current?.attributes && missingFields.length) {
    return { ...base, action: "INVALID", reason: `GOALKEEPER_CREATE_INCOMPLETE:${missingFields.join(",")}`,
      before: null, after: null, changedFields: [], preservedFields: [] }
  }

  const preservedFields: GoalkeeperAttributeField[] = []
  const after = Object.fromEntries(GOALKEEPER_ATTRIBUTE_FIELDS.map((field) => {
    const incoming = input.incoming?.[field]
    if (incoming === undefined) preservedFields.push(field)
    return [field, incoming ?? input.current?.attributes?.[field]]
  })) as unknown as GoalkeeperAttributeValues

  if (!input.current?.attributes) {
    return { ...base, action: "CREATE", reason: "GOALKEEPER_ATTRIBUTES_CREATE",
      before: null, after, changedFields: [...GOALKEEPER_ATTRIBUTE_FIELDS], preservedFields }
  }

  const changedFields = GOALKEEPER_ATTRIBUTE_FIELDS.filter(
    (field) => !Object.is(input.current?.attributes?.[field], after[field]),
  )
  return {
    ...base,
    action: isDeepStrictEqual(input.current.attributes, after) ? "NO_OP" : "UPDATE",
    reason: changedFields.length ? "GOALKEEPER_ATTRIBUTES_UPDATE" : "GOALKEEPER_ATTRIBUTES_EQUAL",
    before: input.current.attributes,
    after,
    changedFields,
    preservedFields,
  }
}
