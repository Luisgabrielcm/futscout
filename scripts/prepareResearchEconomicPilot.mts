// Read-only inputs; writes only a private, gitignored evidence plan. Never connects to a database.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { prepareResearchCommand, researchHash, type ResearchCommand } from "../lib/researchEconomic"

type PilotRow = { eaId: string; catalogClub: string;
  salaryFixedWeekly: { status: string; amount: number | string | null; currency: string | null; source: string | null };
  contract: { status: string; signed: string | null; until: string | null; precision: string; source: string | null };
  clause: { status: string; amount: number | string | null; currency: string | null; source: string | null } }
type Pilot = { researchedOn: string; catalogSnapshotSha256: string; rows: PilotRow[] }
type Snapshot = { players: Array<{ id: string; externalId: string; clubId: string | null; club: string | null }> }
const [pilotPath, snapshotPath, outputPath] = process.argv.slice(2)
if (!pilotPath || !snapshotPath || !outputPath) throw Error("Usage: prepareResearchEconomicPilot <private-pilot> <private-snapshot> <private-output>")
const pilot = JSON.parse(fs.readFileSync(pilotPath, "utf8")) as Pilot
const snapshotBytes = fs.readFileSync(snapshotPath)
if (createHash("sha256").update(snapshotBytes).digest("hex") !== pilot.catalogSnapshotSha256) throw Error("PILOT_SNAPSHOT_HASH_MISMATCH")
const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as Snapshot
if (pilot.rows.length !== 20) throw Error("PILOT_COUNT_MISMATCH")
const byEa = new Map<string, Snapshot["players"]>()
for (const player of snapshot.players) byEa.set(player.externalId, [...(byEa.get(player.externalId) ?? []), player])
const commands: ResearchCommand[] = []
let review = 0
function requestIdFor(value: unknown) {
  const h = researchHash(value)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
for (const row of pilot.rows) {
  const matches = byEa.get(row.eaId) ?? []
  // The EA alias Lombardia FC is not independently linked to Inter in this catalog.
  if (matches.length !== 1 || !matches[0].clubId || matches[0].club !== row.catalogClub ||
      row.catalogClub === "Lombardia FC" ||
      row.contract.status === "EXPIRY_CONFLICT") { review++; continue }
  const player = matches[0]
  const base = { playerId: player.id, eaId: row.eaId, clubId: player.clubId!,
    action: "RECORD" as const, sourcePublishedOn: null, capturedOn: pilot.researchedOn }
  function add(field: ResearchCommand["field"], classification: ResearchCommand["classification"],
    sourceUrl: string | null, payload: unknown) {
    if (!sourceUrl?.startsWith("https://")) return
    const command: ResearchCommand = { ...base, field, classification, sourceUrl, payload,
      requestId: requestIdFor({ playerId: player.id, field, sourceUrl, payload, capturedOn: pilot.researchedOn }) }
    prepareResearchCommand(command)
    commands.push(command)
  }
  if (row.salaryFixedWeekly.status === "ESTIMATED" && row.salaryFixedWeekly.amount !== null &&
      (row.salaryFixedWeekly.currency === "EUR" || row.salaryFixedWeekly.currency === "GBP" || row.salaryFixedWeekly.currency === "USD"))
    add("SALARY", "ESTIMATED", row.salaryFixedWeekly.source, { weeklyAmount: String(row.salaryFixedWeekly.amount),
      currency: row.salaryFixedWeekly.currency, taxType: "GROSS", composition: "BASE" })
  if (row.contract.status === "OFFICIAL" && row.contract.until && ["YEAR", "MONTH", "DAY"].includes(row.contract.precision))
    add("CONTRACT", "OFFICIAL", row.contract.source, { until: row.contract.until, precision: row.contract.precision,
      signed: row.contract.signed && /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(row.contract.signed)
        ? { date: row.contract.signed, precision: row.contract.signed.length === 4 ? "YEAR" : row.contract.signed.length === 7 ? "MONTH" : "DAY" }
        : null })
  if (row.clause.status === "REPORTED" && row.clause.amount !== null && row.clause.currency)
    add("CLAUSE", "REPORTED", row.clause.source, { status: "YES", amount: String(row.clause.amount),
      currency: row.clause.currency, conditions: null, validUntil: null })
}
const result = { kind: "RESEARCH_EVIDENCE_ONLY", pilotHash: createHash("sha256").update(fs.readFileSync(pilotPath)).digest("hex"),
  snapshotHash: pilot.catalogSnapshotSha256, identityReviewRequired: review, commands }
const serialized = JSON.stringify(result, null, 2) + "\n"
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
if (fs.existsSync(outputPath)) {
  if (fs.readFileSync(outputPath, "utf8") !== serialized) throw Error("PRIVATE_PLAN_ALREADY_DIFFERS")
} else fs.writeFileSync(outputPath, serialized, { flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ researched: pilot.rows.length, evidenceOnly: commands.length,
  salaryReferences: commands.filter(c => c.field === "SALARY").length,
  contracts: commands.filter(c => c.field === "CONTRACT").length,
  clauses: commands.filter(c => c.field === "CLAUSE").length,
  identityReviewRequired: review, published: 0 }))
