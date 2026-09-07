import "server-only"
import { cache } from "react"
import { prisma } from "../lib/prisma"
import type { Prisma } from "../app/generated/prisma/client"
import { directoryPagination, parseDirectoryParams, type DirectoryInput } from "../lib/directoryCatalogParams"
import { getPlayers } from "./playerService"

const clubSelect = {
  id: true, name: true, slug: true, imageUrl: true,
  league: { select: { name: true, slug: true } },
  _count: { select: { players: true } },
} satisfies Prisma.ClubSelect

export async function getClubs(input: DirectoryInput = {}) {
  const { search, league, page, pageSize } = parseDirectoryParams(input)
  const where: Prisma.ClubWhereInput = {
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(league ? { league: { is: { slug: league } } } : {}),
  }
  const [total, clubs] = await Promise.all([
    prisma.club.count({ where }),
    prisma.club.findMany({
      where, select: clubSelect, orderBy: [{ name: "asc" }, { id: "asc" }],
      take: pageSize, skip: (page - 1) * pageSize,
    }),
  ])
  return { clubs, ...directoryPagination(total, page) }
}

// Request-local memoization shares the detail lookup with generateMetadata.
export const getClubBySlug = cache(async (slug: string) =>
  prisma.club.findUnique({ where: { slug }, select: clubSelect }),
)

export function getClubPlayers(clubId: string, input: Pick<DirectoryInput, "page"> = {}) {
  const { page, pageSize } = parseDirectoryParams(input)
  return getPlayers({ page, pageSize, sort: "overall-desc" }, { clubId })
}
