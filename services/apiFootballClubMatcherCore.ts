export type ApiFootballClubCandidate = {
  team?: {
    id?: number
    name?: string
    country?: string
    logo?: string
  }
}

export type RankedApiFootballClubCandidate<
  T extends ApiFootballClubCandidate =
    ApiFootballClubCandidate,
> = {
  item: T
  score: number
}

function canonicalizeCompoundClubName(
  normalizedName: string
) {
  switch (normalizedName) {
    case "man utd":
      return "manchester united"

    case "paris sg":
      return "paris saint germain"

    case "tsg hoffenheim":
    case "1899 hoffenheim":
      return "hoffenheim"

    default:
      return normalizedName
  }
}

export function normalizeClubMatcherText(
  value:
    | string
    | null
    | undefined
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
}

export function normalizeClubName(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeClubMatcherText(
      value
    )

  const ignoredWords =
    new Set([
      "fc",
      "cf",
      "sc",
      "ac",
      "afc",
      "club",
      "football",
      "futbol",
      "futebol",
    ])

  const connectorWords =
    new Set([
      "de",
    ])

  let parts =
    normalized
      .split(" ")
      .filter(
        (part) =>
          part &&
          !ignoredWords.has(
            part
          ) &&
          !connectorWords.has(
            part
          )
      )

  parts = parts.map(
    (part) => {
      if (
        part === "munchen"
      ) {
        return "munich"
      }

      return part
    }
  )

  const canonicalName =
    parts.join(" ")

  return canonicalizeCompoundClubName(
    canonicalName
  )
}

export function getClubSearchTerm(
  clubName: string
) {
  const normalized =
    normalizeClubName(
      clubName
    )

  const parts =
    normalized.split(" ")

  if (
    parts.includes(
      "bayern"
    )
  ) {
    return "Bayern"
  }

  return normalized
}

export function looksLikeWomenTeam(
  teamName:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeClubMatcherText(
      teamName
    )

  return (
    normalized.endsWith(
      " w"
    ) ||
    normalized.includes(
      " women"
    ) ||
    normalized.includes(
      " feminino"
    ) ||
    normalized.includes(
      " femenino"
    ) ||
    normalized.includes(
      " frauen"
    )
  )
}

export function looksLikeYouthTeam(
  teamName:
    | string
    | null
    | undefined
) {
  const normalized =
    normalizeClubMatcherText(
      teamName
    )

  return (
    /\bu\d{2}\b/.test(
      normalized
    ) ||
    normalized.includes(
      " youth"
    ) ||
    normalized.includes(
      " academy"
    ) ||
    normalized.endsWith(
      " ii"
    ) ||
    normalized.endsWith(
      " iii"
    ) ||
    normalized.includes(
      " reserve"
    )
  )
}

export function calculateClubScore(
  futScoutClubName: string,
  apiClubName:
    | string
    | null
    | undefined
) {
  if (!apiClubName) {
    return 0
  }

  if (
    looksLikeWomenTeam(
      apiClubName
    )
  ) {
    return 0
  }

  if (
    looksLikeYouthTeam(
      apiClubName
    )
  ) {
    return 0
  }

  const futScout =
    normalizeClubName(
      futScoutClubName
    )

  const api =
    normalizeClubName(
      apiClubName
    )

  if (
    !futScout ||
    !api
  ) {
    return 0
  }

  if (
    futScout === api
  ) {
    return 100
  }

  if (
    futScout.includes(
      api
    ) ||
    api.includes(
      futScout
    )
  ) {
    return 85
  }

  const futScoutParts =
    futScout.split(" ")

  const apiParts =
    api.split(" ")

  const commonParts =
    futScoutParts.filter(
      (part) =>
        apiParts.includes(
          part
        )
    )

  if (
    commonParts.length ===
      futScoutParts.length &&
    commonParts.length > 0
  ) {
    return 85
  }

  if (
    commonParts.length >= 2
  ) {
    return 75
  }

  if (
    commonParts.length === 1
  ) {
    return 55
  }

  return 0
}

export function rankApiFootballClubCandidates<
  T extends ApiFootballClubCandidate,
>(
  clubName: string,
  items: readonly T[]
): RankedApiFootballClubCandidate<T>[] {
  return items
    .map((item) => {
      return {
        item,
        score:
          calculateClubScore(
            clubName,
            item.team?.name
          ),
      }
    })
    .filter(
      (candidate) =>
        candidate.score > 0 &&
        candidate.item.team
          ?.id !== undefined
    )
    .sort(
      (a, b) =>
        b.score - a.score
    )
}

export function selectBestApiFootballClubCandidate<
  T extends ApiFootballClubCandidate,
>(
  candidates: readonly RankedApiFootballClubCandidate<T>[]
) {
  const best = candidates[0]

  if (
    !best ||
    best.score < 90
  ) {
    return undefined
  }

  const second = candidates[1]

  if (
    second &&
    second.score ===
      best.score
  ) {
    return undefined
  }

  return best
}
