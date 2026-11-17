import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { prepareGlobalTransferAutomation } from "../services/globalTransferAutomation"

/** Operator's local private envelope only; never loads .env, providers or database clients. */
export function runGlobalTransferPreparation(args: readonly string[], cwd = process.cwd()) {
  if (args.length !== 6 || args[0] !== "--input" || args[2] !== "--sha256" || args[4] !== "--out" || !/^[a-f0-9]{64}$/.test(args[3])) throw new Error("PRIVATE_INPUT_HASH_AND_OUTPUT_REQUIRED")
  const source = path.resolve(cwd, args[1]), output = path.resolve(cwd, args[5]), privateRoot = path.resolve(cwd, "audit/output")
  const inside = (f: string) => f.startsWith(privateRoot + path.sep)
  if (!inside(source) || !inside(output) || source === output || fs.existsSync(output)) throw new Error("NEW_PRIVATE_OUTPUT_REQUIRED")
  const bytes = fs.readFileSync(source)
  if (createHash("sha256").update(bytes).digest("hex") !== args[3]) throw new Error("PRIVATE_INPUT_CHANGED")
  const input = JSON.parse(bytes.toString("utf8")) as Parameters<typeof prepareGlobalTransferAutomation>[0]
  const plan = prepareGlobalTransferAutomation(input)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  return { mode: "PREPARE_ONLY", eligible: plan.eligible, pending: plan.pending.length, conflicts: plan.conflicts.length,
    batches: plan.batches.length, remaining: plan.remainingBatches.length, productionWrites: 0, paidCalls: 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runGlobalTransferPreparation(process.argv.slice(2)))) }
  catch { console.error("GLOBAL_TRANSFER_PREPARATION_FAILED: inspect the private input locally; no write was attempted against a database."); process.exitCode = 1 }
}
