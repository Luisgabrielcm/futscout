import "server-only"
import { canReadClubContexts } from "../lib/clubContextReadGate"
import { jointReadManifest } from "../lib/jointTransferContexts"
import { selectedGameMembership } from "../lib/realGameProjection"
import type { JointSelection } from "./jointTransferRead.server"

import { prisma } from "../lib/prisma"
import { parsePlayerCatalogParams } from "../lib/playerCatalogParams"
import { getPlayerOrderBy } from "../lib/playerCatalogOrder"
import { nationalitySearchAliases } from "../lib/nationalitySearch"
import type { GetPlayersParams } from "../lib/playerCatalogParams"
export type { GetPlayersParams, PlayerSort } from "../lib/playerCatalogParams"

import {
  mapDatabasePlayer,
  mapDatabasePlayerProfile,
  type PlayerProfile,
} from "../mappers/mapDatabasePlayer"

import type {
  Player,
} from "../types/player"

import type {
  Prisma,
} from "../app/generated/prisma/client"
import { getBrandAssetsForEntities } from "./brandAssetReadService"
import { futscoutPotentialReadSelect, readFutscoutPotential } from "../lib/futscoutPotential/read"
import { potentialWhere, potentialPageSql } from "../lib/futscoutPotential/catalog"
import { economicMarketValueReadSelect, readEconomicMarketValue } from "../lib/economicData/read"
import { marketValueWhere, economicBargainsSql } from "../lib/economicData/catalog"
import { manualWage, readManualEconomics } from "./adminEconomic.server"
import { readResearchEconomics } from "./researchEconomicRead.server"
import { researchWage } from "../lib/researchEconomic"

async function mapPlayersWithBrandAssets(databasePlayers: Parameters<typeof mapDatabasePlayer>[0][], withWage = true,
  context: "GAME" | "REAL" = "GAME", existingSelections?: Map<string, JointSelection>): Promise<Player[]> {
  const joint = existingSelections ?? (jointReadManifest(globalThis.process?.env) ?
    await (await import("./jointTransferRead.server")).readJointTransferSelections(databasePlayers.map(p => p.externalId ?? null)) : new Map<string, JointSelection>())
  const [assets, manual, research] = await Promise.all([getBrandAssetsForEntities({
    clubIds: [...databasePlayers.flatMap(player => player.club?.id ? [player.club.id] : []), ...[...joint.values()].flatMap(s => [s.payload.jointTransfer.game.club?.id, s.payload.jointTransfer.real?.club?.id].filter((v): v is string => !!v))],
    leagueIds: [...databasePlayers.flatMap(player => player.club?.league.id ? [player.club.league.id] : []), ...[...joint.values()].flatMap(s => [s.payload.jointTransfer.game.club?.league?.id, s.payload.jointTransfer.real?.club?.league?.id].filter((v): v is string => !!v))],
  }),
    withWage ? readManualEconomics(databasePlayers.map(player => player.id)) : Promise.resolve(new Map()),
    withWage ? readResearchEconomics(databasePlayers.map(player => player.id)) : Promise.resolve(new Map())])
  const apply = joint.size ? (await import("./jointTransferRead.server")).applyJointPlayerPresentation : null
  return databasePlayers.map(databasePlayer => {
    const player = { ...mapDatabasePlayer(databasePlayer), ...readFutscoutPotential(databasePlayer), ...readEconomicMarketValue(databasePlayer) }
    if (player.club && databasePlayer.club?.id) player.club.asset = assets.clubs.get(databasePlayer.club.id) ?? null
    if (databasePlayer.club?.league.id) player.leagueAsset = assets.leagues.get(databasePlayer.club.league.id) ?? null
    const wage = manualWage(player.id, manual.get(player.id)) ?? researchWage(player.id, research.get(player.id))
    if (wage) player.wage = wage
    const selection = joint.get(databasePlayer.externalId ?? "")
    if (!apply || !(context === "GAME" ? selection?.views.game : selection?.views.real)) return player
    const shown = apply(player, joint.get(databasePlayer.externalId ?? ""), context) as Player
    if (shown.club?.id) shown.club.asset = assets.clubs.get(shown.club.id) ?? null
    const membership = context === "GAME" ? selection && selectedGameMembership(selection.payload, selection.views.game?.displayContext === "FUTSCOUT_PROJECTED") : selection?.payload.jointTransfer.real
    if (membership?.club?.league) shown.leagueAsset = assets.leagues.get(membership.club.league.id) ?? null
    return shown
  })
}


