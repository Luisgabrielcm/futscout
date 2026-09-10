import "server-only"
import { cache } from "react"
import { prisma } from "../lib/prisma"
import { nationalityKey } from "../lib/connectedNavigation"
import { getPlayers, type GetPlayersParams } from "./playerService"

// A few hundred grouped values, not the 16k player records. Exact persisted
// variants remain the query scope; never rewrite Player.nationality.
export const getCountries = cache(async () => {
  const groups = await prisma.player.groupBy({ by: ["nationality"], _count: { _all: true } })
  const countries = new Map<string, { slug: string; name: string; nationalities: string[]; total: number }>()
  for (const group of groups) {
    if (!group.nationality?.trim()) continue
    const slug = nationalityKey(group.nationality)
    if (!slug) continue
    const country = countries.get(slug) ?? { slug, name: group.nationality, nationalities: [], total: 0 }
    country.nationalities.push(group.nationality)
    country.total += group._count._all
    countries.set(slug, country)
  }
  return [...countries.values()].sort((a, b) => a.slug.localeCompare(b.slug))
})

export const getCountry = cache(async (slug: string) => (await getCountries()).find(country => country.slug === slug) ?? null)
export function getCountryPlayers(nationalities: string[], input: GetPlayersParams) {
  return getPlayers(input, { nationalities })
}
