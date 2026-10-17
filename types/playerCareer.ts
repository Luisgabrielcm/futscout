// Public presentation contract only. A future read adapter must verify identity,
// provenance and publication rights before asserting publicationAllowed.
// A nonempty source alone never authorizes publication. No estimate is currently
// publishable: Wage v0.2 has no real calibration or approved artifact.
export type VerifiedSalary = {
  nature: "OBSERVED" | "PROVIDER_ESTIMATE" | "FUTSCOUT_ESTIMATE"
  publicationAllowed: boolean
  amount: number
  currency: string
  period: "week" | "year"
  source: string
}

export type PlayerCareerData = {
  source: string
  currentClub?: string | null
  realLeague?: string | null
  latestTransfer?: string | null
  salary?: VerifiedSalary | null
  contractUntil?: string | null
  shirtNumber?: number | null
  since?: string | null
  contractStatus?: string | null
  nationalTeam?: { name: string; country: string | null } | null
  transfers?: { id: string; date: string; from: string | null; to: string | null; typeRaw: string | null }[]
}
