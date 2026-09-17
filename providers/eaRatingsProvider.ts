import type {
  EARatingsPlayer,
  EARatingsResponse,
} from "../types/eaRatingsPlayer"

import type {
  EaCatalogBatchProvenance,
} from "../lib/eaCatalogSemanticSync"

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
  provenance: EaCatalogBatchProvenance
}

type EARatingsFetchResult = {
  response: EARatingsResponse
  provenance: EaCatalogBatchProvenance
}

export const EA_RATINGS_VERSION_CONTEXT = {
  eaGameVersion: "FC27",
  evidence: "OFFICIAL_PAGE_CONTEXT" as const,
  evidenceUrl: "https://www.ea.com/games/ea-sports-fc/ratings",
}

export class EARatingsProvider {
  /* ========================================
     CONSULTA BASE
  ======================================== */

  private async fetchRatings(
    options: GetPlayersOptions = {}
  ): Promise<EARatingsFetchResult> {
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

    const observedAt = new Date()
    const responseDateValue = response.headers.get("date")
    const responseDate = responseDateValue && Number.isFinite(Date.parse(responseDateValue))
      ? new Date(responseDateValue)
      : null

    return {
      response: (
        await response.json()
      ) as EARatingsResponse,
      provenance: {
        provider: "ea-ratings",
        endpoint: EA_RATINGS_URL,
        eaGameVersion: EA_RATINGS_VERSION_CONTEXT.eaGameVersion,
        gameVersionEvidence: EA_RATINGS_VERSION_CONTEXT.evidence,
        gameVersionEvidenceUrl: EA_RATINGS_VERSION_CONTEXT.evidenceUrl,
        catalogVersion: null,
        sourceUpdatedAt: null,
        observedAt,
        responseDate,
        etag: response.headers.get("etag"),
        locale,
        gender,
      },
    }
  }

  /* ========================================
     INSPECTOR
  ======================================== */

  async inspectPlayer(): Promise<EARatingsResponse> {
    const result = await this.fetchRatings({
      limit: 1,
      offset: 0,
    })

    return result.response
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

    return response.response.items ?? []
  }

  /* ========================================
     BUSCAR LOTE + METADADOS
  ======================================== */

  async getPlayersBatch(
    options: GetPlayersOptions = {}
  ): Promise<EARatingsBatch> {
    const result =
      await this.fetchRatings(
        options
      )

    return {
      players:
        result.response.items ?? [],

      totalItems:
        result.response.totalItems ?? 0,

      provenance:
        result.provenance,
    }
  }

  /* ========================================
     TOTAL DA BASE
  ======================================== */

  async getTotalPlayers(): Promise<number> {
    const result =
      await this.fetchRatings({
        limit: 1,
        offset: 0,
      })

    return (
      result.response.totalItems ?? 0
    )
  }
}
