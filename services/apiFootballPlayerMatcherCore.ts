export type ApiFootballPlayerMatchClassification =
  | "MATCH FORTE"
  | "REVISAR"
  | "MATCH FRACO"

export const API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN = 10

type ApiFootballPlayerNameCandidate = {
  player?: {
    name?: string | null
    firstname?: string | null
    lastname?: string | null
  } | null
}

export function normalizeMatcherText(
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

export function getApiFullName(
  candidate:
    ApiFootballPlayerNameCandidate
) {
  return [
    candidate.player
      ?.firstname,
    candidate.player
      ?.lastname,
  ]
    .filter(Boolean)
    .join(" ")
}

export function calculateNameScore(
  futScoutName: string,
  candidate:
    ApiFootballPlayerNameCandidate
) {
  const target =
    normalizeMatcherText(
      futScoutName
    )

  const apiName =
    normalizeMatcherText(
      candidate.player
        ?.name
    )

  const apiFullName =
    normalizeMatcherText(
      getApiFullName(
        candidate
      )
    )

  if (!target) {
    return 0
  }

  if (
    target === apiName ||
    target === apiFullName
  ) {
    return 100
  }

  if (
    apiFullName &&
    (
      apiFullName.includes(
        target
      ) ||
      target.includes(
        apiFullName
      )
    )
  ) {
    return 90
  }

  const targetParts =
    target
      .split(" ")
      .filter(Boolean)

  if (
    targetParts.length ===
    0
  ) {
    return 0
  }

  const candidateParts =
    new Set(
      `${apiName} ${apiFullName}`
        .split(" ")
        .filter(Boolean)
    )

  const matchingParts =
    targetParts.filter(
      (part) =>
        candidateParts.has(
          part
        )
    )

  const ratio =
    matchingParts.length /
    targetParts.length

  if (
    ratio === 1
  ) {
    return 100
  }

  if (
    ratio >= 0.75
  ) {
    return 90
  }

  if (
    ratio >= 0.5
  ) {
    return 80
  }

  if (
    ratio > 0
  ) {
    return 50
  }

  return 0
}

export function calculateMatchConfidence({
  nameScore,
  birthMatches,
  nationalityMatches,
  clubMatches,
}: {
  nameScore: number
  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
}) {
  const namePoints =
    Math.round(
      nameScore * 0.4
    )

  const birthPoints =
    birthMatches
      ? 35
      : 0

  const nationalityPoints =
    nationalityMatches
      ? 10
      : 0

  const clubPoints =
    clubMatches
      ? 15
      : 0

  return (
    namePoints +
    birthPoints +
    nationalityPoints +
    clubPoints
  )
}

export function classifyMatchConfidence(
  confidence: number
): ApiFootballPlayerMatchClassification {
  let classification:
    ApiFootballPlayerMatchClassification =
      "MATCH FRACO"

  if (
    confidence >= 90
  ) {
    classification =
      "MATCH FORTE"
  } else if (
    confidence >= 75
  ) {
    classification =
      "REVISAR"
  }

  return classification
}

export function canAutomaticallySave(
  match: {
    classification:
      ApiFootballPlayerMatchClassification
    birthMatches: boolean
    clubMatches: boolean
    nameScore: number
  }
) {
  return (
    match.classification ===
      "MATCH FORTE" &&
    match.birthMatches &&
    match.clubMatches &&
    match.nameScore >= 80
  )
}

export function evaluateApiFootballPlayerCandidateRanking<
  Candidate extends {
    confidence: number
    canAutoSave: boolean
  },
>(candidates: readonly Candidate[]) {
  const ranked = [...candidates].sort(
    (a, b) => b.confidence - a.confidence
  )

  const top1 = ranked[0] ?? null
  const top2 = ranked[1] ?? null
  const margin = top1 && top2 ? top1.confidence - top2.confidence : null
  const ambiguous =
    margin !== null && margin < API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN

  return {
    top1,
    top2,
    margin,
    ambiguous,
    canAutoSave: Boolean(top1?.canAutoSave && !ambiguous),
  }
}
