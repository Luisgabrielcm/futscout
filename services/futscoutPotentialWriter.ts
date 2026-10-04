import { canonicalizePotentialJson, fingerprintFutscoutPotential, parsePotentialInstant } from "../lib/futscoutPotential/fingerprint"
import type { PotentialModelIdentity, PotentialTemporalInput } from "../lib/futscoutPotential/fingerprint"
import type { FutscoutPotentialInput } from "../lib/futscoutPotential/types"

export interface PotentialSqlTransaction {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>
}
export interface PotentialTransactionStore {
  /** Resolve ONLY after confirmed COMMIT. Errors must identify rollback vs uncertainty. */
  transaction<T>(work: (tx: PotentialSqlTransaction) => Promise<T>, options: { isolation: "Serializable"; timeoutMs: 30000 }): Promise<T>
}
export class PotentialTransactionFailure extends Error {
  constructor(readonly state: "ROLLED_BACK" | "COMMIT_INDETERMINATE", readonly safeReason: string) { super("POTENTIAL_TRANSACTION_FAILED") }
}
export class PotentialWriteConflict extends Error {
  constructor(readonly reason: string) { super("POTENTIAL_WRITE_CONFLICT") }
}
/** Trusted binding, not caller-selectable coefficients. Future versions need a new approved binding. */
export type RegisteredPotentialCalculator = PotentialModelIdentity & {
  calculate(input: FutscoutPotentialInput): { status: "INVALID"; modelVersion: string } | {
    status: "EXPERIMENTAL"; modelVersion: string
    potential: { raw: number; rounded: number; season: number }
  }
}
export type PotentialWritePlan = Readonly<{
  playerId: string
  expectedExternalId: string | null
  expectedPlayerUpdatedAt: string
  input: PotentialTemporalInput
  expectedCurrent: null | Readonly<{ estimateId: string | null; version: number }>
  operationAt: string
  decisionRef: string
}>
type Current = { estimateId: string | null; version: number }
type Counts = { modelsCreated: number; estimatesCreated: number; currentChanges: number }
export type PotentialWriteReceipt = {
  status: "COMMITTED" | "NO_OP" | "INVALID" | "REJECTED" | "COMMIT_INDETERMINATE"
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  counts: Counts | null
  estimateId?: string
  current?: Current
  reason?: string
  retries: 0
}
const zero = (): Counts => ({ modelsCreated: 0, estimatesCreated: 0, currentChanges: 0 })
const safe = (reason: string) => /^[A-Z0-9_]{2,80}$/.test(reason) ? reason : "TRANSACTION_FAILED"
const conflict = (reason: string): never => { throw new PotentialWriteConflict(reason) }
const equal = (a: unknown, b: unknown) => canonicalizePotentialJson(a) === canonicalizePotentialJson(b)
const iso = (v: unknown) => v instanceof Date ? v.toISOString() : v

