import type { PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"

export type LeagueReconciliationControl = {
  destinationVerified: boolean
  unknownDestinationReadOnlyAuthorized?: boolean
  readOnlyConfirmed: boolean
  systemFailure?: boolean
  httpStatus?: number
  participantDivergence?: boolean
  evidenceMissing?: boolean
}

// Participant evidence belongs to a per-league review queue, never a global stop.
// Global safety gates always take precedence, even when a participant also diverges.
export function leagueReconciliationAction(state: LeagueReconciliationControl) {
  if (!state.destinationVerified && !state.unknownDestinationReadOnlyAuthorized) return "STOP_DESTINATION_UNVERIFIED" as const
  if (!state.readOnlyConfirmed) return "STOP_READ_ONLY_UNCONFIRMED" as const
  if (state.httpStatus === 429) return "STOP_HTTP_429" as const
  if (state.systemFailure) return "STOP_SYSTEM_FAILURE" as const
  if (state.participantDivergence || state.evidenceMissing) return "REVIEW_CONTINUE" as const
  return "CONTINUE" as const
}

export function evaluateLeagueAuditQuota(input: {
  localCalls: number; maxLocalCalls: number; httpStatus?: number
  dailyRemaining: number | null; minuteRemaining: number | null
  previousDailyRemaining: number | null
}) {
  const dailyDrop = input.previousDailyRemaining !== null && input.dailyRemaining !== null
    ? input.previousDailyRemaining - input.dailyRemaining : null
  const possibleConcurrentUse = dailyDrop !== null && dailyDrop > 1
  const status = input.httpStatus === 429 ? "STOP_HTTP_429"
    : input.localCalls > input.maxLocalCalls ? "STOP_LOCAL_BUDGET"
    : (input.dailyRemaining !== null && input.dailyRemaining <= 100) ||
      (input.minuteRemaining !== null && input.minuteRemaining <= 10) ? "STOP_LOW_QUOTA"
    : "CONTINUE"
  // Header deltas measure shared quota, not requests attributable to this auditor.
  return { status, dailyDrop, possibleConcurrentUse }
}

export async function readLeagueReconciliationPreflight(db: Pick<PrismaClient, "$transaction">) {
  try {
    const snapshot = await withPrismaReadOnly(db, async tx => ({
      leagues: await tx.league.findMany({ orderBy: { id: "asc" } }),
      clubs: await tx.club.findMany({ orderBy: { id: "asc" }, select: {
        id: true, name: true, externalId: true, apiFootballId: true, leagueId: true,
      } }),
      identities: await tx.brandAssetIdentity.findMany({ where: { OR: [
        { entityType: "LEAGUE" }, { entityId: "cmt9g1wkq037v1sucum6ntyxn" },
      ] }, orderBy: { id: "asc" }, include: { assets: true } }),
      redStarPlayers: await tx.player.findMany({ where: { clubId: "cmt9g1wkq037v1sucum6ntyxn" },
        select: { id: true }, orderBy: { id: "asc" } }),
    }))
    return { status: "READ_CONFIRMED" as const, snapshot }
  } catch {
    // Never publish a partial snapshot or infer an identity conflict from an operational failure.
    return { status: "STOP_OPERATIONAL" as const, classification: "NOT_EVALUATED_ACCESS_FAILURE" as const }
  }
}
