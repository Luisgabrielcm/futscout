import type { AssetReference } from "../lib/assetPipeline"

export type RealLifeClub = {
  id: string
  slug: string
  name: string
  imageUrl: string | null
  asset?: AssetReference | null
  league: {
    id?: string
    slug: string
    name: string
    asset?: AssetReference | null
  }
}

export type PlayerRealLifeProfile = {
  id: string
  slug: string
  name: string
  imageUrl: string | null
  nationality: string | null
  eaCatalogClub: {
    id?: string
    slug: string
    name: string
    asset?: AssetReference | null
    league?: { id?: string; slug: string; name: string; asset?: AssetReference | null } | null
  } | null
  approvedCurrentClub: RealLifeClub | null
}
