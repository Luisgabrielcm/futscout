import "server-only"
import { prisma } from "../lib/prisma"
import { calculateAge } from "../mappers/mapDatabasePlayer"
import { FAVORITES_LIMIT, normalizePlayerSlugs } from "../lib/playerSelections"
import type { SelectedPlayer } from "../types/playerSelection"
import { getBrandAssetsForEntities } from "./brandAssetReadService"

export async function getSelectedPlayers(input: unknown, limit: 2 | typeof FAVORITES_LIMIT = FAVORITES_LIMIT): Promise<SelectedPlayer[]> {
  const slugs = normalizePlayerSlugs(input, limit)
  if (!slugs.length) return []
  const rows = await prisma.player.findMany({
    where: { slug: { in: slugs } }, take: slugs.length,
    select: {
      id: true, slug: true, name: true, position: true, dateOfBirth: true,
      nationality: true, secondaryPosition: true, secondaryPositions: true,
      imageUrl: true, officialOverall: true, dynamicOverall: true, potential: true,
      marketValue: true, form: true, club: { select: { id: true, name: true } },
      attributes: { select: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true } },
    },
  })
  const assets = await getBrandAssetsForEntities({ clubIds: rows.flatMap(row => row.club?.id ? [row.club.id] : []) })
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug)
    if (!row) return []
    return [{
      id: row.id, slug: row.slug, name: row.name, position: row.position,
      club: row.club?.name ?? null, age: calculateAge(row.dateOfBirth),
      nationality: row.nationality,
      clubAsset: row.club?.id ? assets.clubs.get(row.club.id) ?? null : null,
      secondaryPosition: row.secondaryPosition, secondaryPositions: row.secondaryPositions,
      image: row.imageUrl ?? undefined, baseOverall: row.officialOverall,
      dynamicOverall: row.dynamicOverall, potential: row.potential,
      marketValue: row.marketValue === null ? null : Number(row.marketValue),
      form: row.form, valueTrend: null, attributes: row.attributes,
    }]
  })
}
