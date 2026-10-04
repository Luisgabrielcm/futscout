import type { Prisma } from "../app/generated/prisma/client"
import type { NormalizedPlayer } from "../types/normalizedPlayer"
import type { EaCatalogBatchProvenance } from "../lib/eaCatalogSemanticSync"
import { assertAcceptedRating, eaRatingSnapshot } from "../lib/eaRatingSnapshot"

/** Called inside the provenance transaction, after a wholly successful batch. */
export async function persistEaRatingSnapshots(tx: Prisma.TransactionClient,
  players: readonly NormalizedPlayer[], source: EaCatalogBatchProvenance,
  identities: readonly { playerId: string | null; externalId: string }[]) {
  if (new Set(players.map(player => player.externalId)).size !== players.length)
    throw new Error("EA_RATING_DUPLICATE_SOURCE_ID")
  const rows = await tx.player.findMany({ where: { externalId: { in: players.map(p => p.externalId) } },
    select: { id: true, externalId: true, dateOfBirth: true, position: true, officialOverall: true,
      attributes: true, goalkeeperAttributes: true } })
  const data = players.map(player => {
    const accepted = rows.find(row => row.externalId === player.externalId)
    const identity = identities.find(item => item.externalId === player.externalId)
    if (!accepted || accepted.id !== identity?.playerId) throw new Error("EA_RATING_IDENTITY_MISMATCH")
    assertAcceptedRating(player, accepted)
    return { playerId: accepted.id, ...eaRatingSnapshot({ ...player,
      dateOfBirth: player.dateOfBirth ?? accepted.dateOfBirth ?? undefined }, source) }
  })
  if (!data.length) return new Map<string, string>()
  // Immutable INSERT ... ON CONFLICT DO NOTHING; bounded queries, never per-player UPDATE/upsert.
  await tx.eaPlayerRatingSnapshot.createMany({ data, skipDuplicates: true })
  const snapshots = await tx.eaPlayerRatingSnapshot.findMany({ where: { OR: data.map(item => ({
    externalId: item.externalId, sourceContext: item.sourceContext,
    snapshotVersion: item.snapshotVersion, contentHash: item.contentHash,
  })) }, select: { id: true, playerId: true, externalId: true } })
  return new Map(data.map(item => {
    const snapshot = snapshots.find(row => row.externalId === item.externalId)
    if (!snapshot || snapshot.playerId !== item.playerId) throw new Error("EA_RATING_IDENTITY_CONFLICT")
    return [item.externalId, snapshot.id]
  }))
}
