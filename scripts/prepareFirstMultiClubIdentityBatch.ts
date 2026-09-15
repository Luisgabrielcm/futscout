// Phase D ONLY: read-only PostgreSQL preflight. No write mode, token, writer or refresh import.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { runFirstMultiClubPreflight, validateMultiClubPreflightPins, type MultiClubPreflightPins } from "../services/multiClubIdentityPreflight"
async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 5 || args[0] !== "--preflight" || args[1] !== "--pins" || args[3] !== "--expected-head" ||
      !/^[a-f0-9]{40}$/.test(args[4])) throw new Error("EXPLICIT_READ_ONLY_PREFLIGHT_REQUIRED")
  const pins: MultiClubPreflightPins = JSON.parse(readFileSync(args[2], "utf8"))
  validateMultiClubPreflightPins(pins)
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  if (git("branch", "--show-current") !== "beta-next" || git("rev-parse", "HEAD") !== args[4] ||
      git("status", "--porcelain", "--untracked-files=all")) throw new Error("CLEAN_EXPECTED_BETA_HEAD_REQUIRED")
  globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_PREFLIGHT") }
  const { config } = await import("dotenv"); config({ quiet: true })
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import("../app/generated/prisma/client"), import("@prisma/adapter-pg")])
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }), log: [{ level: "query", emit: "event" }] })
  let queries = 0
  db.$on("query", () => { queries++ }) // Count only. No parameters, SQL, URL or credentials in output.
  try {
    const result = await runFirstMultiClubPreflight(db, pins, args[4], () => queries)
    if (git("rev-parse", "HEAD") !== args[4] || git("branch", "--show-current") !== "beta-next" ||
        git("status", "--porcelain", "--untracked-files=all")) throw new Error("GIT_CHANGED_DURING_PREFLIGHT")
    console.log(JSON.stringify(result))
    if (!result.readyForSeparateAuthorization) process.exitCode = 2
  } finally { await db.$disconnect() }
}
main().catch(() => {
  console.error("MULTI_CLUB_PREFLIGHT_ABORTED: scope, pins, freshness or read-only audit failed. No write or refresh available.")
  process.exitCode = 2
})
