import "server-only"

import { prisma } from "../lib/prisma"
import type { PlayerRealLifeProfile } from "../types/playerRealLife"

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
          slug: true,
          name: true,
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

  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    imageUrl: player.imageUrl,
    nationality: player.nationality,
    eaCatalogClub: player.club,
    approvedCurrentClub: player.approvedCurrentClub?.approvedClub ?? null,
  }
}