/** Isolated writer: no connection creation, ambient client, env, clock, retries or logging. */
export function createFutscoutPotentialWriter(store: PotentialTransactionStore, model: RegisteredPotentialCalculator) {
  // Capture approved binding; later mutation of the caller's descriptor cannot change it.
  const binding = Object.freeze({ ...model })
  return async function write(plan: PotentialWritePlan): Promise<PotentialWriteReceipt> {
    let fingerprint: ReturnType<typeof fingerprintFutscoutPotential>
    let calculation: ReturnType<RegisteredPotentialCalculator["calculate"]>
    try {
      fingerprint = fingerprintFutscoutPotential(binding, plan.input)
      parsePotentialInstant(plan.expectedPlayerUpdatedAt); parsePotentialInstant(plan.operationAt)
      if (!plan.playerId.trim() || !plan.decisionRef.trim() || (plan.expectedCurrent && (!Number.isSafeInteger(plan.expectedCurrent.version) || plan.expectedCurrent.version < 1))) throw new Error("INVALID_PLAN")
      calculation = binding.calculate(fingerprint.coreInput)
      if (calculation.status !== "EXPERIMENTAL" || calculation.modelVersion !== binding.version) throw new Error("INVALID_CALCULATION")
      const p = calculation.potential
      if (!Number.isFinite(p.raw) || p.raw < 1 || p.raw > 99 || p.rounded !== Math.round(p.raw) || !Number.isInteger(p.season) || p.season < 1 || p.season > 10) throw new Error("INVALID_CALCULATION")
    } catch { return { status: "INVALID", transactionState: "NOT_STARTED", counts: zero(), reason: "INVALID_INPUT_OR_MODEL", retries: 0 } }
    const output = calculation.potential
    // Copy all caller data before the first await; mutation during transaction cannot alter plan.
    const command = { ...plan, input: { ...plan.input }, expectedCurrent: plan.expectedCurrent ? { ...plan.expectedCurrent } : null }
    const expectedSnapshot = { ...fingerprint.coreInput, contract: fingerprint.payload }
    const provenance = { kind: "FUTSCOUT_ESTIMATE", inputSource: "PLAYER_SNAPSHOT", sourceUpdatedAt: null, agePolicy: fingerprint.payload.agePolicy }
    let attemptedEstimateId: string | undefined
    try {
      const result = await store.transaction(async tx => {
        const counts = zero()
        // Prisma TIMESTAMP fields store UTC wall time. Return timestamptz explicitly
        // so a driver's local timezone cannot shift DOB or the CAS timestamp.
        const player = (await tx.query(`SELECT id,"externalId","dateOfBirth" AT TIME ZONE 'UTC' AS "dateOfBirth","officialOverall",position,"updatedAt" AT TIME ZONE 'UTC' AS "updatedAt" FROM "Player" WHERE id=$1 FOR SHARE`, [command.playerId])).rows[0]
        if (!player) conflict("PLAYER_NOT_FOUND")
        if (player.externalId !== command.expectedExternalId || iso(player.dateOfBirth) !== command.input.birthDate ||
            player.officialOverall !== command.input.overall || player.position !== command.input.primaryPosition || iso(player.updatedAt) !== command.expectedPlayerUpdatedAt) conflict("PLAYER_STATE_CONFLICT")
        const current = (await tx.query(`SELECT "estimateId",version FROM "PlayerFutscoutPotentialCurrent" WHERE "playerId"=$1 FOR UPDATE`, [command.playerId])).rows[0] ?? null
        if (!equal(current, command.expectedCurrent)) conflict("CURRENT_CAS_CONFLICT")
        const registration = await tx.query(`INSERT INTO "FutscoutPotentialModel" (version,"artifactHash","inputContractVersion","createdAt") VALUES ($1,$2,$3,$4) ON CONFLICT (version) DO NOTHING RETURNING version`, [binding.version,binding.artifactHash,binding.inputContractVersion,command.operationAt])
        counts.modelsCreated = registration.rows.length
        const registered = (await tx.query(`SELECT version,"artifactHash","inputContractVersion" FROM "FutscoutPotentialModel" WHERE version=$1`, [binding.version])).rows[0]
        if (!registered || !equal(registered, { version: binding.version, artifactHash: binding.artifactHash, inputContractVersion: binding.inputContractVersion })) conflict("MODEL_CONFLICT")
        const expected = {
          playerId: command.playerId, modelVersion: binding.version, inputHash: fingerprint.inputHash,
          inputSnapshot: expectedSnapshot, inputAge: fingerprint.coreInput.age, inputOverall: command.input.overall,
          inputPosition: command.input.primaryPosition, inputDateOfBirth: command.input.birthDate, referenceAt: command.input.referenceAt,
          provenance, status: "EXPERIMENTAL", invalidReason: null, potentialRaw: output.raw, potentialRounded: output.rounded, peakSeason: output.season,
        }
        const readSql = `SELECT id,"playerId","modelVersion","inputHash","inputSnapshot","inputAge","inputOverall","inputPosition","inputDateOfBirth" AT TIME ZONE 'UTC' AS "inputDateOfBirth","referenceAt" AT TIME ZONE 'UTC' AS "referenceAt",provenance,status,"invalidReason","potentialRaw","potentialRounded","peakSeason" FROM "PlayerFutscoutPotentialEstimate"`
        function matches(row: Record<string, unknown> | undefined): boolean {
          if (!row) return false
          const { id: _id, ...data } = row
          void _id
          return equal({ ...data, inputDateOfBirth: iso(data.inputDateOfBirth), referenceAt: iso(data.referenceAt) }, expected)
        }
        let estimate = (await tx.query(readSql + ` WHERE "playerId"=$1 AND "modelVersion"=$2 AND "inputHash"=$3`, [command.playerId,binding.version,fingerprint.inputHash])).rows[0]
        if (estimate && !matches(estimate)) conflict("ESTIMATE_CONTENT_CONFLICT")
        if (!estimate) {
          // DB-generated random ID; no time/identity dependence in the mathematical hash.
          const inserted = await tx.query(`INSERT INTO "PlayerFutscoutPotentialEstimate" (id,"playerId","modelVersion","inputHash","inputSnapshot","inputAge","inputOverall","inputPosition","inputDateOfBirth","referenceAt",provenance,status,"potentialRaw","potentialRounded","peakSeason","computedAt","createdAt") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,'EXPERIMENTAL',$11,$12,$13,$14,$14) RETURNING id`, [command.playerId,binding.version,fingerprint.inputHash,JSON.stringify(expectedSnapshot),fingerprint.coreInput.age,command.input.overall,command.input.primaryPosition,command.input.birthDate,command.input.referenceAt,JSON.stringify(provenance),output.raw,output.rounded,output.season,command.operationAt])
          if (inserted.rows.length !== 1) conflict("ESTIMATE_INSERT_MISMATCH")
          estimate = inserted.rows[0]; counts.estimatesCreated = 1
        }
        attemptedEstimateId = String(estimate.id)
        let selected: Current
        if (current?.estimateId === attemptedEstimateId) selected = { estimateId: attemptedEstimateId, version: Number(current.version) }
        else {
          const changed = current
            ? await tx.query(`UPDATE "PlayerFutscoutPotentialCurrent" SET "estimateId"=$1,version=version+1,"selectedAt"=$2,"decisionRef"=$3 WHERE "playerId"=$4 AND version=$5 AND "estimateId" IS NOT DISTINCT FROM $6 RETURNING "estimateId",version`, [attemptedEstimateId,command.operationAt,command.decisionRef,command.playerId,current.version,current.estimateId])
            : await tx.query(`INSERT INTO "PlayerFutscoutPotentialCurrent" ("playerId","estimateId",version,"selectedAt","decisionRef","createdAt") VALUES ($1,$2,1,$3,$4,$3) RETURNING "estimateId",version`, [command.playerId,attemptedEstimateId,command.operationAt,command.decisionRef])
          if (changed.rows.length !== 1) conflict("CURRENT_CAS_CONFLICT")
          selected = { estimateId: String(changed.rows[0].estimateId), version: Number(changed.rows[0].version) }
          counts.currentChanges = 1
        }
        if (!matches((await tx.query(readSql + ` WHERE id=$1`, [attemptedEstimateId])).rows[0])) conflict("ESTIMATE_READ_BACK_MISMATCH")
        const verified = (await tx.query(`SELECT "estimateId",version FROM "PlayerFutscoutPotentialCurrent" WHERE "playerId"=$1`, [command.playerId])).rows[0]
        if (!verified || !equal(verified, selected)) conflict("CURRENT_READ_BACK_MISMATCH")
        return { counts, estimateId: attemptedEstimateId, current: selected }
      }, { isolation: "Serializable", timeoutMs: 30000 })
      return { status: Object.values(result.counts).some(Boolean) ? "COMMITTED" : "NO_OP", transactionState: "COMMIT_CONFIRMED", ...result, retries: 0 }
    } catch (error) {
      if (error instanceof PotentialTransactionFailure && error.state === "ROLLED_BACK") return { status: "REJECTED", transactionState: "ROLLED_BACK", counts: zero(), reason: safe(error.safeReason), retries: 0 }
      return { status: "COMMIT_INDETERMINATE", transactionState: "COMMIT_INDETERMINATE", counts: null, estimateId: attemptedEstimateId, reason: "TRANSACTION_CONFIRMATION_UNKNOWN", retries: 0 }
    }
  }
}
