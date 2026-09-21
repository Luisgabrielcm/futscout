import "server-only"

import { prisma } from "../lib/prisma"
import type { PlayerRealLifeProfile } from "../types/playerRealLife"
import { getBrandAssetsForEntities } from "./brandAssetReadService"

export async function getPlayerRealLifeBySlug(slug: string): Promise<PlayerRealLifeProfile | null> {
  const player = await prisma.player.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      imageUrl: true,
      nationality: true,
      club: {
        select: {
          id: true,
          slug: true,
          name: true,
          league: { select: { id: true, slug: true, name: true } },
        },
      },
      approvedCurrentClub: {
        select: {
          approvedClub: {
            select: {
              id: true,
              slug: true,
              name: true,
              imageUrl: true,
              league: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!player) return null
  const realClub = player.approvedCurrentClub?.approvedClub ?? null
  const assets = await getBrandAssetsForEntities({
    clubIds: [player.club?.id, realClub?.id].filter((id): id is string => Boolean(id)),
    leagueIds: [player.club?.league?.id, realClub?.league.id].filter((id): id is string => Boolean(id)),
  })

  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    imageUrl: player.imageUrl,
    nationality: player.nationality,
    eaCatalogClub: player.club ? { ...player.club, asset: assets.clubs.get(player.club.id) ?? null,
      league: player.club.league ? { ...player.club.league, asset: assets.leagues.get(player.club.league.id) ?? null } : null } : null,
    approvedCurrentClub: realClub ? { ...realClub, asset: assets.clubs.get(realClub.id) ?? null,
      league: { ...realClub.league, asset: assets.leagues.get(realClub.league.id) ?? null } } : null,
  }
}
