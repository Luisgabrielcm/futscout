import { createHash } from "node:crypto"

import type { NormalizedPlayer } from "../types/normalizedPlayer"

export const EA_CATALOG_PROVENANCE_SCHEMA_VERSION = 1

export type EaSemanticSyncAction =
  | "CREATE"
  | "UPDATE"
  | "NO_OP"
  | "CONFLICT"
  | "INVALID"

export type EaCatalogBatchProvenance = {
  provider: "ea-ratings"
  endpoint: string
  eaGameVersion: string | null
  gameVersionEvidence: "OFFICIAL_PAGE_CONTEXT" | "PAYLOAD" | null
  gameVersionEvidenceUrl: string | null
  catalogVersion: string | null
  sourceUpdatedAt: Date | null
  observedAt: Date
  responseDate: Date | null
  etag: string | null
  locale: string
  gender: number
}

export type EaSemanticSnapshot = {
  externalId: string
  name: string
  dateOfBirth: string | null
  nationality: string | null
  position: string
  secondaryPosition: string | null
  secondaryPositions: string[]
  preferredFoot: string | null
  height: number | null
  skillMoves: number | null
  weakFootAbility: number | null
  imageUrl: string | null
  officialOverall: number
  potential: number | null
  club: {
    externalId: string | null
    name: string
    imageUrl: string | null
  } | null
  league: {
    externalId: string | null
    name: string
  } | null
  attributes: Record<string, number | null>
  playStyles: Array<{ code: string; name: string | null; level: "normal" | "plus" }>
}

export type EaSemanticSyncPlan = {
  externalId: string
  action: EaSemanticSyncAction
  payloadHash: string
  changedFields: string[]
  reason: string | null
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    )
  }

  return value
}

export function eaSemanticHash(snapshot: EaSemanticSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(snapshot)))
    .digest("hex")
}

const nullable = <T>(value: T | null | undefined): T | null => value ?? null

export function normalizedPlayerSnapshot(player: NormalizedPlayer): EaSemanticSnapshot {
  const attributes = Object.fromEntries(
    Object.entries(player.attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value ?? null])
  )

  return {
    externalId: player.externalId,
    name: player.name,
    dateOfBirth: player.dateOfBirth?.toISOString() ?? null,
    nationality: nullable(player.nationality),
    position: player.position,
    secondaryPosition: nullable(player.secondaryPosition),
    secondaryPositions: [...player.secondaryPositions].sort(),
    preferredFoot: nullable(player.preferredFoot),
    height: nullable(player.height),
    skillMoves: nullable(player.skillMoves),
    weakFootAbility: nullable(player.weakFootAbility),
    imageUrl: nullable(player.imageUrl),
    officialOverall: player.officialOverall,
    potential: nullable(player.potential),
    club: player.club
      ? {
          externalId: nullable(player.club.externalId),
          name: player.club.name,
          imageUrl: nullable(player.club.imageUrl),
        }
      : null,
    league: player.league
      ? {
          externalId: nullable(player.league.externalId),
          name: player.league.name,
        }
      : null,
    attributes,
    playStyles: player.playStyles
      .map((playStyle) => ({
        code: playStyle.code,
        name: nullable(playStyle.name),
        level: playStyle.level,
      }))
      .sort((left, right) =>
        left.code.localeCompare(right.code) ||
        left.level.localeCompare(right.level) ||
        (left.name ?? "").localeCompare(right.name ?? "")
      ),
  }
}

function changedPaths(current: unknown, incoming: unknown, path = ""): string[] {
  if (Object.is(current, incoming)) {
    return []
  }

  if (Array.isArray(current) || Array.isArray(incoming)) {
    return JSON.stringify(current) === JSON.stringify(incoming) ? [] : [path]
  }

  if (
    current && incoming &&
    typeof current === "object" && typeof incoming === "object"
  ) {
    const keys = new Set([
      ...Object.keys(current as Record<string, unknown>),
      ...Object.keys(incoming as Record<string, unknown>),
    ])

    return [...keys]
      .sort()
      .flatMap((key) => changedPaths(
        (current as Record<string, unknown>)[key],
        (incoming as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      ))
  }

  return [path]
}

export function planEaSemanticSync(
  incoming: EaSemanticSnapshot,
  current: EaSemanticSnapshot | null
): EaSemanticSyncPlan {
  const payloadHash = eaSemanticHash(incoming)

  if (
    !incoming.externalId.trim() ||
    !incoming.name.trim() ||
    !incoming.position.trim() ||
    !Number.isInteger(incoming.officialOverall)
  ) {
    return {
      externalId: incoming.externalId,
      action: "INVALID",
      payloadHash,
      changedFields: [],
      reason: "INVALID_NORMALIZED_PLAYER",
    }
  }

  if (!current) {
    return {
      externalId: incoming.externalId,
      action: "CREATE",
      payloadHash,
      changedFields: ["player"],
      reason: null,
    }
  }

  if (current.externalId !== incoming.externalId) {
    return {
      externalId: incoming.externalId,
      action: "CONFLICT",
      payloadHash,
      changedFields: ["externalId"],
      reason: "EXTERNAL_ID_CONFLICT",
    }
  }

  const changedFields = changedPaths(current, incoming)

  return {
    externalId: incoming.externalId,
    action: changedFields.length === 0 ? "NO_OP" : "UPDATE",
    payloadHash,
    changedFields,
    reason: null,
  }
}
