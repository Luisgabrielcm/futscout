// Explicit manual operation only; never imported by public runtime or a scheduler.
import "dotenv/config"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { transferEvidenceHash } from "../lib/transferHistory"
import { TRANSFER_PILOT_PLAYERS, requireTransferPilotGit } from "../services/transferObservationPilot"
import { readTransferPilotEvidence } from "../services/transferObservationReadRepository"
import { buildTransferPilotInputs, readAuditedTransferPayloads, runTransferPersistenceUnits } from "../services/transferPersistencePilot"
import { dryRunTransferPersistence, requireFreshTransferPlan, writeTransferPersistence, type TransferPersistenceInput } from "../services/transferProjectionPersistence"
import { decodeTransferObservation } from "../services/prismaTransferObservationStore"

const root = "audit/reports/lote11-phase-e"
const stringify = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2)
const save = (name: string, value: unknown) => writeFileSync(`${root}-${name}.json`, stringify(value) + "\n")
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
const args = process.argv.slice(2)
const mode = args[0], head = args[2]
if (args.length !== 3 || !["--dry-run", "--write", "--rerun", "--audit"].includes(mode) || args[1] !== "--head") throw new Error("TRANSFER_PERSISTENCE_ARGS_REJECTED")
requireTransferPilotGit({ branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"), status: git("status", "--porcelain") }, head)
globalThis.fetch = async () => { throw new Error("HTTP_FORBIDDEN") }
const bytes = readFileSync("audit/reports/lote11-phase-b-pilot-evidence.json")
const observations = readAuditedTransferPayloads(bytes)
const protectedBaseline = JSON.parse(bytes.toString("utf8")).pilot.before
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
  log: [{ level: "query", emit: "event" }], errorFormat: "minimal" })
let queries = 0
db.$on("query", () => { queries++ }) // Count only; never log SQL parameters or credentials.
const scope = TRANSFER_PILOT_PLAYERS

async function audit(now: Date) {
  const fresh = await readTransferPilotEvidence(db, now)
  if (!isDeepStrictEqual(fresh.hashes, protectedBaseline)) throw new Error("TRANSFER_PROTECTED_BASELINE_CHANGED")
  const state = await withPrismaReadOnly(db, async tx => {
    const migration = "20260916000000_transfer_observations_current_club"
    const checksum = createHash("sha256").update(readFileSync(`prisma/migrations/${migration}/migration.sql`)).digest("hex")
    const history = await tx.$queryRawUnsafe<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
      'SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1', migration)
    if (history.length !== 1 || history[0].checksum !== checksum || !history[0].finished_at || history[0].rolled_back_at) throw new Error("TRANSFER_MIGRATION_GUARD")
    const players = await tx.player.findMany({ where: { id: { in: scope.map(p => p.playerId) } }, orderBy: { id: "asc" } })
    const rows = await tx.playerTransferObservation.findMany({ orderBy: { id: "asc" } })
    const states = await tx.playerCurrentClubState.findMany({ orderBy: { playerId: "asc" } })
    if (rows.some(r => !scope.some(p => p.playerId === r.playerId && p.providerPlayerId === r.providerPlayerId)) ||
        states.some(s => !scope.some(p => p.playerId === s.playerId) || s.status !== "PROPOSED")) throw new Error("TRANSFER_REAL_SCOPE_CHANGED")
    rows.forEach(decodeTransferObservation)
    return { players, rows, states, associated: await tx.player.count({ where: { apiFootballId: { not: null } } }) }
  })
  return { at: now.toISOString(), ...fresh, ...state, readOnly: true, rollback: true, apiCalls: 0 }
}
type SavedPlan = { head: string; inputs: TransferPersistenceInput[]; plans: Awaited<ReturnType<typeof dryRunTransferPersistence>>[];
  before: Awaited<ReturnType<typeof audit>>; integrityHash: string }
