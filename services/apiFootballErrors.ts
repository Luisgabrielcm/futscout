export const API_FOOTBALL_RATE_LIMIT_CODE =
  "API_FOOTBALL_RATE_LIMIT" as const

export const API_FOOTBALL_CACHE_ONLY_MISS_CODE =
  "API_FOOTBALL_CACHE_ONLY_MISS" as const

export class ApiFootballRateLimitError extends Error {
  readonly code =
    API_FOOTBALL_RATE_LIMIT_CODE

  constructor() {
    super("RATE_LIMIT_429")

    this.name =
      "ApiFootballRateLimitError"
  }
}

export class ApiFootballCacheOnlyMissError extends Error {
  readonly code =
    API_FOOTBALL_CACHE_ONLY_MISS_CODE

  readonly resource: string

  constructor(resource: string) {
    super(
      `CACHE_ONLY_MISS: ${resource}`
    )

    this.name =
      "ApiFootballCacheOnlyMissError"
    this.resource =
      resource
  }
}

export function isApiFootballRateLimitError(
  error: unknown
): error is ApiFootballRateLimitError {
  if (
    typeof error !==
      "object" ||
    error === null
  ) {
    return false
  }

  return (
    "code" in error &&
    error.code ===
      API_FOOTBALL_RATE_LIMIT_CODE
  )
}

export function isApiFootballCacheOnlyMissError(
  error: unknown
): error is ApiFootballCacheOnlyMissError {
  if (
    typeof error !==
      "object" ||
    error === null
  ) {
    return false
  }

  return (
    "code" in error &&
    error.code ===
      API_FOOTBALL_CACHE_ONLY_MISS_CODE
  )
}

function stringHasApiFootballRateLimitSignal(
  value: string
) {
  const normalized =
    value
      .toLowerCase()
      .replace(
        /[_-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()

  return (
    /\brate limit\b/.test(
      normalized
    ) ||
    /\brequests? limit\b/.test(
      normalized
    ) ||
    /\bquota\b/.test(
      normalized
    ) ||
    /\btoo many requests\b/.test(
      normalized
    )
  )
}

export function hasApiFootballRateLimitSignal(
  value: unknown
): boolean {
  if (
    typeof value ===
    "string"
  ) {
    return stringHasApiFootballRateLimitSignal(
      value
    )
  }

  if (
    Array.isArray(value)
  ) {
    return value.some(
      hasApiFootballRateLimitSignal
    )
  }

  if (
    typeof value ===
      "object" &&
    value !== null
  ) {
    return Object.values(
      value
    ).some(
      hasApiFootballRateLimitSignal
    )
  }

  return false
}
