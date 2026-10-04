import { createHash } from "node:crypto"
import type { NormalizedPlayer } from "../types/normalizedPlayer"
import type { EaCatalogBatchProvenance } from "./eaCatalogSemanticSync"

export const EA_RATING_SNAPSHOT_VERSION = 1

// Undefined is absent, explicit null is retained, and object order is canonical.
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]),
  )
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("INVALID_RATING_NUMBER")
  return value
}

export function eaRatingSnapshot(player: NormalizedPlayer, source: EaCatalogBatchProvenance) {
  const attributes = canonical({ outfield: player.attributes, goalkeeper: player.goalkeeperAttributes }) as
    { outfield: Record<string, number | null>; goalkeeper?: Record<string, number | null> }
  const content = canonical({ dateOfBirth: player.dateOfBirth, primaryPosition: player.position,
    overall: player.officialOverall, attributes })
  return {
    externalId: player.externalId,
    // Null source metadata is not an inferred edition/effective date.
    sourceContext: JSON.stringify(canonical({ provider: source.provider, endpoint: source.endpoint,
      gameVersion: source.eaGameVersion, gameVersionEvidence: source.gameVersionEvidence,
      catalogVersion: source.catalogVersion, gender: source.gender })),
    dateOfBirth: player.dateOfBirth ?? null,
    primaryPosition: player.position, overall: player.officialOverall, attributes,
    contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    snapshotVersion: EA_RATING_SNAPSHOT_VERSION,
  }
}

export type AcceptedRating = {
  id: string; externalId: string | null; dateOfBirth: Date | null; position: string; officialOverall: number
  attributes: object | null; goalkeeperAttributes: object | null
}

/** Never claim a submitted patch was applied if the confirmed state disagrees. */
export function assertAcceptedRating(player: NormalizedPlayer, accepted: AcceptedRating) {
  if (player.externalId !== accepted.externalId || player.position !== accepted.position ||
      player.officialOverall !== accepted.officialOverall ||
      (player.dateOfBirth !== undefined && player.dateOfBirth?.getTime() !== accepted.dateOfBirth?.getTime())) {
    throw new Error("EA_RATING_STATE_MISMATCH")
  }
  for (const [patch, stored] of [[player.attributes, accepted.attributes],
    [player.goalkeeperAttributes, accepted.goalkeeperAttributes]] as const) {
    for (const [key, value] of Object.entries(patch ?? {})) {
      // Explicit null is source absence, not authorization to clear a stored value.
      if (value != null && (!stored || (stored as Record<string, unknown>)[key] !== value)) {
        throw new Error("EA_RATING_ATTRIBUTE_NOT_ACCEPTED")
      }
    }
  }
}
