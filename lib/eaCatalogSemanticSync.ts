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
  lastModified: Date | null
  locale: string
  gender: number
  requestOffset: number
  requestLimit: number
  totalItems: number
}

export type EaSemanticSnapshot = {
  externalId: string
  name: string
  dateOfBirth: string | null | undefined
  nationality: string | null | undefined
  position: string
  secondaryPosition: string | null | undefined
  secondaryPositions: string[]
  preferredFoot: string | null | undefined
  height: number | null | undefined
  skillMoves: number | null | undefined
  weakFootAbility: number | null | undefined
  imageUrl: string | null | undefined
  officialOverall: number
  potential: number | null | undefined
  club: {
    externalId: string | null | undefined
    name: string
  } | null | undefined
  league: {
    externalId: string | null | undefined
    name: string
  } | null | undefined
  attributes: Record<string, number | null | undefined>
  playStyles: Array<{ code: string; name: string | null | undefined; level: "normal" | "plus" }>
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

export function eaCatalogBatchHash(snapshots: EaSemanticSnapshot[]): string {
  const entries = snapshots
    .map((snapshot) => ({
      externalId: snapshot.externalId,
      payloadHash: eaSemanticHash(snapshot),
    }))
    .sort((left, right) => left.externalId.localeCompare(right.externalId))

  return createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex")
}

export type EaPatchOperation = "PRESERVE" | "UPDATE" | "CLEAR"

export type EaPatchResolution<T> = {
  operation: EaPatchOperation
  value: T | null | undefined
}

export function resolveEaPatchValue<T>(
  current: T | null | undefined,
  incoming: T | null | undefined,
  options: { allowClear?: boolean } = {}
): EaPatchResolution<T> {
  if (
    incoming === undefined ||
    (typeof incoming === "string" && incoming.trim() === "") ||
    Object.is(current, incoming)
  ) {
    return { operation: "PRESERVE", value: current }
  }

  if (incoming === null) {
    return options.allowClear
      ? { operation: "CLEAR", value: null }
      : { operation: "PRESERVE", value: current }
  }

  return { operation: "UPDATE", value: incoming }
}

// No nullable EA field is currently authorized to clear persisted domain data.
// A future clear must opt in by exact path after its source contract is reviewed.
const EA_CLEARABLE_PATHS = new Set<string>()

function reconcileEaPartialValue(current: unknown, incoming: unknown, path = ""): unknown {
  if (incoming === undefined || incoming === null) {
    return resolveEaPatchValue(current, incoming, {
      allowClear: EA_CLEARABLE_PATHS.has(path),
    }).value
  }

  if (Array.isArray(incoming)) {
    return incoming
  }

  if (typeof incoming === "object") {
    const currentRecord = current && typeof current === "object" && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {}
    const incomingRecord = incoming as Record<string, unknown>
    const keys = new Set([...Object.keys(currentRecord), ...Object.keys(incomingRecord)])

    return Object.fromEntries([...keys].map((key) => [
      key,
      reconcileEaPartialValue(
        currentRecord[key],
        incomingRecord[key],
        path ? `${path}.${key}` : key
      ),
    ]))
  }

  return resolveEaPatchValue(current, incoming, {
    allowClear: EA_CLEARABLE_PATHS.has(path),
  }).value
}

export function normalizedPlayerSnapshot(player: NormalizedPlayer): EaSemanticSnapshot {
  const attributes = Object.fromEntries(
    Object.entries(player.attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value])
  )

  return {
    externalId: player.externalId,
    name: player.name,
    dateOfBirth: player.dateOfBirth?.toISOString(),
    nationality: player.nationality,
    position: player.position,
    secondaryPosition: player.secondaryPosition,
    secondaryPositions: [...player.secondaryPositions].sort(),
    preferredFoot: player.preferredFoot,
    height: player.height,
    skillMoves: player.skillMoves,
    weakFootAbility: player.weakFootAbility,
    imageUrl: player.imageUrl,
    officialOverall: player.officialOverall,
    potential: player.potential,
    club: player.club
      ? {
          externalId: player.club.externalId,
          name: player.club.name,
        }
      : undefined,
    league: player.league
      ? {
          externalId: player.league.externalId,
          name: player.league.name,
        }
      : undefined,
    attributes,
    playStyles: player.playStyles
      .map((playStyle) => ({
        code: playStyle.code,
        name: playStyle.name,
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

  const comparableIncoming = reconcileEaPartialValue(current, incoming) as EaSemanticSnapshot
  const changedFields = changedPaths(current, comparableIncoming)

  return {
    externalId: incoming.externalId,
    action: changedFields.length === 0 ? "NO_OP" : "UPDATE",
    payloadHash,
    changedFields,
    reason: null,
  }
}
