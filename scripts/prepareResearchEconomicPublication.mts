// Converts reviewed, private evidence into two bounded publication candidates; never opens a database.
import fs from "node:fs"
import path from "node:path"
import { prepareResearchCommand, researchHash, type ResearchCommand } from "../lib/researchEconomic"

const [evidencePath, firstPath, remainingPath] = process.argv.slice(2)
if (!evidencePath || !firstPath || !remainingPath) throw Error("Usage: prepareResearchEconomicPublication <evidence> <first-output> <remaining-output>")
const plan = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as { kind: string; commands: ResearchCommand[] }
if (plan.kind !== "RESEARCH_EVIDENCE_ONLY" || !Array.isArray(plan.commands)) throw Error("RESEARCH_EVIDENCE_INVALID")
const candidates = plan.commands.filter(c => c.field === "CONTRACT" && c.classification === "OFFICIAL" ||
  c.field === "CLAUSE" && c.classification === "REPORTED").map(c => {
  if (c.action !== "RECORD") throw Error("RESEARCH_EVIDENCE_INVALID")
  const h = researchHash({ action: "PUBLISH", evidenceRequestId: c.requestId })
  const command: ResearchCommand = { ...c, action: "PUBLISH", expectedHeadRevision: 0,
    requestId: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
  prepareResearchCommand(command)
  return command
})
if (candidates.length !== 12 || candidates.filter(c => c.field === "CONTRACT").length !== 9 ||
    candidates.filter(c => c.field === "CLAUSE").length !== 3) throw Error("RESEARCH_CANDIDATE_COUNT_MISMATCH")
const first = candidates.filter(c => c.field === "CONTRACT").slice(0, 2)
const firstIds = new Set(first.map(c => c.requestId))
const remaining = candidates.filter(c => !firstIds.has(c.requestId))
function save(file: string, commands: ResearchCommand[]) {
  const body = JSON.stringify({ kind: "RESEARCH_PUBLICATION_CANDIDATES", commands }, null, 2) + "\n"
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") !== body) throw Error("RESEARCH_CANDIDATE_ALREADY_DIFFERS")
  } else fs.writeFileSync(file, body, { flag: "wx", mode: 0o600 })
}
save(firstPath, first)
save(remainingPath, remaining)
console.log(JSON.stringify({ firstContracts: first.length, remainingContracts: 7, remainingClauses: 3, salaryPublications: 0 }))
