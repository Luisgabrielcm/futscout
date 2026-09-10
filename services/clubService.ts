import "server-only"
import { cache } from "react"
import { prisma } from "../lib/prisma"
import type { Prisma } from "../app/generated/prisma/client"
import { directoryPagination, parseDirectoryParams, type DirectoryInput } from "../lib/directoryCatalogParams"
import { getPlayers } from "./playerService"
import { calculateClubRating, compareRatedClubs } from "../lib/clubRating"

const clubSelect = {
  id: true, name: true, slug: true, imageUrl: true,
  league: { select: { name: true, slug: true } },
  _count: { select: { players: true } },
} satisfies Prisma.ClubSelect

export async function getClubs(input: DirectoryInput = {}) {
  const { search, league, page, pageSize, sort } = parseDirectoryParams(input)
  const where: Prisma.ClubWhereInput = {
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(league ? { league: { is: { slug: league } } } : {}),
  }
  const [total, clubs] = await Promise.all([
    prisma.club.count({ where }),
    prisma.club.findMany({
      where, select: clubSelect, orderBy: [{ name: sort === "name-desc" ? "desc" : "asc" }, { id: "asc" }],
      ...(sort === "best" ? {} : { take: pageSize, skip: (page - 1) * pageSize }),
    }),
  ])
  const ratings = await getClubRatings(clubs.map(club => ({ id: club.id, total: club._count.players })))
  const rated = clubs.map(club => ({ ...club, rating: ratings.get(club.id)! }))
  // Rank compact club metadata + DB aggregates, never all player rows or a single page.
  const result = sort === "best" ? rated.sort(compareRatedClubs).slice((page - 1) * pageSize, page * pageSize) : rated
  return { clubs: result, ...directoryPagination(total, page) }
}

export async function getClubRatings(clubs: { id: string; total: number }[]) {
  if (!clubs.length) return new Map<string, ReturnType<typeof calculateClubRating>>()
  const groups = await prisma.player.groupBy({
    by: ["clubId", "position"],
    where: { clubId: { in: clubs.map(club => club.id) }, officialOverall: { gte: 0, lte: 99 } },
    _sum: { officialOverall: true }, _count: { _all: true },
  })
  return new Map(clubs.map(club => [club.id, calculateClubRating(groups.filter(group => group.clubId === club.id).map(group => ({ position: group.position, totalOverall: group._sum.officialOverall, count: group._count._all })), club.total)]))
}

// Overview loads only one club's compact roster. No stats/PlayStyle/attribute joins.
export function getClubRoster(clubId: string) {
  return prisma.player.findMany({ where: { clubId }, select: {
    id: true, slug: true, name: true, imageUrl: true, position: true, officialOverall: true,
  }, orderBy: [{ officialOverall: "desc" }, { name: "asc" }, { id: "asc" }] })
}

// Request-local memoization shares the detail lookup with generateMetadata.
export const getClubBySlug = cache(async (slug: string) =>
  prisma.club.findUnique({ where: { slug }, select: clubSelect }),
)

export function getClubPlayers(clubId: string, input: Pick<DirectoryInput, "page"> = {}) {
  const { page, pageSize } = parseDirectoryParams(input)
  return getPlayers({ page, pageSize, sort: "overall-desc" }, { clubId })
}
