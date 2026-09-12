// Phase A: PostgreSQL READ ONLY, full roster classification in memory, no HTTP or writes.
import { execFileSync } from "node:child_process"
import { parseClubIdentityPilotArgs } from "../services/clubIdentityPilotConfig"

async function main() {
  const config = parseClubIdentityPilotArgs(process.argv.slice(2))
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  if (git("branch", "--show-current") !== "beta-next") throw new Error("BETA_NEXT_REQUIRED")
  const head = git("rev-parse", "HEAD")
  // READ ONLY can validate the implementation before commit; report the exact dirty state.
  const workingTree = git("status", "--porcelain", "--untracked-files=all")
  globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_CLUB_IDENTITY_DRY_RUN") }
  await import("dotenv/config")
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
  const [{ PrismaClient }, { PrismaPg }, { runClubIdentityReadOnly }] = await Promise.all([
    import("../app/generated/prisma/client"), import("@prisma/adapter-pg"), import("../services/clubPlayerIdentityReadRepository"),
  ])
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
  try { console.log(JSON.stringify({ head, workingTree, ...await runClubIdentityReadOnly(db, config) })) }
  finally { await db.$disconnect() }
}
main().catch(() => {
  // Do not echo raw DB errors, credentials, URLs, or payloads.
  console.error("CLUB_IDENTITY_DRY_RUN_ABORTED: verify authorized club, config, cache, snapshot and schema; no write mode exists.")
  process.exitCode = 2
})
