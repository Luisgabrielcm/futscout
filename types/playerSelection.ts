import type { AssetReference } from "../lib/assetPipeline"

export const COMPARISON_ATTRIBUTES = ["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const
export type ComparisonAttribute = (typeof COMPARISON_ATTRIBUTES)[number]

export type SelectedPlayer = {
  id: string; slug: string; name: string; position: string
  club: string | null; age: number | null; image?: string
  clubImageUrl?: string | null; nationality?: string | null
  clubAsset?: AssetReference | null
  secondaryPosition?: string | null; secondaryPositions?: string[]
  baseOverall: number; dynamicOverall: number | null; potential: number | null
  marketValue: number | null; form: string | null; valueTrend: null
  attributes: Record<ComparisonAttribute, number | null> | null
}