async function main() {
  if (mode === "--audit") {
    const after = await audit(new Date()); save("audit", after)
    console.log(stringify({ observations: after.rows.length, projections: after.states.length, associated: after.associated, protectedHashesUnchanged: true, queries })); return
  }
  if (mode === "--dry-run") {
    if (existsSync(`${root}-write-attempt.json`)) throw new Error("TRANSFER_PRIOR_ATTEMPT_REQUIRES_REVIEW")
    const now = new Date(), before = await audit(now)
    if (before.rows.length || before.states.length) throw new Error("TRANSFER_INITIAL_TABLES_NOT_EMPTY")
    const inputs = buildTransferPilotInputs(before.evidence, observations, before.players, before.hashes, now)
    const plans = []
    for (const input of inputs) plans.push(await dryRunTransferPersistence(db, input, scope))
    const data = { head, inputs, plans, before }
    // Serialize Dates first, so the integrity seal survives JSON round-tripping.
    const stored = JSON.parse(stringify(data))
    save("plan", { ...stored, integrityHash: transferEvidenceHash(stored) })
    console.log(stringify({ mode, queries, writes: 0, plans: plans.map(p => ({ player: p.providerPlayerId, insert: p.observationsToInsert,
      existing: p.alreadyExisting, revisions: p.revisions, decision: p.decision.decision, warnings: p.decision.warnings,
      projection: p.proposed, unknownTeams: p.unknownTeams })) })); return
  }
  const saved = JSON.parse(readFileSync(`${root}-plan.json`, "utf8")) as SavedPlan
  const { integrityHash, ...data } = saved
  if (head !== saved.head || transferEvidenceHash(data) !== integrityHash) throw new Error("TRANSFER_PLAN_INTEGRITY_FAILED")
  const inputs = saved.inputs.map(i => ({ ...i, now: new Date(i.now) }))
  inputs.forEach(i => requireFreshTransferPlan(i.now))
  const before = await audit(new Date())
  if (stringify(before.players) !== stringify(saved.before.players)) throw new Error("TRANSFER_PLAYER_CHANGED_SINCE_PLAN")
  const marker = mode === "--write" ? "write" : "rerun"
  if (existsSync(`${root}-${marker}-attempt.json`)) throw new Error("TRANSFER_PRIOR_ATTEMPT_REQUIRES_REVIEW")
  if (mode === "--write" && (before.rows.length || before.states.length)) throw new Error("TRANSFER_INITIAL_TABLES_NOT_EMPTY")
  if (mode === "--rerun") {
    const previous = JSON.parse(readFileSync(`${root}-write.json`, "utf8"))
    if (!previous.success || stringify(previous.after.rows) !== stringify(before.rows) || stringify(previous.after.states) !== stringify(before.states)) throw new Error("TRANSFER_RERUN_BASELINE_CHANGED")
  }
  // Durable attempt marker BEFORE any write. Crash/indeterminate commit needs audit, never blind replay.
  save(`${marker}-attempt`, { head, at: new Date().toISOString(), mode, integrityHash })
  const result = await runTransferPersistenceUnits(inputs, async input => {
    const index = inputs.indexOf(input)
    const plan = mode === "--write" ? saved.plans[index] : await dryRunTransferPersistence(db, input, scope)
    if (mode === "--rerun" && (plan.observationsToInsert || plan.projectionToInsert)) throw new Error("TRANSFER_RERUN_NOT_NOOP")
    const start = queries
    const written = await writeTransferPersistence(db, input, scope, plan.planHash)
    const event = { player: input.player.providerPlayerId, inserted: written.inserted, noOp: written.duplicates, revisions: written.revisions,
      projectionInserted: written.projectionInserted, decision: written.decision.decision, queries: queries - start, promoted: false }
    console.log(stringify(event))
    return { ...written, queryCount: queries - start }
  })
  const after = await audit(new Date())
  const unchangedPlayers = stringify(before.players) === stringify(after.players)
  const idempotent = mode !== "--rerun" || (stringify(before.rows) === stringify(after.rows) && stringify(before.states) === stringify(after.states))
  const success = result.failedPlayerId === null && unchangedPlayers && idempotent
  save(marker, { head, success, mode, result, before, after, unchangedPlayers, idempotent, queries, apiCalls: 0 })
  console.log(stringify({ success, observations: after.rows.length, projections: after.states.length, unchangedPlayers, idempotent, queries, apiCalls: 0 }))
  if (!success) process.exitCode = 2
}
main().catch(error => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "TRANSFER_OPERATION_FAILED_REQUIRES_AUDIT"
  console.error(code); process.exitCode = 2
}).finally(() => db.$disconnect())
