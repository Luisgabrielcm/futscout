/** Experimental FutScout estimate, not an observed or historically validated rating. */
export const FUTSCOUT_POTENTIAL_E_V1 = "potential-model-e-v1" as const

export type FutscoutPotentialInput = Readonly<{
  /** Continuous age at an explicit reference instant, NOT integer display age. */
  age: number
  overall: number
  /** Normalized primary position; unsupported codes produce INVALID. */
  position: string
}>

export type FutscoutPotentialRole = "outfield" | "goalkeeper"

export type FutscoutPotentialSeason = Readonly<{
  season: number
  age: number
  level: number
  rounded: number
  growth: number
  decline: number
  clampAdjustment: number
}>

export type FutscoutPotentialMonth = Readonly<{
  month: number
  time: number
  age: number
  previous: number
  growth: number
  decline: number
  preClamp: number
  bounded: number
}>

export type FutscoutPotentialResult =
  | Readonly<{
      status: "INVALID"
      modelVersion: typeof FUTSCOUT_POTENTIAL_E_V1
    }>
  | Readonly<{
      status: "EXPERIMENTAL"
      modelVersion: typeof FUTSCOUT_POTENTIAL_E_V1
      role: FutscoutPotentialRole
      /** T0 is retained for explanation but excluded from the maximum. */
      seasons: readonly FutscoutPotentialSeason[]
      monthly: readonly FutscoutPotentialMonth[]
      potential: Readonly<{ raw: number; rounded: number; season: number }>
    }>
