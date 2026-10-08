import "server-only"
import { cache } from "react"
import { prisma } from "../lib/prisma"
import type { Prisma } from "../app/generated/prisma/client"
import { directoryPagination, parseDirectoryParams, type DirectoryInput } from "../lib/directoryCatalogParams"
import { getPlayers } from "./playerService"
import { calculateClubRating, compareRatedClubs } from "../lib/clubRating"
import { getBrandAssetsForEntities } from "./brandAssetReadService"
import { BAYER_LEVERKUSEN_LEGACY_ALIAS, isVerifiedLegacyClubAlias } from "./clubIdentityAliases"
import { futscoutPotentialReadSelect, readFutscoutPotential } from "../lib/futscoutPotential/read"
import { economicMarketValueReadSelect, readEconomicMarketValue } from "../lib/economicData/read"

const clubSelect = {
  id: true, name: true, slug: true, imageUrl: true,
  league: { select: { id: true, name: true, slug: true } },
  _count: { select: { players: true } },
} satisfies Prisma.ClubSelect

export async function getClubs(input: DirectoryInput = {}) {
  const { search, league, page, pageSize, sort } = parseDirectoryParams(input)
  const identitySelect = { id: true, name: true, externalId: true, apiFootballId: true, leagueId: true,
    _count: { select: { players: true } } } satisfies Prisma.ClubSelect
  const [placeholder, target] = await Promise.all([
    prisma.club.findUnique({ where: { slug: BAYER_LEVERKUSEN_LEGACY_ALIAS.slug }, select: identitySelect }),
    prisma.club.findUnique({ where: { apiFootballId: BAYER_LEVERKUSEN_LEGACY_ALIAS.targetApiFootballId }, select: identitySelect }),
  ])
  const alias = placeholder && target && placeholder._count.players === 0 &&
    isVerifiedLegacyClubAlias({ requestedSlug: BAYER_LEVERKUSEN_LEGACY_ALIAS.slug, placeholder, target })
    ? { placeholder, target } : null
  // Exclude only the verified empty legacy row BEFORE count, ordering and pagination.
  // The canonical row owns the roster, rating and registry asset; no database mutation.
  const where: Prisma.ClubWhereInput = {
    ...(search ? alias && alias.placeholder.name.toLowerCase().includes(search.toLowerCase())
      ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { id: alias.target.id }] }
      : { name: { contains: search, mode: "insensitive" } } : {}),
    ...(league ? { league: { is: { slug: league } } } : {}),
    ...(alias ? { id: { not: alias.placeholder.id } } : {}),
  }
  const [total, clubs] = await Promise.all([
    prisma.club.count({ where }),
    prisma.club.findMany({
      where, select: clubSelect, orderBy: [{ name: sort === "name-desc" ? "desc" : "asc" }, { id: "asc" }],
      ...(sort === "best" ? {} : { take: pageSize, skip: (page - 1) * pageSize }),
    }),
  ])
  const ratings = await getClubRatings(clubs.map(club => ({ id: club.id, total: club._count.players })))
  const assets = await getBrandAssetsForEntities({ clubIds: clubs.map(club => club.id), leagueIds: clubs.map(club => club.league.id) })
  const rated = clubs.map(club => ({ ...club,
    slug: alias && club.id === alias.target.id ? BAYER_LEVERKUSEN_LEGACY_ALIAS.slug : club.slug,
    asset: assets.clubs.get(club.id) ?? null,
    league: { ...club.league, asset: assets.leagues.get(club.league.id) ?? null }, rating: ratings.get(club.id)! }))
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
export async function getClubRoster(clubId: string) {
  const rows = await prisma.player.findMany({ where: { clubId }, select: {
    id: true, slug: true, name: true, imageUrl: true, position: true, officialOverall: true,
    secondaryPosition: true, secondaryPositions: true, potential: true,
    economicCurrents: economicMarketValueReadSelect,
    currentFutscoutPotential: futscoutPotentialReadSelect,
  }, orderBy: [{ officialOverall: "desc" }, { name: "asc" }, { id: "asc" }] })
  return rows.map(row => {
    const { currentFutscoutPotential: _current, economicCurrents: _economic, ...fields } = row
    void _current
    void _economic
    return { ...fields, ...readFutscoutPotential(row), ...readEconomicMarketValue(row) }
  })
}

// Request-local memoization shares the detail lookup with generateMetadata.
export const getClubBySlug = cache(async (slug: string) => {
  const identitySelect = { ...clubSelect, externalId: true, apiFootballId: true, leagueId: true } satisfies Prisma.ClubSelect
  const requested = await prisma.club.findUnique({ where: { slug }, select: identitySelect })
  if (!requested) return null

  let club = requested
  if (slug === BAYER_LEVERKUSEN_LEGACY_ALIAS.slug &&
      requested.externalId === BAYER_LEVERKUSEN_LEGACY_ALIAS.placeholderEaExternalId) {
    const target = await prisma.club.findUnique({
      where: { apiFootballId: BAYER_LEVERKUSEN_LEGACY_ALIAS.targetApiFootballId },
      select: identitySelect,
    })
    if (target && isVerifiedLegacyClubAlias({ requestedSlug: slug, placeholder: requested, target })) {
      club = {
        ...target,
        // Keep the already published legacy path resolving; links inside the detail stay on it.
        slug,
      }
    }
  }

  const assets = await getBrandAssetsForEntities({ clubIds: [club.id], leagueIds: [club.league.id] })
  return { id: club.id, name: club.name, slug: club.slug, imageUrl: club.imageUrl,
    _count: club._count, asset: assets.clubs.get(club.id) ?? null,
    league: { ...club.league, asset: assets.leagues.get(club.league.id) ?? null } }
})

export function getClubPlayers(clubId: string, input: Pick<DirectoryInput, "page"> = {}) {
  const { page, pageSize } = parseDirectoryParams(input)
  return getPlayers({ page, pageSize, sort: "overall-desc" }, { clubId })
}
