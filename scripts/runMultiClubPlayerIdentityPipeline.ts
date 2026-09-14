// Phase A: explicit READ ONLY dry-run. No write mode, token, refresh, or auto-write imports.
import { execFileSync } from "node:child_process"
import { parseMultiClubIdentityArgs, runMultiClubIdentityReadOnly } from "../services/multiClubIdentityReadRepository"

async function main() {
  const slugs = parseMultiClubIdentityArgs(process.argv.slice(2))
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  if (git("branch", "--show-current") !== "beta-next") throw new Error("BETA_NEXT_REQUIRED")
  const head = git("rev-parse", "HEAD"), workingTree = git("status", "--porcelain", "--untracked-files=all")
  globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_MULTI_CLUB_DRY_RUN") }
  const { config } = await import("dotenv")
  config({ quiet: true })
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import("../app/generated/prisma/client"), import("@prisma/adapter-pg")])
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }), log: [{ level: "query", emit: "event" }] })
  let queryCount = 0
  db.$on("query", () => { queryCount++ }) // Counts only. Never print SQL parameters or credentials.
  try {
    const report = await runMultiClubIdentityReadOnly(db, slugs, () => queryCount)
    console.log(JSON.stringify({ head, workingTree, ...report }))
    if (report.stopped) process.exitCode = 2
  } finally { await db.$disconnect() }
}
main().catch(() => {
  console.error("MULTI_CLUB_DRY_RUN_ABORTED: verify scope, evidence and read-only audit. No writes or refresh are available.")
  process.exitCode = 2
})
