import assert from "node:assert/strict"
import {
  after,
  before,
  beforeEach,
  mock,
  test,
} from "node:test"

import { isApiFootballCacheOnlyMissError } from "../../../services/apiFootballErrors"

const originalDirectUrl =
  process.env.DIRECT_URL
const originalApiKey =
  process.env.API_FOOTBALL_KEY
const originalFetch =
  globalThis.fetch

const database = {
  club: {
    id: "club-1",
    name: "Real Madrid",
    apiFootballId:
      null as number | null,
  },
  conflictingClub:
    null as {
      id: string
      name: string
      apiFootballId: number
    } | null,
  updates: [] as unknown[],
  apiCalls: 0,
  apiTeams: [
    {
      team: {
        id: 541,
        name: "Real Madrid",
        country: "Spain",
        logo: null,
      },
    },
  ],
}

type PrismaModule = typeof import(
  "../../../lib/prisma"
)
type ResolverModule = typeof import(
  "../../../services/resolveApiFootballClub"
)

let prismaClient: PrismaModule["prisma"]
let originalClubDescriptor:
  | PropertyDescriptor
  | undefined
let clearApiFootballClubCache:
  ResolverModule["clearApiFootballClubCache"]
let resolveApiFootballClub:
  ResolverModule["resolveApiFootballClub"]

before(async () => {
  process.env.DIRECT_URL =
    "postgresql://unit:unit@127.0.0.1:5432/unit"
  process.env.API_FOOTBALL_KEY =
    "unit-test-key"

  const { prisma } = await import(
    "../../../lib/prisma"
  )

  prismaClient = prisma
  originalClubDescriptor =
    Object.getOwnPropertyDescriptor(
      prismaClient,
      "club"
    )

  Object.defineProperty(
    prismaClient,
    "club",
    {
      configurable: true,
      value: {
        findUnique: async (
          args: unknown
        ) => {
          const where = (
            args as {
              where: Record<
                string,
                unknown
              >
            }
          ).where

          if (
            "id" in where
          ) {
            return {
              ...database.club,
            }
          }

          if (
            database.conflictingClub &&
            where.apiFootballId ===
              database.conflictingClub
                .apiFootballId
          ) {
            return {
              id:
                database.conflictingClub
                  .id,
              name:
                database.conflictingClub
                  .name,
            }
          }

          return null
        },
        update: async (
          args: unknown
        ) => {
          database.updates.push(
            args
          )

          database.club.apiFootballId =
            (
              args as {
                data: {
                  apiFootballId: number
                }
              }
            ).data.apiFootballId

          return args
        },
      },
    }
  )

  const service = await import(
    "../../../services/resolveApiFootballClub"
  )

  clearApiFootballClubCache =
    service.clearApiFootballClubCache
  resolveApiFootballClub =
    service.resolveApiFootballClub
})

after(() => {
  globalThis.fetch = originalFetch
  mock.restoreAll()

  if (originalClubDescriptor) {
    Object.defineProperty(
      prismaClient,
      "club",
      originalClubDescriptor
    )
  } else if (prismaClient) {
    delete (
      prismaClient as unknown as
        Record<string, unknown>
    ).club
  }

  if (originalApiKey === undefined) {
    delete process.env.API_FOOTBALL_KEY
  } else {
    process.env.API_FOOTBALL_KEY =
      originalApiKey
  }

  if (originalDirectUrl === undefined) {
    delete process.env.DIRECT_URL
  } else {
    process.env.DIRECT_URL =
      originalDirectUrl
  }
})

beforeEach(() => {
  clearApiFootballClubCache()
  database.club = {
    id: "club-1",
    name: "Real Madrid",
    apiFootballId: null,
  }
  database.conflictingClub =
    null
  database.updates.length = 0
  database.apiCalls = 0
  database.apiTeams = [
    {
      team: {
        id: 541,
        name: "Real Madrid",
        country: "Spain",
        logo: null,
      },
    },
  ]

  globalThis.fetch = mock.fn(
    async () => {
      database.apiCalls++

      return new Response(
        JSON.stringify({
          errors: [],
          results:
            database.apiTeams.length,
          response:
            database.apiTeams,
        }),
        {
          status: 200,
          headers: {
            "content-type":
              "application/json",
          },
        }
      )
    }
  ) as typeof fetch
})

