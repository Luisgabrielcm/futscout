// Explicit modes. Writes require a fresh authorization for Eric, first City or first Real batch.
import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { dispatchClubIdentityRunner, requireOperationalClubIdentityPilot } from "../services/clubIdentityRunner"
import { clubIdentityWriteToken } from "../services/clubIdentityAuthorization"

async function main() {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  const client = async () => {
    await import("dotenv/config")
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import("../app/generated/prisma/client"), import("@prisma/adapter-pg")])
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) })
  }
  await dispatchClubIdentityRunner(process.argv.slice(2), { git, clock: () => new Date(),
    blockHttp: () => { globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN_IN_CLUB_IDENTITY") } },
    readSummary: path => { if (statSync(path).size > 2_000_000) throw new Error("SUMMARY_TOO_LARGE"); return JSON.parse(readFileSync(path, "utf8")) },
    readOnly: async (mode, head, workingTree, config) => {
      const db = await client()
      try {
        const { runClubIdentityReadOnly } = await import("../services/clubPlayerIdentityReadRepository")
        const result = await runClubIdentityReadOnly(db, config)
        if (mode === "PREFLIGHT") requireOperationalClubIdentityPilot(result.report)
        console.log(JSON.stringify({ head, workingTree, ...result,
          ...(mode === "PREFLIGHT" ? { confirmation: clubIdentityWriteToken(result.report) } : {}) }))
      } finally { await db.$disconnect() }
    },
    loadWrite: async () => {
      const { executeClubIdentityAutoWrite, createPrismaClubIdentityWriteDependencies } = await import("../services/clubIdentityAutoWrite")
      return async input => {
        const db = await client()
        try {
          const config = input.report.config
          const result = await executeClubIdentityAutoWrite({ ...input, mode: "AUTO_WRITE", config },
            createPrismaClubIdentityWriteDependencies(db, config, () => ({ branch: git("branch", "--show-current"),
              clean: !git("status", "--porcelain", "--untracked-files=all"), head: git("rev-parse", "HEAD") })))
          console.log(JSON.stringify(result)); if (result.stopped) process.exitCode = 2
        } finally { await db.$disconnect() }
      }
    },
  })
}
main().catch(() => {
  // Do not echo raw DB errors, credentials, URLs, or payloads.
  console.error("CLUB_IDENTITY_ABORTED: verify Git, explicit authorization, candidate set, cache, snapshot and schema. Never retry a write without auditing it.")
  process.exitCode = 2
})
