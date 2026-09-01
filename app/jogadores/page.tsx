import Link from "next/link"

import {
  getLeagues,
  getPlayers,
} from "../../services/playerService"

import type {
  PlayerSort,
} from "../../services/playerService"

import type {
  PlayerPosition,
} from "../../types/player"

import PlayersSearch from "../components/PlayersSearch"

type PlayersPageProps = {
  searchParams: Promise<{
    search?: string
    position?: string
    league?: string

    maxAge?: string
    minOverall?: string
    minPotential?: string
    maxValue?: string

    minPace?: string
    minShooting?: string
    minPassing?: string
    minDribbling?: string
    minDefending?: string
    minPhysical?: string

    page?: string
    sort?: string
  }>
}

/* ========================================
   POSIÇÕES VÁLIDAS
======================================== */

const validPositions: PlayerPosition[] = [
  "GOL",
  "LD",
  "LE",
  "ZAG",
  "VOL",
  "MC",
  "MEI",
  "PD",
  "PE",
  "ATA",
]

/* ========================================
   HELPERS
======================================== */

function parseOptionalNumber(
  value?: string
): number | undefined {
  if (!value) {
    return undefined
  }

  const number =
    Number(value)

  if (
    !Number.isFinite(number)
  ) {
    return undefined
  }

  return number
}

function parsePage(
  value?: string
): number {
  const page =
    parseOptionalNumber(
      value
    )

  if (!page) {
    return 1
  }

  return Math.max(
    Math.floor(page),
    1
  )
}

function parsePosition(
  value?: string
): PlayerPosition | undefined {
  if (!value) {
    return undefined
  }

  if (
    validPositions.includes(
      value as PlayerPosition
    )
  ) {
    return value as PlayerPosition
  }

  return undefined
}

function parseSort(
  value?: string
): PlayerSort {
  switch (value) {
    case "overall-asc":
    case "potential-desc":
    case "age-asc":
    case "pace-desc":
    case "passing-desc":
    case "dribbling-desc":
    case "value-asc":
    case "value-desc":
    case "name-asc":
    case "name-desc":
      return value

    case "overall-desc":
    default:
      return "overall-desc"
  }
}

/* ========================================
   PAGE
======================================== */

export default async function PlayersPage({
  searchParams,
}: PlayersPageProps) {
  const params =
    await searchParams

  const [
    result,
    leagues,
  ] =
    await Promise.all([
      getPlayers({
        search:
          params.search,

        position:
          parsePosition(
            params.position
          ),

        league:
          params.league,

        maxAge:
          parseOptionalNumber(
            params.maxAge
          ),

        minOverall:
          parseOptionalNumber(
            params.minOverall
          ),

        minPotential:
          parseOptionalNumber(
            params.minPotential
          ),

        maxValue:
          parseOptionalNumber(
            params.maxValue
          ),

        minPace:
          parseOptionalNumber(
            params.minPace
          ),

        minShooting:
          parseOptionalNumber(
            params.minShooting
          ),

        minPassing:
          parseOptionalNumber(
            params.minPassing
          ),

        minDribbling:
          parseOptionalNumber(
            params.minDribbling
          ),

        minDefending:
          parseOptionalNumber(
            params.minDefending
          ),

        minPhysical:
          parseOptionalNumber(
            params.minPhysical
          ),

        page:
          parsePage(
            params.page
          ),

        pageSize:
          24,

        sort:
          parseSort(
            params.sort
          ),
      }),

      getLeagues(),
    ])

  /* ========================================
     PAGINAÇÃO
  ======================================== */

  function createPageHref(
    page: number
  ) {
    const query =
      new URLSearchParams()

    const entries = [
      [
        "search",
        params.search,
      ],

      [
        "position",
        params.position,
      ],

      [
        "league",
        params.league,
      ],

      [
        "maxAge",
        params.maxAge,
      ],

      [
        "minOverall",
        params.minOverall,
      ],

      [
        "minPotential",
        params.minPotential,
      ],

      [
        "maxValue",
        params.maxValue,
      ],

      [
        "minPace",
        params.minPace,
      ],

      [
        "minShooting",
        params.minShooting,
      ],

      [
        "minPassing",
        params.minPassing,
      ],

      [
        "minDribbling",
        params.minDribbling,
      ],

      [
        "minDefending",
        params.minDefending,
      ],

      [
        "minPhysical",
        params.minPhysical,
      ],

      [
        "sort",
        params.sort,
      ],
    ] as const

    for (
      const [
        key,
        value,
      ] of entries
    ) {
      if (value) {
        query.set(
          key,
          value
        )
      }
    }

    query.set(
      "page",
      String(page)
    )

    return `/jogadores?${query.toString()}`
  }

  return (
    <main
      className="playersPage"
    >
      <Link
        href="/"
        className="backButton"
      >
        ← Voltar
      </Link>

      <header
        className="playersPageHeader"
      >
        <span>
          DATABASE
        </span>

        <h1>
          Jogadores
        </h1>

        <p>
          Explore os jogadores disponíveis
          no FutScout e encontre a melhor
          opção para seu elenco.
        </p>
      </header>

      <div
        className="playersResultsSummary"
      >
        <strong>
          {result.total.toLocaleString(
            "pt-BR"
          )}
        </strong>{" "}
        jogador
        {result.total === 1
          ? ""
          : "es"}{" "}
        encontrado
        {result.total === 1
          ? ""
          : "s"}
      </div>

      <PlayersSearch
        players={
          result.players
        }

        leagues={
          leagues
        }

        initialSearch={
          params.search ??
          ""
        }

        initialPosition={
          params.position ??
          ""
        }

        initialLeague={
          params.league ??
          ""
        }

        initialMaxAge={
          params.maxAge ??
          ""
        }

        initialMinOverall={
          params.minOverall ??
          ""
        }

        initialMinPotential={
          params.minPotential ??
          ""
        }

        initialMaxValue={
          params.maxValue ??
          ""
        }

        initialMinPace={
          params.minPace ??
          ""
        }

        initialMinShooting={
          params.minShooting ??
          ""
        }

        initialMinPassing={
          params.minPassing ??
          ""
        }

        initialMinDribbling={
          params.minDribbling ??
          ""
        }

        initialMinDefending={
          params.minDefending ??
          ""
        }

        initialMinPhysical={
          params.minPhysical ??
          ""
        }

        initialSort={
          params.sort ??
          ""
        }
      />

      {result.totalPages > 1 && (
        <nav
          className="playersPagination"
          aria-label="Paginação de jogadores"
        >
          {result.page > 1 ? (
            <Link
              href={
                createPageHref(
                  result.page - 1
                )
              }
              className="paginationButton"
            >
              ← Anterior
            </Link>
          ) : (
            <span
              className="paginationButton paginationButtonDisabled"
            >
              ← Anterior
            </span>
          )}

          <span
            className="paginationStatus"
          >
            Página{" "}
            <strong>
              {result.page}
            </strong>{" "}
            de{" "}
            <strong>
              {result.totalPages}
            </strong>
          </span>

          {result.page <
          result.totalPages ? (
            <Link
              href={
                createPageHref(
                  result.page + 1
                )
              }
              className="paginationButton"
            >
              Próxima →
            </Link>
          ) : (
            <span
              className="paginationButton paginationButtonDisabled"
            >
              Próxima →
            </span>
          )}
        </nav>
      )}
    </main>
  )
}