import { FUTSCOUT_POTENTIAL_E_V1 } from "./types"
import type {
  FutscoutPotentialInput,
  FutscoutPotentialMonth,
  FutscoutPotentialResult,
  FutscoutPotentialSeason,
} from "./types"

const POSITIONS = Object.freeze([
  "GOL", "ZAG", "LD", "LE", "ALA", "VOL", "MC", "MEI",
  "MD", "ME", "PD", "PE", "SA", "ATA",
])

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))
const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))
const smoothstep = (value: number): number => 3 * value * value - 2 * value * value * value
const displayedLevel = (raw: number): number => Math.round(raw)

function additionalGrowthWeight(age: number): number {
  if (age <= 22 || age >= 27) return 0
  if (age < 23) return smoothstep(age - 22)
  if (age <= 25) return 1
  return 1 - smoothstep((age - 25) / 2)
}

/**
 * Pure frozen E-v1 core. No current-time, identity, attributes or persistence inputs.
 * Keep floating-point operation order: intermediate rounding changes the model.
 * Date-of-birth/reference conversion belongs to a future, explicit adapter.
 */
export function calculateFutscoutPotentialEV1(
  input: FutscoutPotentialInput | null | undefined,
): FutscoutPotentialResult {
  if (
    !input || !Number.isFinite(input.age) || input.age < 0 || input.age > 100 ||
    !Number.isFinite(input.overall) || input.overall < 1 || input.overall > 99 ||
    !POSITIONS.includes(input.position)
  ) {
    return { status: "INVALID", modelVersion: FUTSCOUT_POTENTIAL_E_V1 }
  }

  const role = input.position === "GOL" ? "goalkeeper" : "outfield"
  const parameters = role === "goalkeeper"
    ? { growth: 1.5, youthCenter: 25, decline: 1.2, declineCenter: 35, width: 2.5, taperLow: 28, taperHigh: 32 }
    : { growth: 2, youthCenter: 23, decline: 1.5, declineCenter: 31, width: 2.5, taperLow: 26, taperHigh: 30 }
  let level = input.overall
  const seasons: FutscoutPotentialSeason[] = [{
    season: 0, age: input.age, level, rounded: displayedLevel(level),
    growth: 0, decline: 0, clampAdjustment: 0,
  }]
  const monthly: FutscoutPotentialMonth[] = []

  for (let year = 1; year <= 10; year++) {
    let growth = 0
    let decline = 0
    let clampAdjustment = 0
    for (let month = 1; month <= 12; month++) {
      const age = input.age + year - 1 + (month - 0.5) / 12
      const t = clampUnit((age - parameters.taperLow) / (parameters.taperHigh - parameters.taperLow))
      const taper = 1 - t * t * (3 - 2 * t)
      const base = parameters.growth * sigmoid((parameters.youthCenter - age) / parameters.width)
      const extended = parameters.growth * sigmoid((parameters.youthCenter + 2 - age) / parameters.width)
      const d3Rate = (base + taper * (extended - base)) * (1 + 0.25 * taper)
      const rate = role === "outfield" ? d3Rate * (1 + 0.25 * additionalGrowthWeight(age)) : d3Rate
      const g = rate * Math.sqrt(clampUnit((99 - level) / 20)) / 12
      const d = parameters.decline * sigmoid((age - parameters.declineCenter) / parameters.width) / 12
      const raw = level + g - d
      const bounded = Math.max(1, Math.min(99, raw))
      monthly.push({
        month: (year - 1) * 12 + month, time: year - 1 + month / 12,
        age, previous: level, growth: g, decline: d, preClamp: raw, bounded,
      })
      growth += g
      decline += d
      clampAdjustment += bounded - raw
      level = bounded
    }
    seasons.push({ season: year, age: input.age + year, level, rounded: displayedLevel(level), growth, decline, clampAdjustment })
  }

  // Start at T1, deliberately allowing a potential lower than today's overall.
  let peak = seasons[1]
  for (let year = 2; year <= 10; year++) {
    if (seasons[year].level > peak.level) peak = seasons[year]
  }
  return {
    status: "EXPERIMENTAL", modelVersion: FUTSCOUT_POTENTIAL_E_V1, role, seasons, monthly,
    potential: { raw: peak.level, rounded: displayedLevel(peak.level), season: peak.season },
  }
}
