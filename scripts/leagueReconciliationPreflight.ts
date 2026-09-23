import { readFileSync, writeFileSync } from "node:fs"
import { prisma } from "../lib/prisma"
import { leagueReconciliationAction, readLeagueReconciliationPreflight } from "../services/leagueReconciliationPreflight"

async function main() {
  const output = process.argv[2]
  if (!output) throw new Error("OUTPUT_PATH_REQUIRED")
  // Unknown destination is allowed only by an explicit read-only authorization.
  // The transaction independently enforces READ ONLY; this never authorizes writes.
  const controlPath = process.argv[3]
  const control = controlPath ? JSON.parse(readFileSync(controlPath, "utf8")) : {}
  const gate = leagueReconciliationAction({
    destinationVerified: control.destinationVerified === true,
    unknownDestinationReadOnlyAuthorized: control.unknownDestinationReadOnlyAuthorized === true,
    readOnlyConfirmed: true, // The actual database assertion is inside withPrismaReadOnly below.
    systemFailure: control.systemFailure === true,
    httpStatus: control.httpStatus,
  })
  if (gate.startsWith("STOP_")) {
    writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), status: gate,
      classification: "NOT_EVALUATED_OPERATIONAL" }, null, 2), { flag: "wx" })
    console.log(gate)
    process.exitCode = 1
    return
  }
  const result = await readLeagueReconciliationPreflight(prisma)
  writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2), { flag: "wx" })
  console.log(JSON.stringify({ status: result.status, output }))
  if (result.status !== "READ_CONFIRMED") process.exitCode = 1
}
main().catch(() => { console.error("STOP_OPERATIONAL: no confirmed checkpoint; no retry"); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
