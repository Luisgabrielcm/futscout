import type { ClubIdentityConfig } from "./clubPlayerIdentityPipeline"

// Phase A operational allowlist only. The core/repository do not know Barcelona IDs.
export function barcelonaClubIdentityDryRunConfig(): ClubIdentityConfig {
  return {
    clubId: "cmt94sq79001l5guc4g4zj7y3", clubSlug: "fc-barcelona", apiFootballTeamId: 529, season: 2026, mode: "DRY_RUN",
    cache: { maxAgeDays: 7, expectedRowHash: "d80583525a6707b21e8ac7fbe5848290" },
    snapshot: { required: false, requireParticipation: false,
      expectedHash: "1d82442da572f610d2565dec8010d44afbb044737dd5b6d4c31ff80068d1dd11" },
    writePolicy: { maxAutoWrites: 10, stopOnConflict: true, stopOnAuditMismatch: true, stopOnIndeterminateCommit: true, zeroRetry: true },
    budget: { maxProviderPlayers: 200, maxRelevantPlayers: 2000, maxDryRunAgeMs: 15 * 60 * 1000 },
  }
}

export function parseClubIdentityPilotArgs(args: string[]) {
  if (args.length !== 5 || args[0] !== "--dry-run" || args[1] !== "--club" || args[2] !== "fc-barcelona" ||
      args[3] !== "--season" || args[4] !== "2026") throw new Error("ONLY_BARCELONA_DRY_RUN_AUTHORIZED")
  return barcelonaClubIdentityDryRunConfig()
}
