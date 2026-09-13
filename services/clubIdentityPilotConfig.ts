import type { ClubIdentityConfig } from "./clubPlayerIdentityPipeline"

// Phase F reviewed batch. Order is confidence DESC, snapshot DESC, margin DESC,
// provider ID ASC. Never replace an ineligible member with an unselected candidate.
export const CITY_FIRST_IDENTITY_BATCH = Object.freeze([
  Object.freeze({ playerId: "cmt9anhja001k2kucpdv04fk1", slug: "mateo-kovacic", providerId: 2291 }),
  Object.freeze({ playerId: "cmtadotx104mn9guckez3gz2b", slug: "marcus-bettinelli", providerId: 19012 }),
  Object.freeze({ playerId: "cmt99ly0z000yugucoh1d254u", slug: "josko-gvardiol", providerId: 129033 }),
  Object.freeze({ playerId: "cmt9cy082047vukucfkwpx5xl", slug: "rico-lewis", providerId: 284230 }),
  Object.freeze({ playerId: "cmt9bal8v00nkukucmpm7iiah", slug: "rayan-ait-nouri", providerId: 21138 }),
])

export function cityFirstIdentityBatchConfig(): ClubIdentityConfig {
  const config = parseClubIdentityExpansionReadArgs(["--dry-run", "--club", "manchester-city", "--season", "2026"])
  return { ...config, cache: { ...config.cache, expectedRowHash: "75d9ee2aba8f38d8a79382b88944f9c2" },
    orderedBatchCandidates: CITY_FIRST_IDENTITY_BATCH }
}

// Phase A operational allowlist only. The core/repository do not know Barcelona IDs.
export function barcelonaClubIdentityDryRunConfig(): ClubIdentityConfig {
  return {
    clubId: "cmt94sq79001l5guc4g4zj7y3", clubSlug: "fc-barcelona", apiFootballTeamId: 529, season: 2026, mode: "DRY_RUN",
    cache: { maxAgeDays: 7, expectedRowHash: "d80583525a6707b21e8ac7fbe5848290" },
    snapshot: { required: false, requireParticipation: false,
      expectedHash: "1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11" },
    writePolicy: { maxAutoWrites: 1, stopOnConflict: true, stopOnAuditMismatch: true, stopOnIndeterminateCommit: true, zeroRetry: true },
    budget: { maxProviderPlayers: 200, maxRelevantPlayers: 2000, maxDryRunAgeMs: 15 * 60 * 1000 },
  }
}

export function parseClubIdentityPilotArgs(args: string[]) {
  if (args.length !== 5 || args[0] !== "--dry-run" || args[1] !== "--club" || args[2] !== "fc-barcelona" ||
      args[3] !== "--season" || args[4] !== "2026") throw new Error("ONLY_BARCELONA_DRY_RUN_AUTHORIZED")
  return barcelonaClubIdentityDryRunConfig()
}

// Phase D: observed club/snapshot identities, READ ONLY preparation. No API fallback.
// Do not reuse the expired 2024 caches. A valid 2026 row must be loaded and hashed.
export function parseClubIdentityExpansionReadArgs(args: string[]): ClubIdentityConfig {
  const targets = {
    "manchester-city": { clubId: "cmt94sibe001a5guc60z2rphl", apiFootballTeamId: 50,
      snapshotHash: "c2ff883579915265a7338de7073a019b5e8dcc91212d95eff62459f54977acd0" },
    "real-madrid": { clubId: "cmt7hnsah0004z0ucqy6yoeqz", apiFootballTeamId: 541,
      snapshotHash: "dc266789f05d7a96eb27d87e192862abbece5cc0503a2423a5a2e2d52d9a0562" },
  } as const
  const slug = args[2]
  if (args.length !== 5 || args[0] !== "--dry-run" || args[1] !== "--club" ||
      args[3] !== "--season" || args[4] !== "2026" ||
      (slug !== "manchester-city" && slug !== "real-madrid")) throw new Error("ONLY_EXPANSION_DRY_RUN_AUTHORIZED")
  const target = targets[slug]
  return { clubId: target.clubId, clubSlug: slug, apiFootballTeamId: target.apiFootballTeamId, season: 2026, mode: "DRY_RUN",
    cache: { maxAgeDays: 7 }, snapshot: { required: true, requireParticipation: false, expectedHash: target.snapshotHash },
    writePolicy: { maxAutoWrites: 5, stopOnConflict: true, stopOnAuditMismatch: true, stopOnIndeterminateCommit: true, zeroRetry: true },
    budget: { maxProviderPlayers: 200, maxRelevantPlayers: 2000, maxDryRunAgeMs: 15 * 60 * 1000 } }
}
