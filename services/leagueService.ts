import "server-only"
import { cache } from "react"
import { prisma } from "../lib/prisma"
import type { Prisma } from "../app/generated/prisma/client"
import { directoryPagination, parseDirectoryParams, type DirectoryInput } from "../lib/directoryCatalogParams"
import { getClubs } from "./clubService"
import { getPlayers } from "./playerService"

const leagueSelect = {
  id: true, name: true, slug: true, country: true,
  _count: { select: { clubs: true } },
} satisfies Prisma.LeagueSelect

export async function getLeagueCatalog(input: DirectoryInput = {}) {
  const { search, page, pageSize } = parseDirectoryParams(input)
  const where: Prisma.LeagueWhereInput = search
    ? { name: { contains: search, mode: "insensitive" } } : {}
  const [total, leagues] = await Promise.all([
    prisma.league.count({ where }),
    prisma.league.findMany({
      where, select: leagueSelect, orderBy: [{ name: "asc" }, { id: "asc" }],
      take: pageSize, skip: (page - 1) * pageSize,
    }),
  ])
  return { leagues, ...directoryPagination(total, page) }
}

export const getLeagueBySlug = cache(async (slug: string) =>
  prisma.league.findUnique({ where: { slug }, select: leagueSelect }),
)

export function getLeagueClubs(slug: string, input: Pick<DirectoryInput, "page" | "sort"> = {}) {
  return getClubs({ page: input.page, sort: input.sort, league: slug })
}

export function getLeaguePlayers(slug: string, input: Pick<DirectoryInput, "page"> = {}) {
  const { page, pageSize } = parseDirectoryParams(input)
  return getPlayers({ league: slug, page, pageSize, sort: "overall-desc" })
}
