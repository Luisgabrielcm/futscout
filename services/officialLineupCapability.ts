import "server-only"
import { createOfficialLineupReadStore } from "./officialLineupReadRepository"

export async function getOfficialLineupReadStore(now: Date, enabled = process.env.OFFICIAL_LINEUPS_ENABLED,
  loadDatabase = async () => (await import("../lib/prisma")).prisma) {
  // Opt-in only AFTER separately authorized migration application and verification.
  if (enabled !== "true") return null
  return createOfficialLineupReadStore(await loadDatabase(), now)
}
