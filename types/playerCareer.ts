// Public presentation contract only. A future read adapter must supply verified
// provenance; observations/proposals must never be treated as approved facts.
export type VerifiedSalary = {
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
