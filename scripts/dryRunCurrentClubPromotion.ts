// Phase C is deliberately READ ONLY. The promotion writer is not imported or dispatched here.
import "dotenv/config"
import { execFileSync } from "node:child_process"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { CURRENT_CLUB_PROMOTION_ALLOWLIST, CURRENT_CLUB_PROMOTION_EXCLUDED,
  planCurrentClubPromotion } from "../services/currentClubPromotion"
import { createPrismaCurrentClubPromotionStore } from "../services/prismaCurrentClubPromotionStore"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
const args = process.argv.slice(2)
if (args.length !== 3 || args[0] !== "--dry-run" || args[1] !== "--head" || !/^[a-f0-9]{7,40}$/.test(args[2])) {
  throw new Error("CURRENT_CLUB_PROMOTION_DRY_RUN_ONLY")
}
const expectedHead = git("rev-parse", args[2])
if (git("branch", "--show-current") !== "beta-next" || git("rev-parse", "HEAD") !== expectedHead || git("status", "--porcelain")) {
  throw new Error("CURRENT_CLUB_PROMOTION_GIT_GUARD")
}
globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN") }
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }), errorFormat: "minimal" })

void (async () => {
  const store = createPrismaCurrentClubPromotionStore(db)
  const before = await store.audit()
  if (before.protected.PlayerTransferObservation.count !== "31" ||
      before.protected.PlayerCurrentClubState.count !== "6" || before.proposals.count !== "6" ||
      before.approved.count !== "0") throw new Error("CURRENT_CLUB_PROMOTION_BASELINE_MISMATCH")
  const now = new Date()
  const candidates = []
  for (const allowed of CURRENT_CLUB_PROMOTION_ALLOWLIST) {
    const plan = planCurrentClubPromotion(await store.read(allowed.playerId), now)
    candidates.push({ order: allowed.order, player: allowed.playerName, playerId: allowed.playerId,
      action: plan.action, reason: plan.reason, proposalId: plan.proposal?.id ?? null,
      destinationClubId: plan.proposal?.proposedClubId ?? null,
      destinationProviderTeamId: plan.proposal?.proposedProviderTeamId ?? null,
      evidenceHash: plan.proposal?.evidenceHash ?? null, sourceHash: plan.sourceHash })
  }
  const excluded = []
  for (const item of CURRENT_CLUB_PROMOTION_EXCLUDED) {
    const plan = planCurrentClubPromotion(await store.read(item.playerId), now)
    excluded.push({ player: item.playerName, playerId: item.playerId, action: plan.action,
      reason: plan.reason, proposalStatus: plan.proposal?.status ?? null })
  }
  const after = await store.audit()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("READ_ONLY_AUDIT_CHANGED")
  if (candidates.some(row => row.action !== "AUTO_UPDATE_READY") ||
      excluded.some(row => row.action !== "REVIEW_REQUIRED")) throw new Error("CURRENT_CLUB_PROMOTION_PREFLIGHT_BLOCKED")
  console.log(JSON.stringify({ mode: "DRY_RUN", readOnly: true, apiCalls: 0, writes: 0,
    baseline: { observations: before.protected.PlayerTransferObservation.count,
      statesV1: before.protected.PlayerCurrentClubState.count, proposalsV2: before.proposals.count,
      approved: before.approved.count }, candidates, excluded }, null, 2))
})().catch(error => {
  console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message : "CURRENT_CLUB_PROMOTION_DRY_RUN_FAILED")
  process.exitCode = 2
}).finally(() => db.$disconnect())