test("persiste após resolução save=false seguida de save=true", async () => {
  const first =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: false,
    })

  assert.equal(
    first?.apiFootballId,
    541
  )
  assert.equal(
    database.updates.length,
    0
  )

  const second =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: true,
    })

  assert.equal(
    second?.apiFootballId,
    541
  )
  assert.equal(
    database.updates.length,
    1
  )
  assert.equal(
    database.apiCalls,
    1
  )
})

test("rejeita conflito no cache API quando outro clube possui o ID", async () => {
  await resolveApiFootballClub({
    clubId: "club-1",
    save: false,
  })

  database.conflictingClub = {
    id: "club-2",
    name: "Another Club",
    apiFootballId: 541,
  }

  await assert.rejects(
    resolveApiFootballClub({
      clubId: "club-1",
      save: true,
    }),
    /Conflito de apiFootballId=541/
  )

  assert.equal(
    database.updates.length,
    0
  )
  assert.equal(
    database.apiCalls,
    1
  )
})

test("não sobrescreve outro ID adquirido pelo próprio clube", async () => {
  await resolveApiFootballClub({
    clubId: "club-1",
    save: false,
  })

  database.club.apiFootballId =
    999

  await assert.rejects(
    resolveApiFootballClub({
      clubId: "club-1",
      save: true,
    }),
    /já possui apiFootballId=999/
  )

  assert.equal(
    database.updates.length,
    0
  )
  assert.equal(
    database.apiCalls,
    1
  )
})

test("não restaura ID stale de cache originado do banco", async () => {
  database.club.apiFootballId =
    541

  const first =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: false,
    })

  assert.equal(
    first?.source,
    "database"
  )

  database.club.apiFootballId =
    null
  database.apiTeams = []

  const second =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: true,
    })

  assert.equal(second, null)
  assert.equal(
    database.updates.length,
    0
  )
  assert.equal(
    database.apiCalls,
    1
  )
})

test("reutiliza cache database válido sem update ou fetch", async () => {
  database.club.apiFootballId =
    541

  const first =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: false,
    })

  const second =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: true,
    })

  assert.equal(
    first?.source,
    "database"
  )
  assert.equal(
    second?.apiFootballId,
    541
  )
  assert.equal(
    database.updates.length,
    0
  )
  assert.equal(
    database.apiCalls,
    0
  )
})

test("cache-only blocks teams fetch when club ID is unavailable", async () => {
  await assert.rejects(
    resolveApiFootballClub({
      clubId: "club-1",
      save: true,
      cacheOnly: true,
    }),
    isApiFootballCacheOnlyMissError
  )

  assert.equal(database.apiCalls, 0)
  assert.equal(database.updates.length, 0)
})

test("persisted club ID works in cache-only mode without fetch", async () => {
  database.club.apiFootballId = 541

  const result = await resolveApiFootballClub({
    clubId: "club-1",
    save: true,
    cacheOnly: true,
  })

  assert.equal(result?.apiFootballId, 541)
  assert.equal(result?.source, "database")
  assert.equal(database.apiCalls, 0)
  assert.equal(database.updates.length, 0)
})

test("runtime club cache works in cache-only mode without persistence", async () => {
  const first =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: false,
    })

  assert.equal(first?.source, "api-football")
  assert.equal(database.apiCalls, 1)
  assert.equal(database.updates.length, 0)

  const second =
    await resolveApiFootballClub({
      clubId: "club-1",
      save: true,
      cacheOnly: true,
    })

  assert.equal(second?.apiFootballId, 541)
  assert.equal(database.apiCalls, 1)
  assert.equal(database.updates.length, 0)
})
