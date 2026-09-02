import assert from "node:assert/strict"
import { after, before, beforeEach, mock, test } from "node:test"

import {
  isApiFootballRateLimitError,
} from "../../../services/apiFootballErrors"

type DatabaseCache = {
  apiTeamId: number
  season: number
  players: unknown
  playerCount: number
  fetchedAt: Date
  expiresAt: Date
} | null

const database = {
  cached: null as DatabaseCache,
  findCalls: 0,
  upserts: [] as unknown[],
  events: [] as string[],
}

const originalDirectUrl =
  process.env.DIRECT_URL
const originalApiKey =
  process.env.API_FOOTBALL_KEY

type TeamPlayersModule = typeof import(
  "../../../services/getApiFootballTeamPlayers"
)

let clearApiFootballTeamPlayersCache:
  TeamPlayersModule["clearApiFootballTeamPlayersCache"]
let getApiFootballTeamPlayers:
  TeamPlayersModule["getApiFootballTeamPlayers"]
let hasApiFootballTeamPlayersCache:
  TeamPlayersModule["hasApiFootballTeamPlayersCache"]

type PrismaModule = typeof import(
  "../../../lib/prisma"
)

let prismaClient: PrismaModule["prisma"]
let originalRosterCacheDescriptor:
  PropertyDescriptor | undefined

const originalFetch = globalThis.fetch

before(async () => {
  process.env.DIRECT_URL =
    "postgresql://unit:unit@127.0.0.1:5432/unit"
  process.env.API_FOOTBALL_KEY =
    "unit-test-key"

  const { prisma } = await import(
    "../../../lib/prisma"
  )

  prismaClient = prisma
  originalRosterCacheDescriptor =
    Object.getOwnPropertyDescriptor(
      prismaClient,
      "apiFootballTeamRosterCache"
    )

  Object.defineProperty(
    prismaClient,
    "apiFootballTeamRosterCache",
    {
      configurable: true,
      value: {
        findUnique: async () => {
          database.findCalls++
          return database.cached
        },
        upsert: async (args: unknown) => {
          database.events.push("upsert")
          database.upserts.push(args)
          return args
        },
      },
    }
  )

  const service = await import(
    "../../../services/getApiFootballTeamPlayers"
  )

  clearApiFootballTeamPlayersCache =
    service.clearApiFootballTeamPlayersCache
  getApiFootballTeamPlayers =
    service.getApiFootballTeamPlayers
  hasApiFootballTeamPlayersCache =
    service.hasApiFootballTeamPlayersCache
})