/* ========================================
   INCLUDE PADRÃO
======================================== */

const playerInclude = {
  economicCurrents: economicMarketValueReadSelect,
  currentFutscoutPotential: futscoutPotentialReadSelect,
  club: {
    include: {
      league: true,
    },
  },

  attributes: true,

  goalkeeperAttributes: true,

  playStyles: {
    include: {
      playStyle: true,
    },
  },
} satisfies Prisma.PlayerInclude

/* ========================================
   RESULTADO
======================================== */

export type PlayersPage = {
  jointFilterClubs?: { id: string; name: string }[]
  jointFilterNations?: { eaTeamId: string; name: string }[]
  players: Player[]

  total: number

  page: number

  pageSize: number

  totalPages: number
}

/* ========================================
   IDADE MÁXIMA
======================================== */

function getBirthDateForMaxAge(
  maxAge: number
) {
  const today =
    new Date()

  return new Date(
    Date.UTC(
      today.getUTCFullYear() -
        maxAge -
        1,

      today.getUTCMonth(),

      today.getUTCDate() + 1
    )
  )
}

/* ========================================
   BUSCAR JOGADORES
======================================== */

export async function getPlayers(
  input: GetPlayersParams = {},
  scope?: { clubId?: string; nationalities?: string[] },
): Promise<PlayersPage> {
  const params = parsePlayerCatalogParams(input)
  const joint = jointReadManifest(globalThis.process?.env) ? await (await import("./jointTransferRead.server")).readJointTransferSelections() : new Map<string, JointSelection>()
  const { page, pageSize } = params

  const skip =
    (page - 1) *
    pageSize

  const where:
    Prisma.PlayerWhereInput = {
      eaImportVisibility: "PUBLIC",
      ...(scope?.clubId ? { clubId: scope.clubId } : {}),
      ...(scope?.nationalities ? { nationality: { in: scope.nationalities } } : {}),
    }
  if (!joint.size && (params.membershipContext || params.currentClub || params.parentClub || params.clubState || params.nationalTeam))
    return { players: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 1 }
  if (params.playStyle) {
    where.playStyles = { some: { playStyle: { code: params.playStyle }, ...(params.playStyleLevel ? { level: params.playStyleLevel } : {}) } }
  }

  /* ========================================
     SEARCH
  ======================================== */

  const search =
    params.search?.trim()

  if (search) {
    where.OR = [
      {
        name: {
          contains:
            search,

          mode:
            "insensitive",
        },
      },

      {
        nationality: {
          contains:
            search,

          mode:
            "insensitive",
        },
      },

      {
        club: {
          is: {
            name: {
              contains:
                search,

              mode:
                "insensitive",
            },
          },
        },
      },
    ]
    const aliases = nationalitySearchAliases(search)
    if (aliases.length) where.OR.push({ nationality: { in: aliases, mode: "insensitive" } })
  }

  /* ========================================
     POSITION
  ======================================== */

  if (
    params.position
  ) {
    where.AND = [{ OR: [{ position: params.position }, { secondaryPositions: { has: params.position } }, { secondaryPosition: params.position }] }]
  }

  /* ========================================
     LEAGUE
  ======================================== */

  if (
    params.league
  ) {
    where.club = {
      is: {
        league: {
          is: {
            slug:
              params.league,
          },
        },
      },
    }
  }

  /* ========================================
     AGE
  ======================================== */

  if (
    params.maxAge !== undefined
  ) {
    where.dateOfBirth = {
      gte:
        getBirthDateForMaxAge(
          params.maxAge
        ),
    }
  }

  /* ========================================
     OVERALL
  ======================================== */

  if (
    params.minOverall !== undefined
  ) {
    where.officialOverall = {
      gte:
        params.minOverall,
    }
  }

  /* ========================================
     POTENTIAL
  ======================================== */

  if (
    params.minPotential !== undefined || params.maxPotential !== undefined
  ) {
    Object.assign(where, potentialWhere(params.minPotential, params.maxPotential))
  }

  /* ========================================
     MARKET VALUE
  ======================================== */

  if (
    params.minValue !== undefined || params.maxValue !== undefined
  ) {
    Object.assign(where, marketValueWhere(params.minValue, params.maxValue))
  }

  /* ========================================
     ATTRIBUTES
  ======================================== */

  const hasAttributeFilters =
    params.minPace !== undefined ||
    params.minShooting !== undefined ||
    params.minPassing !== undefined ||
    params.minDribbling !== undefined ||
    params.minDefending !== undefined ||
    params.minPhysical !== undefined

  if (
    hasAttributeFilters
  ) {
    where.attributes = {
      is: {
        ...(params.minPace !== undefined
          ? {
              pace: {
                gte:
                  params.minPace,
              },
            }
          : {}),

        ...(params.minShooting !== undefined
          ? {
              shooting: {
                gte:
                  params.minShooting,
              },
            }
          : {}),

        ...(params.minPassing !== undefined
          ? {
              passing: {
                gte:
                  params.minPassing,
              },
            }
          : {}),

        ...(params.minDribbling !== undefined
          ? {
              dribbling: {
                gte:
                  params.minDribbling,
              },
            }
          : {}),

        ...(params.minDefending !== undefined
          ? {
              defending: {
                gte:
                  params.minDefending,
              },
            }
          : {}),

        ...(params.minPhysical !== undefined
          ? {
              physical: {
                gte:
                  params.minPhysical,
              },
            }
          : {}),
      },
    }
  } else {
    where.attributes = {
      isNot: null,
    }
  }

  /* ========================================
     QUERY
  ======================================== */

  const projectedIds = new Set([...joint].filter(([, s]) => s.views.game?.displayContext === "FUTSCOUT_PROJECTED").map(([id]) => id))
  const jointFilter = joint.size ? (await import("../lib/jointTransferCatalog")).jointCatalogFilter([...joint.values()].filter(s => params.membershipContext === "REAL" ? s.views.real : s.views.game).map(s => s.payload), params, scope, projectedIds) : null
  if (jointFilter) {
    delete where.clubId; delete where.club; delete where.OR
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...jointFilter.where]
  }

  const [
    total,
    databasePlayers,
  ] =
    await Promise.all([
      prisma.player.count({
        where,
      }),

      params.sort.startsWith("potential-") || params.sort.startsWith("value-") ? (async () => {
        const ids = await prisma.$queryRaw<{ id: string }[]>(potentialPageSql(params, scope,
          params.maxAge !== undefined ? getBirthDateForMaxAge(params.maxAge) : undefined, jointFilter?.sql))
        const rows = await prisma.player.findMany({ where: { eaImportVisibility: "PUBLIC", id: { in: ids.map(row => row.id) } }, include: playerInclude })
        const byId = new Map(rows.map(row => [row.id, row]))
        return ids.map(row => byId.get(row.id)!).filter(Boolean)
      })() : prisma.player.findMany({
        where,

        include:
          playerInclude,

        orderBy:
          getPlayerOrderBy(
            params.sort
          ),

        skip,

        take:
          pageSize,
      }),
    ])

  const totalPages =
    Math.max(
      Math.ceil(
        total /
          pageSize
      ),
      1
    )

  return {
    ...(joint.size ? {
      jointFilterClubs: [...new Map([...joint.values()].flatMap(s => [s.views.game ? selectedGameMembership(s.payload, s.views.game.displayContext === "FUTSCOUT_PROJECTED") : null, s.views.real ? s.payload.jointTransfer.real : null].flatMap(m => m ? [m.club, m.parentClub].filter(c => c !== null).map(c => [c.id, { id: c.id, name: c.name }] as const) : []))).values()].sort((a, b) => a.name.localeCompare(b.name)),
      jointFilterNations: [...new Map([...joint.values()].flatMap(s => s.views.game ? s.payload.jointTransfer.game.nationalTeams.map(t => [t.eaTeamId, t] as const) : [])).values()],
    } : {}),
    players: await mapPlayersWithBrandAssets(databasePlayers, true, params.membershipContext ?? "GAME", joint),

    total,

    page,

    pageSize,

    totalPages,
  }
}

