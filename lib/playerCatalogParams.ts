import type { PlayerPosition } from "../types/player"
import { styles } from "./playStyleAssets"

export const PLAYER_SORTS = [
  "overall-desc", "overall-asc", "potential-desc", "age-asc",
  "pace-desc", "passing-desc", "dribbling-desc", "value-asc",
  "value-desc", "name-asc", "name-desc", "position-asc",
] as const

export type PlayerSort = (typeof PLAYER_SORTS)[number]
export type CatalogSearchParams = Record<string, string | string[] | undefined>

const POSITIONS: readonly PlayerPosition[] = [
  "GOL", "LD", "LE", "ZAG", "VOL", "MC", "MEI", "PD", "PE", "ATA",
]

export const NUMERIC_FILTER_LIMITS = {
  maxAge: [0, 120],
  minOverall: [0, 99],
  minPotential: [0, 99],
  maxValue: [0, Number.MAX_SAFE_INTEGER],
  minPace: [0, 99],
  minShooting: [0, 99],
  minPassing: [0, 99],
  minDribbling: [0, 99],
  minDefending: [0, 99],
  minPhysical: [0, 99],
} as const

type NumericFilter = keyof typeof NUMERIC_FILTER_LIMITS
export type GetPlayersParams = Partial<Record<NumericFilter, number>> & {
  search?: string
  position?: PlayerPosition
  league?: string
  playStyle?: string
  playStyleLevel?: "plus"
  page?: number
  pageSize?: number
  sort?: PlayerSort
}

type CatalogInput = Partial<Record<keyof GetPlayersParams, unknown>>

// Repeated parameters consistently use the first value, never array coercion.
function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function textValue(value: unknown): string | undefined {
  const first = firstValue(value)
  return typeof first === "string" ? first.trim().slice(0, 200) || undefined : undefined
}

function integerValue(value: unknown, min: number, max: number): number | undefined {
  const first = firstValue(value)
  if (typeof first !== "number" && typeof first !== "string") return undefined
  if (typeof first === "string" && !first.trim()) return undefined
  const number = Number(first)
  return Number.isSafeInteger(number) && number >= min && number <= max
    ? number : undefined
}

// Used at BOTH the URL boundary and the service boundary before Date/BigInt/Prisma.
// Invalid filters are ignored; invalid navigation falls back to page 1 / size 24.
export function parsePlayerCatalogParams(input: CatalogInput = {}) {
  const numeric: Partial<Record<NumericFilter, number>> = {}
  for (const key of Object.keys(NUMERIC_FILTER_LIMITS) as NumericFilter[]) {
    const [min, max] = NUMERIC_FILTER_LIMITS[key]
    const value = integerValue(input[key], min, max)
    if (value !== undefined) numeric[key] = value
  }
  const position = textValue(input.position)
  const sort = textValue(input.sort)
  return {
    ...numeric,
    search: textValue(input.search),
    position: POSITIONS.find((item) => item === position),
    league: textValue(input.league),
    playStyle: styles.find(style => style.key === textValue(input.playStyle))?.key,
    playStyleLevel: styles.some(style => style.key === textValue(input.playStyle)) && textValue(input.playStyleLevel) === "plus" ? "plus" as const : undefined,
    page: integerValue(input.page, 1, 100_000) ?? 1,
    pageSize: integerValue(input.pageSize, 1, 100) ?? 24,
    sort: PLAYER_SORTS.find((item) => item === sort) ?? "overall-desc",
  }
}

// Canonical URLs contain only applied, valid public filters. Page size is internal.
export function playerCatalogQuery(input: CatalogInput = {}): string {
  const values = parsePlayerCatalogParams(input)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (key === "pageSize" || value === undefined || (key === "page" && value === 1) ||
      (key === "sort" && value === "overall-desc")) continue
    query.set(key, String(value))
  }
  return query.toString()
}

export function removePlayerCatalogFilter(
  applied: CatalogInput,
  key: keyof GetPlayersParams,
): string {
  return playerCatalogQuery({ ...applied, [key]: undefined, page: 1 })
}
