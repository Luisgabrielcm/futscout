import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { createClubCorrectionStore } from "../services/prismaClubIdentityCorrectionStore"
import { planClubCorrection, applyClubCorrection, reconcileClubCorrection, type ClubCorrectionPin } from "../services/clubIdentityCorrection"
import { writeExclusiveDurable, publishRedStarReceipt } from "../services/redStarReceipt"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"

// Explicit files only: never loads dotenv or the runtime singleton. One club per invocation.
async function main() {
  const [mode, connectionFile, pinFile, output, input, sha256] = process.argv.slice(2)
  assert.ok(["preflight", "execute", "reconcile"].includes(mode), "MODE_REQUIRED")
  const connection = JSON.parse(readFileSync(connectionFile, "utf8"))
  assert.equal(connection.databaseId, "rknsog8tmbl5u4xqbogxfux5", "DESTINATION_MISMATCH")
  assert.ok(connection.consoleEvidenceRef && connection.connectionString, "CONSOLE_PROVENANCE_REQUIRED")
  const pin: ClubCorrectionPin = JSON.parse(readFileSync(pinFile, "utf8"))
  const evidence = mode === "preflight" ? undefined : readFileSync(input)
  if (evidence) assert.equal(createHash("sha256").update(evidence).digest("hex"), sha256, "INPUT_HASH_MISMATCH")
  const saved = evidence && JSON.parse(evidence.toString("utf8"))
  if (saved) { assert.deepEqual(saved.pin, pin, "PIN_CHANGED"); assert.equal(saved.databaseId, connection.databaseId, "DESTINATION_MISMATCH") }
  if (mode !== "reconcile") assert.ok(!existsSync(output) && !existsSync(output + ".pending.json"), "ATTEMPT_ALREADY_EXISTS")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connection.connectionString }) })
  try {
    const history = await withPrismaReadOnly(db, tx => tx.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'))
    assert.equal(history.length, 20, "MIGRATION_COUNT_MISMATCH")
    assert.ok(history.every(row => row.finished_at && !row.rolled_back_at) && history.some(row => row.migration_name.endsWith("brand_identity_blocked_history")), "HISTORY_MIGRATION_REQUIRED")
    const store = createClubCorrectionStore(db, pin)
    if (mode === "preflight") {
      const before = await store.read()
      planClubCorrection(pin, before, new Date().toISOString(), "preflight-validation")
      await writeExclusiveDurable(output, JSON.stringify({ kind: "club-correction-preflight-v1", databaseId: connection.databaseId, pin, before, at: new Date().toISOString() }, null, 2))
      console.log("READ_ONLY_PREFLIGHT_CONFIRMED"); return
    }
    if (mode === "reconcile") {
      assert.ok(saved.before && saved.after, "RECONCILIATION_STATES_REQUIRED")
      console.log(JSON.stringify(await reconcileClubCorrection(store, saved.before, saved.after))); return
    }
    assert.equal(saved.kind, "club-correction-preflight-v1", "PREFLIGHT_REQUIRED")
    assert.equal(saved.databaseId, connection.databaseId, "DESTINATION_MISMATCH")
    const decisionRef = "FUTSCOUT-REMAINING-CLUBS-20260925-v1"
    const after = planClubCorrection(pin, saved.before, new Date().toISOString(), decisionRef)
    const pending = { kind: "club-correction-pending-v1", databaseId: connection.databaseId, pin, decisionRef, before: saved.before, after, inputSha256: sha256 }
    await writeExclusiveDurable(output + ".pending.json", JSON.stringify(pending, null, 2))
    const result = await applyClubCorrection(store, saved.before, after)
    await publishRedStarReceipt(output, JSON.stringify({ ...pending, kind: "club-correction-receipt-v1", result }, null, 2))
    console.log(result.status)
    if (result.status !== "COMMITTED_INDEPENDENT_READ_CONFIRMED") process.exitCode = 1
  } finally { await db.$disconnect() }
}
main().catch(() => { console.error("CLUB_OPERATION_FAILED_PRESERVE_PENDING_RECONCILE_NO_RETRY"); process.exitCode = 1 })
