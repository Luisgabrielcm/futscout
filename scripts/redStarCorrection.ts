import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { parseArgs, isDeepStrictEqual } from "node:util"
import { correctRedStar, reverseRedStarClubId, validateRedStarPreflight,
  plannedRedStarCorrection, plannedRedStarReversal, reconcileRedStar,
  type RedStarSnapshot, type RedStarResult } from "../services/redStarCorrection"
import { publishRedStarReceipt, writeExclusiveDurable, reconciliationStates } from "../services/redStarReceipt"
import { createPrismaRedStarCorrectionStore } from "../services/prismaRedStarCorrectionStore"

async function main() {
  const { values: args } = parseArgs({ options: {
    mode: { type: "string" }, input: { type: "string" }, out: { type: "string" },
    sha256: { type: "string" }, actor: { type: "string" }, decision: { type: "string" }, confirm: { type: "string" },
  }, strict: true })
  const mode = args.mode
  if (!["preflight", "execute", "verify", "reverse", "reconcile"].includes(mode ?? "")) throw new Error("MODE_REQUIRED")
  const writes = mode === "execute" || mode === "reverse"
  if ((writes || mode === "preflight") && !args.out) throw new Error("UNIQUE_OUTPUT_PATH_REQUIRED")
  if (mode === "reconcile" && args.out) throw new Error("RECONCILIATION_IS_STDOUT_ONLY")
  if (writes && (!args.actor?.trim() || !args.decision?.trim() || args.confirm !==
    (mode === "execute" ? "RED_STAR_4396_TO_104" : "CLEAR_PROVIDER_ID_KEEP_CREST_BLOCKED"))) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED")
  let input: { kind: string; expected?: RedStarSnapshot; result?: RedStarResult } | undefined
  if (mode !== "preflight") {
    if (!args.input || !args.sha256) throw new Error("REVIEWED_INPUT_AND_SHA256_REQUIRED")
    const bytes = await readFile(args.input)
    if (createHash("sha256").update(bytes).digest("hex") !== args.sha256.toLowerCase()) throw new Error("INPUT_HASH_MISMATCH")
    input = JSON.parse(bytes.toString("utf8"))
    if (mode === "execute" && (input?.kind !== "red-star-preflight-v1" || !input.expected)) throw new Error("PREFLIGHT_REQUIRED")
    if ((mode === "verify" || mode === "reverse") && (input?.kind !== "red-star-receipt-v1" || input.result?.status !== "COMMITTED" || !input.result.after))
      throw new Error("CONFIRMED_RECEIPT_REQUIRED_NO_AUTOMATIC_RETRY")
  }
  const audit = { actor: args.actor!, decisionRef: args.decision!, at: new Date().toISOString() }
  const reconciliation = mode === "reconcile" ? reconciliationStates(input) : undefined
  // Plan using the exact timestamp the transaction will use. Reserve complete recovery evidence first.
  if (writes) {
    const before = mode === "execute" ? input!.expected! : input!.result!.after!
    const after = mode === "execute" ? plannedRedStarCorrection({ expected: before, ...audit })
      : plannedRedStarReversal(input!.result!, audit)
    await writeExclusiveDurable(args.out!, JSON.stringify({ kind: "red-star-pending-v2", inputHash: args.sha256,
      mode, ...audit, before, after }, null, 2) + "\n")
  }
  const { prisma } = await import("../lib/prisma")
  try {
    const store = createPrismaRedStarCorrectionStore(prisma)
    let output: unknown
    if (mode === "preflight") {
      const expected = await store.read() // SET TRANSACTION READ ONLY; never calls the provider.
      validateRedStarPreflight(expected)
      output = { kind: "red-star-preflight-v1", capturedAt: new Date().toISOString(), expected }
    } else if (mode === "reconcile") {
      const result = await reconcileRedStar({ read: store.read }, reconciliation!)
      console.log(JSON.stringify(result, null, 2))
      if (result.status !== "MATCHES_EXPECTED") process.exitCode = result.status === "MATCHES_BEFORE" ? 2 : 3
      return
    } else if (mode === "verify") {
      const actual = await store.read()
      if (!isDeepStrictEqual(actual, input!.result!.after)) throw new Error("CONFIRMATION_MISMATCH_DO_NOT_RETRY")
      console.log("CONFIRMED: club, league, player IDs, quarantine and protected data match the receipt.")
      return
    } else {
      const result = mode === "execute"
        ? await correctRedStar(store, { expected: input!.expected!, ...audit })
        : await reverseRedStarClubId(store, input!.result!, audit)
      output = { kind: "red-star-receipt-v1", mode, inputHash: args.sha256, ...audit, result }
      if (result.status !== "COMMITTED") process.exitCode = 1
      console.log(`${result.status}: ${result.reason}; retries=0`)
    }
    const bytes = JSON.stringify(output, null, 2) + "\n"
    if (writes) await publishRedStarReceipt(args.out!, bytes)
    else await writeFile(args.out!, bytes, { flag: "wx" })
    console.log(`SHA256=${createHash("sha256").update(bytes).digest("hex")}`)
  } finally { await prisma.$disconnect() }
}

main().catch(error => {
  // Never expose connection strings/SQL/credentials from transport errors.
  const message = error instanceof Error ? error.message : ""
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
  const safeReason = /^[A-Z][A-Z_]{2,100}$/.test(message) ? message : /^[A-Z][A-Z0-9_]{1,30}$/.test(code) ? code : "DETAILS_REDACTED"
  console.error(`Reason: ${safeReason}`)
  console.error("STOP: operation failed; preserve any pending receipt, inspect state read-only, do not retry a write automatically.")
  process.exitCode = 1
})
