import "server-only"
import { prisma } from "../lib/prisma"
import { calculateAge } from "../mappers/mapDatabasePlayer"
import { FAVORITES_LIMIT, normalizePlayerSlugs } from "../lib/playerSelections"
import type { SelectedPlayer } from "../types/playerSelection"
import { getBrandAssetsForEntities } from "./brandAssetReadService"
import { futscoutPotentialReadSelect, readFutscoutPotential } from "../lib/futscoutPotential/read"
import { economicMarketValueReadSelect, readEconomicMarketValue } from "../lib/economicData/read"
import { manualWage, readManualEconomics } from "./adminEconomic.server"
import { readResearchEconomics } from "./researchEconomicRead.server"
import { researchWage } from "../lib/researchEconomic"
import { jointReadManifest } from "../lib/jointTransferContexts"

export async function getSelectedPlayers(input: unknown, limit: 2 | typeof FAVORITES_LIMIT = FAVORITES_LIMIT): Promise<SelectedPlayer[]> {
  const slugs = normalizePlayerSlugs(input, limit)
  if (!slugs.length) return []
  const rows = await prisma.player.findMany({
    where: { eaImportVisibility: "PUBLIC", slug: { in: slugs } }, take: slugs.length,
    select: {
      id: true, externalId: true, slug: true, name: true, position: true, dateOfBirth: true,
      nationality: true, secondaryPosition: true, secondaryPositions: true,
      imageUrl: true, officialOverall: true, dynamicOverall: true, potential: true,
      currentFutscoutPotential: futscoutPotentialReadSelect,
      economicCurrents: economicMarketValueReadSelect, form: true, club: { select: { id: true, name: true } },
      attributes: { select: { pace: true, shooting: true, passing: true, dribbling: true, defending: true, physical: true } },
    },
  })
  const [assets, manual, research] = await Promise.all([
    getBrandAssetsForEntities({ clubIds: rows.flatMap(row => row.club?.id ? [row.club.id] : []) }),
    readManualEconomics(rows.map(row => row.id)),
    readResearchEconomics(rows.map(row => row.id)),
  ])
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const joint = jointReadManifest(globalThis.process?.env) ? await (await import("./jointTransferRead.server")).readJointTransferSelections(rows.map(r => r.externalId)) : new Map()
  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug)
    if (!row) return []
    return [{
      id: row.id, slug: row.slug, name: row.name, position: row.position,
      ...((manualWage(row.id, manual.get(row.id)) ?? researchWage(row.id, research.get(row.id)))
        ? { wage: manualWage(row.id, manual.get(row.id)) ?? researchWage(row.id, research.get(row.id)) } : {}),
      club: row.club?.name ?? null, age: calculateAge(row.dateOfBirth),
      ...(joint.get(row.externalId ?? "")?.views.game ? { transferContexts: joint.get(row.externalId ?? "")!.views, transferContext: "GAME" as const,
        club: joint.get(row.externalId ?? "")!.views.game!.clubLabel, clubAsset: null } : {}),
      nationality: row.nationality,
      clubAsset: joint.get(row.externalId ?? "")?.views.game ? null : row.club?.id ? assets.clubs.get(row.club.id) ?? null : null,
      secondaryPosition: row.secondaryPosition, secondaryPositions: row.secondaryPositions,
      image: row.imageUrl ?? undefined, baseOverall: row.officialOverall,
      dynamicOverall: row.dynamicOverall, ...readFutscoutPotential(row),
      ...readEconomicMarketValue(row),
      form: row.form, valueTrend: null, attributes: row.attributes,
    }]
  })
}
