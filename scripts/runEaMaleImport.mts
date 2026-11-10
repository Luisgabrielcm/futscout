import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool } from "pg"
import { publishEaMaleBatch, publishEaMaleClubBatch, rollbackEaMaleClub, rollbackEaMaleEntry,
  stageEaMaleBatch, stageEaMaleClubBatch, validateEaMaleManifest,
  type EaMaleClubPlan, type EaMaleImportTarget, type EaMaleManifest,
  type EaMalePublicationApproval } from "../services/eaMaleImportBatches"

const modes = ["stage-clubs", "stage-players", "publish-clubs", "publish-players",
  "rollback-club", "rollback-player"] as const
type Mode = typeof modes[number]
const mode = process.argv[2] as Mode
if (!modes.includes(mode)) throw new Error("MODE_REQUIRED")
const selection = process.argv[3]
const allowedArgs = mode.startsWith("rollback-") ? /^\d+$/ : mode.endsWith("clubs") ? /^(0|1|all)$/ : /^[A-Za-z0-9_-]+$|^all$/
if (!selection || !allowedArgs.test(selection)) throw new Error("SELECTION_INVALID")

const dbUrl = process.env.FUTSCOUT_EA_IMPORT_DATABASE_URL
if (!dbUrl) throw new Error("DATABASE_URL_REQUIRED")
const target: EaMaleImportTarget = process.env.FUTSCOUT_EA_IMPORT_TARGET === "production"
  ? { kind: "production", database: process.env.FUTSCOUT_EA_IMPORT_DATABASE_NAME ?? "",
    databaseOid: process.env.FUTSCOUT_EA_IMPORT_DATABASE_OID ?? "",
    clusterId: process.env.FUTSCOUT_EA_IMPORT_CLUSTER_ID ?? "",
    user: process.env.FUTSCOUT_EA_IMPORT_DATABASE_USER ?? "" }
  : process.env.FUTSCOUT_EA_IMPORT_TARGET === "disposable"
    ? { kind: "disposable" } : (() => { throw new Error("TARGET_REQUIRED") })()
if (target.kind === "production" && process.env.FUTSCOUT_EA_IMPORT_PRODUCTION_AUTHORIZED !== "1")
  throw new Error("PRODUCTION_AUTHORIZATION_REQUIRED")

const playersDir = process.env.FUTSCOUT_EA_IMPORT_PLAYERS_DIR
const clubsDir = process.env.FUTSCOUT_EA_IMPORT_CLUBS_DIR
const approvalPath = process.env.FUTSCOUT_EA_IMPORT_APPROVAL_FILE
if (mode.startsWith("publish-") && !approvalPath) throw new Error("PRIVATE_APPROVAL_REQUIRED")
const lines = async (directory: string, file: string) => (await readFile(resolve(directory, file), "utf8"))
  .trim().split(/\r?\n/).map(line => JSON.parse(line))
const pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000 })
let completed = 0
try {
  if (mode.endsWith("clubs") || mode === "rollback-club") {
    if (mode === "rollback-club") {
      await rollbackEaMaleClub(pool, selection, target)
      completed = 1
    } else {
      if (!clubsDir) throw new Error("PRIVATE_CLUB_PLAN_REQUIRED")
      const [summaryText, rawJsonl] = await Promise.all([
        readFile(resolve(clubsDir, "summary.private.json"), "utf8"),
        readFile(resolve(clubsDir, "club-registration-plan.private.jsonl"), "utf8"),
      ])
      const summary = JSON.parse(summaryText) as { clubPlanHash: string; sourceSha256: string }
      const plan: EaMaleClubPlan = { rawJsonl, sha256: summary.clubPlanHash,
        sourceBinarySha256: summary.sourceSha256 }
      const approval = mode === "publish-clubs" ? JSON.parse(await readFile(approvalPath ?? "", "utf8")) as {
        sourcePlanHash: string; sourceBinarySha256: string; rightsForPublicUse: "APPROVED";
        undatedRosterAcknowledged: true } : null
      for (const index of selection === "all" ? [0, 1] : [Number(selection)]) {
        if (mode === "stage-clubs") await stageEaMaleClubBatch(pool, plan, index, target)
        else await publishEaMaleClubBatch(pool, plan, index, target, approval!)
        completed++
      }
    }
  } else if (mode === "rollback-player") {
    await rollbackEaMaleEntry(pool, selection, target)
    completed = 1
  } else {
    if (!playersDir) throw new Error("PRIVATE_PLAYER_MANIFEST_REQUIRED")
    const [summaryText, candidates, batches] = await Promise.all([
      readFile(resolve(playersDir, "summary.private.json"), "utf8"),
      lines(playersDir, "candidates.private.jsonl"), lines(playersDir, "batches.private.jsonl"),
    ])
    const summary = JSON.parse(summaryText) as Pick<EaMaleManifest, "source" | "selectionHash">
    const manifest: EaMaleManifest = { ...summary, candidates, batches }
    validateEaMaleManifest(manifest)
    const approval = mode === "publish-players" ? JSON.parse(await readFile(approvalPath ?? "", "utf8")) as EaMalePublicationApproval : null
    const selected = selection === "all" ? manifest.batches.filter(batch =>
      batch.clubStatus === "KNOWN_CLUB" || batch.clubStatus === "CLUB_NOT_REGISTERED")
      : manifest.batches.filter(batch => batch.id === selection)
    if (selected.length === 0) throw new Error("BATCH_NOT_FOUND")
    for (const batch of selected) {
      if (mode === "stage-players") await stageEaMaleBatch(pool, manifest, batch.id, target)
      else await publishEaMaleBatch(pool, manifest, batch.id, target, approval!)
      completed++
    }
  }
  console.log(JSON.stringify({ status: "PASS", mode, completed }))
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
    ? error.message : "IMPORT_FAILED"
  console.error(JSON.stringify({ status: "BLOCKED", mode, completed, code }))
  process.exitCode = 1
} finally {
  await pool.end()
}
