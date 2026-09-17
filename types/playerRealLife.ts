export type RealLifeClub = {
  id: string
  slug: string
  name: string
  imageUrl: string | null
  league: {
    slug: string
    name: string
  }
}

export type PlayerRealLifeProfile = {
  id: string
  slug: string
  name: string
  imageUrl: string | null
  nationality: string | null
  eaCatalogClub: {
    slug: string
    name: string
  } | null
  approvedCurrentClub: RealLifeClub | null
}
