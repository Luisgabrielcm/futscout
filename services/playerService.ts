import "server-only"

import { prisma } from "../lib/prisma"
import { parsePlayerCatalogParams } from "../lib/playerCatalogParams"
import { getPlayerOrderBy } from "../lib/playerCatalogOrder"
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


/* ========================================
   INCLUDE PADRÃO
======================================== */

const playerInclude = {
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
  const { page, pageSize } = params

  const skip =
    (page - 1) *
    pageSize

  const where:
    Prisma.PlayerWhereInput = {
      ...(scope?.clubId ? { clubId: scope.clubId } : {}),
      ...(scope?.nationalities ? { nationality: { in: scope.nationalities } } : {}),
    }
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
    params.minPotential !== undefined
  ) {
    where.potential = {
      gte:
        params.minPotential,
    }
  }

  /* ========================================
     MARKET VALUE
  ======================================== */

  if (
    params.maxValue !== undefined
  ) {
    where.marketValue = {
      lte:
        BigInt(
          params.maxValue
        ),
    }
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

  const [
    total,
    databasePlayers,
  ] =
    await Promise.all([
      prisma.player.count({
        where,
      }),

      prisma.player.findMany({
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
    players:
      databasePlayers.map(
        mapDatabasePlayer
      ),

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
      include:
        playerInclude,

      orderBy: {
        name:
          "asc",
      },
    })

  return databasePlayers.map(
    mapDatabasePlayer
  )
}

/* ========================================
   PLAYER BY SLUG
======================================== */

export async function getPlayerBySlug(
  slug: string
): Promise<PlayerProfile | null> {
  const databasePlayer =
    await prisma.player.findUnique({
      where: {
        slug,
      },

      include:
        playerInclude,
    })

  if (
    !databasePlayer
  ) {
    return null
  }

  return mapDatabasePlayerProfile(
    databasePlayer
  )
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

  const bargains =
    await prisma.player.findMany({
      where: {
        officialOverall: {
          gte: 80,
        },

        marketValue: {
          not: null,

          lte:
            BigInt(
              50000000
            ),
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
          marketValue:
            "asc",
        },
      ],

      take: 4,
    })

  const prospects =
    await prisma.player.findMany({
      where: {
        potential: {
          not: null,

          gte: 87,
        },

        attributes: {
          isNot: null,
        },
      },

      include:
        playerInclude,

      orderBy: [
        {
          potential:
            "desc",
        },

        {
          officialOverall:
            "desc",
        },
      ],

      take: 4,
    })

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

  return uniquePlayers
    .slice(
      0,
      20
    )
    .map(
      mapDatabasePlayer
    )
}