/* ========================================
   BUSCAR LIGAS
======================================== */

export async function getLeagues() {
  return prisma.league.findMany({
    where: { clubs: { some: { eaImportVisibility: "PUBLIC" } } },
    select: {
      id: true,
      name: true,
      slug: true,
    },

    orderBy: {
      name:
        "asc",
    },
  })
}

/* ========================================
   FUNÇÃO LEGADA
======================================== */

export async function getAllPlayers(): Promise<
  Player[]
> {
  const databasePlayers =
    await prisma.player.findMany({
      where: { eaImportVisibility: "PUBLIC" },
      include:
        playerInclude,

      orderBy: {
        name:
          "asc",
      },
    })

  // This legacy bulk helper is not a salary export endpoint.
  return mapPlayersWithBrandAssets(databasePlayers, false)
}

export function getTransferMarketPlayers(input: GetPlayersParams = {}) {
  return getPlayers({ ...input, membershipContext: "GAME", clubState: "FREE_AGENT", currentClub: undefined, parentClub: undefined })
}

/* ========================================
   PLAYER BY SLUG
======================================== */

export async function getPlayerBySlug(
  slug: string
): Promise<PlayerProfile | null> {
  const visibility = await prisma.player.findUnique({
    where: { slug },
    select: { eaImportVisibility: true },
  })
  if (visibility?.eaImportVisibility !== "PUBLIC") return null

  const databasePlayer =
    await prisma.player.findUnique({
      where: {
        slug,
      },

      include:
        playerInclude,
    })

  if (
    !databasePlayer || databasePlayer.eaImportVisibility !== "PUBLIC"
  ) {
    return null
  }

  const profile = mapDatabasePlayerProfile(databasePlayer)
  if (profile.status === "incomplete") return profile
  // The profile route already uses the same gated point reader.
  const [player] = await mapPlayersWithBrandAssets([databasePlayer], false)
  if (player.transferContexts?.game) return { status: "ready", player }
  if (!canReadClubContexts(databasePlayer.externalId, globalThis.process?.env)) return { status: "ready", player }
  const { readPlayerClubContexts } = await import("./playerClubContexts")
  const clubContexts = await readPlayerClubContexts(databasePlayer.externalId)
  return { status: "ready", player: clubContexts ? { ...player, clubContexts,
    // Legacy league belongs to the legacy club projection, not this selected snapshot.
    league: null, leagueSlug: null, leagueAsset: null, leagueLogoUrl: null } : player }
}

