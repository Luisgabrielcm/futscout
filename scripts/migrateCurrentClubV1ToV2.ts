// Phase A runner is deliberately READ ONLY. A later authorization must add a separate write dispatch.
import "dotenv/config"
import { execFileSync } from "node:child_process"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { planCurrentClubV1Migration } from "../services/currentClubV1Migration"
import { createPrismaCurrentClubV1MigrationStore } from "../services/prismaCurrentClubV1MigrationStore"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
const args = process.argv.slice(2)
if (args.length !== 3 || args[0] !== "--dry-run" || args[1] !== "--head" || !/^[a-f0-9]{7,40}$/.test(args[2])) {
  throw new Error("CURRENT_CLUB_V1_MIGRATION_DRY_RUN_ONLY")
}
if (git("branch", "--show-current") !== "beta-next" || git("rev-parse", "HEAD") !== args[2] || git("status", "--porcelain")) {
  throw new Error("CURRENT_CLUB_V1_MIGRATION_GIT_GUARD")
}
globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN") }
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }), errorFormat: "minimal" })

void (async () => {
  const store = createPrismaCurrentClubV1MigrationStore(db)
  const before = await store.audit()
  if (before.protected.PlayerTransferObservation.count !== "31" || before.protected.PlayerCurrentClubState.count !== "6" ||
      before.proposals.count !== "0" || before.protected.PlayerApprovedCurrentClub.count !== "0") {
    throw new Error("CURRENT_CLUB_V1_MIGRATION_BASELINE_MISMATCH")
  }
  const plan = planCurrentClubV1Migration(await store.read())
  const after = await store.audit()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("READ_ONLY_AUDIT_CHANGED")
  console.log(JSON.stringify({ mode: "DRY_RUN", readOnly: true, apiCalls: 0, writes: 0,
    counts: { observations: before.protected.PlayerTransferObservation.count,
      statesV1: before.protected.PlayerCurrentClubState.count, proposalsV2: before.proposals.count,
      approved: before.protected.PlayerApprovedCurrentClub.count },
    snapshotHash: plan.snapshotHash, summaryHash: plan.summaryHash, creates: plan.creates,
    reviews: plan.reviews, blocked: plan.blocked, conflicts: plan.conflicts, noOps: plan.noOps,
    rows: plan.rows.map(row => ({ player: row.playerName, providerPlayerId: row.providerPlayerId,
      action: row.action, status: row.proposal?.status ?? null, proposedClubId: row.proposal?.proposedClubId ?? null,
      proposedProviderTeamId: row.proposal?.proposedProviderTeamId ?? null, decision: row.proposal?.decision ?? null,
      warnings: row.proposal?.warnings ?? [], reason: row.reason, wouldCreate: row.wouldCreate })) }, null, 2))
})().catch(error => {
  console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "CURRENT_CLUB_V1_MIGRATION_FAILED")
  process.exitCode = 2
}).finally(() => db.$disconnect())
