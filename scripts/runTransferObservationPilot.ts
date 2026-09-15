import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { parseTransferPilotArgs, requireTransferPilotGit, runTransferObservationPilot } from "../services/transferObservationPilot"
import { readTransferAuditHashes, readTransferPilotEvidence } from "../services/transferObservationReadRepository"

async function main() {
  const mode = parseTransferPilotArgs(process.argv.slice(2))
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  const state = () => ({ branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"), status: git("status", "--porcelain", "--untracked-files=all") })
  const initial = state()
  requireTransferPilotGit(initial)
  // PREFLIGHT never constructs a reader and blocks HTTP explicitly.
  const fetchOriginal = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async () => { throw new Error("HTTP_ONLY_VIA_ISOLATED_TRANSFER_GUARD") }
  await import("dotenv/config")
  if (!process.env.DIRECT_URL || (mode === "DRY_RUN" && !process.env.API_FOOTBALL_KEY)) throw new Error("TRANSFER_PILOT_CONFIGURATION_MISSING")
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import("../app/generated/prisma/client"), import("@prisma/adapter-pg")])
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }), log: [] })
  try {
    const now = new Date(), before = await readTransferPilotEvidence(db, now)
    const report = mode === "PREFLIGHT" ? { mode, evidence: before.evidence, requests: 0, writes: 0 } :
      await runTransferObservationPilot({ evidence: before.evidence, now, apiKey: process.env.API_FOOTBALL_KEY! },
        { fetch: fetchOriginal, beforeRequest: () => { requireTransferPilotGit(state(), initial.head)
          if (Date.now() - now.getTime() > 5 * 60000) throw new Error("TRANSFER_PREFLIGHT_EXPIRED") } })
    // Preserve the partial operational result even if the AFTER read or Git audit fails.
    try {
      const after = await readTransferAuditHashes(db)
      const unchanged = isDeepStrictEqual(before.hashes, after)
      requireTransferPilotGit(state(), initial.head)
      console.log(JSON.stringify({ head: initial.head, branch: initial.branch, before: before.hashes, after, unchanged, report }))
      if (!unchanged || ("complete" in report && !report.complete)) process.exitCode = 2
    } catch {
      console.log(JSON.stringify({ head: initial.head, branch: initial.branch, before: before.hashes,
        after: null, unchanged: null, audit: "AFTER_VERIFICATION_FAILED", report }))
      process.exitCode = 2
    }
  } finally { await db.$disconnect() }
}
main().catch(() => {
  // No raw provider/Prisma/network errors, URLs, headers or credentials in diagnostics.
  console.error("TRANSFER_OBSERVATION_ABORTED: verify arguments, Git, local identities, configuration and read-only evidence.")
  process.exitCode = 2
})
