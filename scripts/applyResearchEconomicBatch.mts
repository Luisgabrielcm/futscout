// Trusted operator only. No public HTTP route, no DATABASE_URL/DIRECT_URL fallback.
import fs from "node:fs"
import { Pool } from "pg"
import { writeResearchEconomicBatch } from "../services/researchEconomicWriter"
import type { ResearchCommand } from "../lib/researchEconomic"

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== "--apply-researched-authorized") throw Error("RESEARCH_APPLY_NOT_AUTHORIZED")
const url = process.env.FUTSCOUT_RESEARCH_DATABASE_URL
if (!url) throw Error("RESEARCH_CONNECTION_NOT_CONFIGURED")
const parsed = JSON.parse(fs.readFileSync(args[1], "utf8")) as { kind: string; commands: ResearchCommand[] }
if (!Array.isArray(parsed.commands) || parsed.commands.length === 0 ||
    parsed.kind === "RESEARCH_EVIDENCE_ONLY" && parsed.commands.some(c => c.action !== "RECORD") ||
    parsed.kind === "RESEARCH_PUBLICATION_CANDIDATES" && parsed.commands.some(c => c.action !== "PUBLISH") ||
    !["RESEARCH_EVIDENCE_ONLY", "RESEARCH_PUBLICATION_CANDIDATES"].includes(parsed.kind))
  throw Error("RESEARCH_BATCH_INVALID")
const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 10000, query_timeout: 10000 })
let written = 0, replayed = 0
try {
  for (let offset = 0; offset < parsed.commands.length; offset += 100) {
    const result = await writeResearchEconomicBatch(pool, parsed.commands.slice(offset, offset + 100))
    written += result.length
    replayed += result.filter(r => r.replay).length
  }
  console.log(JSON.stringify({ status: "COMPLETE", written, replayed }))
} finally { await pool.end() }
