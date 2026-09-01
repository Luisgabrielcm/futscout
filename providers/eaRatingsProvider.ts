import type {
  EARatingsPlayer,
  EARatingsResponse,
} from "../types/eaRatingsPlayer"

const EA_RATINGS_URL =
  "https://drop-api.ea.com/rating/ea-sports-fc"

type GetPlayersOptions = {
  limit?: number
  offset?: number
  locale?: string
  gender?: number
}

export type EARatingsBatch = {
  players: EARatingsPlayer[]
  totalItems: number
}

export class EARatingsProvider {
  /* ========================================
     CONSULTA BASE
  ======================================== */

  private async fetchRatings(
    options: GetPlayersOptions = {}
  ): Promise<EARatingsResponse> {
    const {
      limit = 10,
      offset = 0,
      locale = "en",
      gender = 0,
    } = options

    const params =
      new URLSearchParams({
        locale,
        limit: String(limit),
        offset: String(offset),
        gender: String(gender),
      })

    const url =
      `${EA_RATINGS_URL}?${params.toString()}`

    console.log(
      `🔎 EA Ratings | limit=${limit} offset=${offset}`
    )

    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          Accept: "application/json",
        },
      })

    console.log(
      `📡 HTTP ${response.status}`
    )

    if (!response.ok) {
      const text =
        await response.text()

      throw new Error(
        [
          `EA Ratings respondeu com HTTP ${response.status}`,
          `limit=${limit}`,
          `offset=${offset}`,
          text,
        ].join("\n")
      )
    }

    return (
      await response.json()
    ) as EARatingsResponse
  }

  /* ========================================
     INSPECTOR
  ======================================== */

  async inspectPlayer(): Promise<EARatingsResponse> {
    return this.fetchRatings({
      limit: 1,
      offset: 0,
    })
  }

  /* ========================================
     BUSCAR SOMENTE JOGADORES
  ======================================== */

  async getPlayers(
    options: GetPlayersOptions = {}
  ): Promise<EARatingsPlayer[]> {
    const response =
      await this.fetchRatings(
        options
      )

    return response.items ?? []
  }

  /* ========================================
     BUSCAR LOTE + METADADOS
  ======================================== */

  async getPlayersBatch(
    options: GetPlayersOptions = {}
  ): Promise<EARatingsBatch> {
    const response =
      await this.fetchRatings(
        options
      )

    return {
      players:
        response.items ?? [],

      totalItems:
        response.totalItems ?? 0,
    }
  }

  /* ========================================
     TOTAL DA BASE
  ======================================== */

  async getTotalPlayers(): Promise<number> {
    const response =
      await this.fetchRatings({
        limit: 1,
        offset: 0,
      })

    return (
      response.totalItems ?? 0
    )
  }
}