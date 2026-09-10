import { parsePlayerCatalogParams } from "./playerCatalogParams"

export type DirectoryInput = { search?: unknown; league?: unknown; page?: unknown; sort?: unknown }
export const CLUB_SORTS = ["name-asc", "name-desc", "best"] as const

// Reuse the catalog's validation; directory page size is fixed and not public.
export function parseDirectoryParams(input: DirectoryInput = {}) {
  const { search, league, page } = parsePlayerCatalogParams(input)
  const rawSort = Array.isArray(input.sort) ? input.sort[0] : input.sort
  const sort = CLUB_SORTS.find(value => value === rawSort) ?? "name-asc"
  return { search, league, page, sort, pageSize: 24 }
}

export function directoryHref(path: string, input: DirectoryInput = {}) {
  const { search, league, page, sort } = parseDirectoryParams(input)
  const query = new URLSearchParams()
  if (search) query.set("search", search)
  if (league) query.set("league", league)
  if (page > 1) query.set("page", String(page))
  if (sort !== "name-asc") query.set("sort", sort)
  return query.size ? `${path}?${query}` : path
}

export function directoryPagination(total: number, page: number) {
  return { total, page, pageSize: 24, totalPages: Math.max(1, Math.ceil(total / 24)) }
}

// League.country is required in Prisma, but EA sync inserts this placeholder.
export function displayCountry(country: string): string | null {
  const value = country.trim()
  return !value || ["não informado", "unknown", "n/a"].includes(value.toLowerCase())
    ? null : value
}