/* ========================================
   FEATURED
======================================== */

export async function getFeaturedPlayers(): Promise<
  Player[]
> {
  const elite =
    await prisma.player.findMany({
      where: {
        eaImportVisibility: "PUBLIC",
        attributes: {
          isNot: null,
        },
      },

      include:
        playerInclude,

      orderBy: [
        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ],

      take: 8,
    })

  const badForm =
    await prisma.player.findMany({
      where: {
        eaImportVisibility: "PUBLIC",
        officialOverall: {
          gte: 84,
        },

        form: {
          in: [
            "Péssima",
            "Ruim",
          ],
        },

        attributes: {
          isNot: null,
        },
      },

      include:
        playerInclude,

      orderBy: [
        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ],

      take: 4,
    })

  const bargainIds = await prisma.$queryRaw<{ id: string }[]>(economicBargainsSql)
  const bargainRows = await prisma.player.findMany({ where: { eaImportVisibility: "PUBLIC", id: { in: bargainIds.map(row => row.id) } }, include: playerInclude })
  const bargainMap = new Map(bargainRows.map(row => [row.id, row]))
  const bargains = bargainIds.map(row => bargainMap.get(row.id)!).filter(Boolean)

  const prospectIds = await prisma.$queryRaw<{ id: string }[]>(potentialPageSql({ minPotential: 87, sort: "potential-desc", pageSize: 4 }))
  const prospectRows = await prisma.player.findMany({ where: { eaImportVisibility: "PUBLIC", id: { in: prospectIds.map(row => row.id) } }, include: playerInclude })
  const prospectMap = new Map(prospectRows.map(row => [row.id, row]))
  const prospects = prospectIds.map(row => prospectMap.get(row.id)!).filter(Boolean)

  const combinedPlayers = [
    ...elite,
    ...badForm,
    ...bargains,
    ...prospects,
  ]

  const uniquePlayers =
    Array.from(
      new Map(
        combinedPlayers.map(
          (player) => [
            player.id,
            player,
          ]
        )
      ).values()
    )

  if (
    uniquePlayers.length <
    20
  ) {
    const existingIds =
      uniquePlayers.map(
        (player) =>
          player.id
      )

    const remaining =
      await prisma.player.findMany({
        where: {
          eaImportVisibility: "PUBLIC",
          id: {
            notIn:
              existingIds,
          },

          attributes: {
            isNot: null,
          },
        },

        include:
          playerInclude,

        orderBy: [
          {
            officialOverall:
              "desc",
          },

          {
            name:
              "asc",
          },
        ],

        take:
          20 -
          uniquePlayers.length,
      })

    uniquePlayers.push(
      ...remaining
    )
  }

  return mapPlayersWithBrandAssets(uniquePlayers.slice(0, 20))
}
