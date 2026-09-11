import { Prisma, type PrismaClient } from "../app/generated/prisma/client"
import type { ProtectedTableHashes } from "./officialLineupPilot"

export const LINEUP_PROTECTED_TABLES = ["Player", "Club", "ApiFootballTeamRosterCache", "ApiFootballPlayerMatchAttempt", "SyncState", "SyncError", "PlayerAttributes"] as const
export function auditLineupProtectedTables(db: PrismaClient): Promise<ProtectedTableHashes> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const results: ProtectedTableHashes = {}
    for (const table of LINEUP_PROTECTED_TABLES) {
      // Identifier comes ONLY from the fixed allowlist, never command-line/user input.
      const rows = await tx.$queryRaw<{ count: string; hash: string }[]>(Prisma.sql`
        SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS hash
        FROM ${Prisma.raw(`"${table}"`)} t`)
      results[table] = rows[0]
    }
    return results
  }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 })
}
