import { PrismaPg } from "@prisma/adapter-pg"
import { pathToFileURL } from "node:url"
import { PrismaClient } from "../app/generated/prisma/client"
import { countMarketValuePlayer, emptyMarketValueCoverage } from "../lib/economicData/coverage"
import { economicMarketValueReadSelect } from "../lib/economicData/read"

export async function runValueCoverageBaseline(connectionString: string) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }), errorFormat: "minimal" })
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const status = await tx.$queryRaw<{ read_only: string }[]>`SELECT current_setting('transaction_read_only') AS read_only`
      if (status[0]?.read_only !== "on") throw new Error("READ_ONLY_NOT_CONFIRMED")
      const coverage = emptyMarketValueCoverage()
      let cursor: string | undefined
      while (true) {
        const page = await tx.player.findMany({
          select: { id: true, economicCurrents: economicMarketValueReadSelect },
          orderBy: { id: "asc" }, take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })
        for (const player of page) countMarketValuePlayer(coverage, player)
        if (page.length < 500) break
        cursor = page[page.length - 1].id
      }
      return coverage
    }, { isolationLevel: "RepeatableRead", timeout: 120_000 })
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  if (process.argv.slice(2).join(" ") !== "--read-only-authorized" || !process.env.FUTSCOUT_VALUE_COVERAGE_DATABASE_URL) {
    process.stderr.write("Requires --read-only-authorized and FUTSCOUT_VALUE_COVERAGE_DATABASE_URL. No query executed.\n")
    process.exitCode = 2
  } else {
    try {
      const totals = await runValueCoverageBaseline(process.env.FUTSCOUT_VALUE_COVERAGE_DATABASE_URL)
      process.stdout.write(`${JSON.stringify(totals)}\n`)
    } catch {
      process.stderr.write("VALUE_COVERAGE_READ_FAILED (details suppressed).\n")
      process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
