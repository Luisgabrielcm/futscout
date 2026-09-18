import { normalizePosition } from "../normalizers/normalizePosition"
import type { EARatingsPlayer } from "../types/eaRatingsPlayer"

export type EaAutoSyncSourceAudit = {
  positions: Array<{
    sourceCode: string
    normalizedCode: string | null
    primaryOccurrences: number
    alternateOccurrences: number
  }>
  coverage: {
    potential: number
    salary: { players: number; paths: string[] }
    contract: { players: number; paths: string[] }
    loan: { players: number; paths: string[] }
    goalkeeperSpecificAttributes: { players: number; fields: string[] }
  }
}

function presentPaths(value: unknown, pattern: RegExp, prefix = ""): string[] {
  if (!value || typeof value !== "object") return []

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const own = pattern.test(key) && entry !== null && entry !== undefined ? [path] : []
    if (Array.isArray(entry)) {
      return [...own, ...entry.flatMap((item) => presentPaths(item, pattern, path))]
    }
    return [...own, ...presentPaths(entry, pattern, path)]
  })
}

function coverageFor(players: EARatingsPlayer[], pattern: RegExp) {
  const paths = players.map((player) => [...new Set(presentPaths(player, pattern))])
  return {
    players: paths.filter((items) => items.length > 0).length,
    paths: [...new Set(paths.flat())].sort(),
  }
}

export function auditEaRatingsSourceBatch(players: EARatingsPlayer[]): EaAutoSyncSourceAudit {
  const positions = new Map<string, { primary: number; alternate: number }>()

  for (const player of players) {
    const primary = player.position?.label?.trim()
    if (primary) {
      const count = positions.get(primary) ?? { primary: 0, alternate: 0 }
      count.primary++
      positions.set(primary, count)
    }

    for (const position of player.alternatePositions ?? []) {
      const alternate = position.label?.trim()
      if (!alternate) continue
      const count = positions.get(alternate) ?? { primary: 0, alternate: 0 }
      count.alternate++
      positions.set(alternate, count)
    }
  }

  const goalkeeperFieldsByPlayer = players
    .filter((player) => {
      const position = player.position?.label?.trim()
      if (!position) return false
      try {
        return normalizePosition(position) === "GOL"
      } catch {
        return false
      }
    })
    .map((player) =>
    Object.entries(player.stats ?? {})
      .filter(([key, value]) => /^gk/i.test(key) && value !== null && value !== undefined)
      .map(([key]) => `stats.${key}`)
    )

  return {
    positions: [...positions.entries()]
      .map(([sourceCode, occurrences]) => {
        let normalizedCode: string | null = null
        try {
          normalizedCode = normalizePosition(sourceCode)
        } catch {
          normalizedCode = null
        }
        return {
          sourceCode,
          normalizedCode,
          primaryOccurrences: occurrences.primary,
          alternateOccurrences: occurrences.alternate,
        }
      })
      .sort((left, right) => left.sourceCode.localeCompare(right.sourceCode)),
    coverage: {
      potential: players.filter((player) =>
        typeof player.potential === "number" && Number.isFinite(player.potential)
      ).length,
      salary: coverageFor(players, /salary|wage|compensation/i),
      contract: coverageFor(players, /contract/i),
      loan: coverageFor(players, /loan/i),
      goalkeeperSpecificAttributes: {
        players: goalkeeperFieldsByPlayer.filter((fields) => fields.length > 0).length,
        fields: [...new Set(goalkeeperFieldsByPlayer.flat())].sort(),
      },
    },
  }
}
