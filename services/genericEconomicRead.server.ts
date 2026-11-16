import "server-only"
import { selectedGenericEconomicRecord, genericEconomicConflict, genericEconomicView,
  type GenericEconomicCurrentState } from "../lib/genericEconomicPublication"
import type { GenericEconomicView } from "../lib/genericEconomicTypes"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { readGenericEconomicRelease } from "../lib/genericEconomicRelease.server"

/** Point read inside a DB-enforced READ ONLY transaction, rolled back even on success. */
export async function inspectGenericEconomicRead(playerId: string, env: Readonly<Record<string, string | undefined>> = process.env):
Promise<{ status: "DISABLED" | "CONFLICT" | "UNAVAILABLE"; reason?: string } | { status: "READY"; view: GenericEconomicView }> {
  const release = readGenericEconomicRelease(env)
  if (!release) return { status: "DISABLED" }
  const approved = selectedGenericEconomicRecord(playerId, env, release)
  if (!approved) return { status: "DISABLED" }
  try {
    const { prisma } = await import("../lib/prisma")
    const rows = await withPrismaReadOnly(prisma, tx => tx.$queryRaw<GenericEconomicCurrentState[]>`
      SELECT to_jsonb(p) AS record, to_jsonb(c) AS club,
        current_setting('transaction_read_only') AS "readOnly",
        (EXISTS(SELECT 1 FROM "PlayerEconomicState" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "PlayerEconomicObservation" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "PlayerEconomicCurrent" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "PlayerWagePublication" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "ResearchEconomicPublic" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "AdminEconomicPublic" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "AdminEconomicHead" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "ResearchEconomicHead" e WHERE e."playerId"=p.id)
        OR EXISTS(SELECT 1 FROM "WageReferenceObservation" e WHERE e."playerId"=p.id)
        ) AS "hasExistingEconomics",
        (EXISTS(SELECT 1 FROM "PlayerClubContextRevision" e WHERE e."eaPlayerId"=p."externalId")
        OR EXISTS(SELECT 1 FROM "PlayerClubContextSelection" e WHERE e."eaPlayerId"=p."externalId")) AS "hasClubContexts"
      FROM "Player" p LEFT JOIN "Club" c ON c.id=p."clubId"
      WHERE p.id=${approved.playerId} AND p."externalId"=${approved.eaId}
        AND p."eaImportVisibility"='PUBLIC'`)
    if (rows.length !== 1) return { status: "CONFLICT", reason: "EA_IDENTITY_CONFLICT" }
    const conflict = genericEconomicConflict(approved, rows[0])
    if (conflict) return { status: "CONFLICT", reason: conflict }
    return { status: "READY", view: genericEconomicView(approved, release.artifact) }
  } catch {
    // A missing relation, read failure or rollback failure must not expose estimates or break legacy profiles.
    return { status: "UNAVAILABLE", reason: "READ_ONLY_CHECK_UNAVAILABLE" }
  }
}

export async function readGenericEconomicView(playerId: string): Promise<GenericEconomicView | undefined> {
  const result = await inspectGenericEconomicRead(playerId)
  return result.status === "READY" ? result.view : undefined
}