after(() => {
  globalThis.fetch = originalFetch
  mock.restoreAll()

  if (originalRosterCacheDescriptor) {
    Object.defineProperty(
      prismaClient,
      "apiFootballTeamRosterCache",
      originalRosterCacheDescriptor
    )
  } else if (prismaClient) {
    delete (
      prismaClient as unknown as
        Record<string, unknown>
    ).apiFootballTeamRosterCache
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
  clearApiFootballTeamPlayersCache()
  database.cached = null
  database.findCalls = 0
  database.upserts.length = 0
  database.events.length = 0
  process.env.API_FOOTBALL_KEY =
    "unit-test-key"
})

function player(id: number) {
  return {
    player: {
      id,
      name: `Player ${id}`,
      firstname: `Player`,
      lastname: String(id),
      age: 20,
      birth: {
        date: "2006-01-01",
        place: null,
        country: null,
      },
      nationality: null,
      height: null,
      weight: null,
      injured: false,
      photo: null,
    },
    statistics: [],
  }
}

function apiResponse({
  page,
  total,
}: {
  page: number
  total: number
}) {
  return new Response(
    JSON.stringify({
      errors: [],
      results: 1,
      paging: {
        current: page,
        total,
      },
      response: [player(page)],
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

function requestedPage(
  input: string | URL | Request
) {
  const value =
    input instanceof Request
      ? input.url
      : String(input)

  return Number(
    new URL(value).searchParams.get(
      "page"
    )
  )
}

function persistedPlayerIds(
  upsert: unknown
) {
  const args = upsert as {
    create: {
      players: Array<{
        player: {
          id: number
        }
      }>
    }
  }

  return args.create.players.map(
    (item) => item.player.id
  )
}

test("loads every page when the API reports five pages", async () => {
  const pages: number[] = []

  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      pages.push(page)
      return apiResponse({ page, total: 5 })
    }
  ) as typeof fetch

  const result =
    await getApiFootballTeamPlayers({
      teamId: 10,
      season: 2024,
    })

  assert.deepEqual(pages, [1, 2, 3, 4, 5])
  assert.deepEqual(
    result.map((item) => item.player.id),
    [1, 2, 3, 4, 5]
  )
  assert.equal(database.upserts.length, 1)
})

test("loads three pages, persists once, and reuses memory cache", async () => {
  const pages: number[] = []

  assert.equal(
    hasApiFootballTeamPlayersCache({
      teamId: 20,
      season: 2024,
    }),
    false
  )

  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      pages.push(page)
      database.events.push(
        `fetch${page}`
      )
      return apiResponse({ page, total: 3 })
    }
  ) as typeof fetch

  const first =
    await getApiFootballTeamPlayers({
      teamId: 20,
      season: 2024,
    })

  const second =
    await getApiFootballTeamPlayers({
      teamId: 20,
      season: 2024,
    })

  assert.deepEqual(pages, [1, 2, 3])
  assert.deepEqual(database.events, [
    "fetch1",
    "fetch2",
    "fetch3",
    "upsert",
  ])
  assert.deepEqual(
    persistedPlayerIds(
      database.upserts[0]
    ),
    [1, 2, 3]
  )
  assert.equal(
    hasApiFootballTeamPlayersCache({
      teamId: 20,
      season: 2024,
    }),
    true
  )
  assert.deepEqual(
    first.map((item) => item.player.id),
    [1, 2, 3]
  )
  assert.deepEqual(second, first)
  assert.equal(database.findCalls, 1)
  assert.equal(database.upserts.length, 1)
})

test("persists all five reported pages instead of a truncated roster", async () => {
  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      return apiResponse({ page, total: 5 })
    }
  ) as typeof fetch

  await getApiFootballTeamPlayers({
    teamId: 25,
    season: 2024,
  })

  assert.equal(database.upserts.length, 1)
  assert.deepEqual(
    persistedPlayerIds(
      database.upserts[0]
    ),
    [1, 2, 3, 4, 5]
  )
})

test("does not cache a partial roster when page two fails generically", async () => {
  const pages: number[] = []

  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      pages.push(page)

      if (page === 2) {
        return new Response(
          "upstream failure",
          { status: 500 }
        )
      }

      return apiResponse({ page, total: 3 })
    }
  ) as typeof fetch

  await assert.rejects(
    getApiFootballTeamPlayers({
      teamId: 30,
      season: 2024,
    }),
    /API-Football HTTP 500/
  )

  assert.deepEqual(pages, [1, 2])
  assert.equal(database.upserts.length, 0)

  await assert.rejects(
    getApiFootballTeamPlayers({
      teamId: 30,
      season: 2024,
    }),
    /API-Football HTTP 500/
  )

  assert.deepEqual(pages, [1, 2, 1, 2])
})

test("propagates rate limit on page two without caching a partial roster", async () => {
  const pages: number[] = []

  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      pages.push(page)

      if (page === 2) {
        return new Response(null, {
          status: 429,
        })
      }

      return apiResponse({ page, total: 3 })
    }
  ) as typeof fetch

  await assert.rejects(
    getApiFootballTeamPlayers({
      teamId: 40,
      season: 2024,
    }),
    isApiFootballRateLimitError
  )

  assert.deepEqual(pages, [1, 2])
  assert.equal(database.upserts.length, 0)
  assert.equal(
    hasApiFootballTeamPlayersCache({
      teamId: 40,
      season: 2024,
    }),
    false
  )
})

test("loads and caches a single-page roster", async () => {
  const pages: number[] = []

  globalThis.fetch = mock.fn(
    async (input) => {
      const page = requestedPage(input)
      pages.push(page)
      return apiResponse({ page, total: 1 })
    }
  ) as typeof fetch

  const first =
    await getApiFootballTeamPlayers({
      teamId: 50,
      season: 2024,
    })

  const second =
    await getApiFootballTeamPlayers({
      teamId: 50,
      season: 2024,
    })

  assert.deepEqual(pages, [1])
  assert.equal(first.length, 1)
  assert.deepEqual(second, first)
  assert.equal(database.findCalls, 1)
  assert.equal(database.upserts.length, 1)
})
