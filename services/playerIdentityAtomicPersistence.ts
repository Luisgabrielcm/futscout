import type { PrismaClient, Prisma } from "../app/generated/prisma/client"
import { isDeepStrictEqual } from "node:util"
import { calculateMatchConfidence, canAutomaticallySave, classifyMatchConfidence,
  API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN } from "./apiFootballPlayerMatcherCore"
import { getBarcelonaIdentityBatch, type BarcelonaIdentityBatchId, type PreparedIdentityMatch } from "./barcelonaIdentityWritePolicy"
import { diagnostic, failureDiagnostic, safeOriginalCode, emitIdentityEvent, IdentityWriteDiagnosticError,
  type IdentityWriteDiagnostic, type IdentityWriteStage, type IdentityWriteCode, type IdentityTransactionState,
  type IdentityWriteEvent, type IdentityWriteObserver } from "./identityWriteDiagnostics"

export type AtomicMatchStatus = "MATCHED" | "ALREADY_MATCHED_SAME_ID" |
  "CONFLICT_PLAYER_ALREADY_HAS_OTHER_ID" | "CONFLICT_PROVIDER_ID_TAKEN" |
  "CONCURRENT_MODIFICATION" | "ATTEMPT_FAILURE" | "VALIDATION_FAILURE" | "INDETERMINATE_COMMIT" | "AUTHORIZATION_MISMATCH"
export type AtomicMatchResult = { status: AtomicMatchStatus; playerId: string; providerId: number;
  clubId?: string | null; diagnostic?: IdentityWriteDiagnostic; events?: IdentityWriteEvent[] }
class AtomicAbort extends IdentityWriteDiagnosticError {
  constructor(readonly status: AtomicMatchStatus, detail: IdentityWriteDiagnostic) { super(detail, status) }
}
const codeOf = (e: unknown) => typeof e === "object" && e !== null && "code" in e ? e.code : undefined

export type AtomicIdentityMatch = Omit<PreparedIdentityMatch, "margin" | "snapshotHash"> & { margin: number | null; snapshotHash: string | null }
export type AtomicIdentityPolicy = {
  clubId: string; apiTeamId: number; cacheId: string; cacheRowHash: string
  snapshotId: string | null; snapshotHash: string | null
  targets: readonly { playerId: string; providerId: number }[]
  validUntil?: Date
  allowSingleCandidate?: boolean
  revalidate?: (tx: Prisma.TransactionClient, match: AtomicIdentityMatch, now: Date) => Promise<void>
  onEvent?: IdentityWriteObserver
}

function validate(m: AtomicIdentityMatch, now: Date, pin: AtomicIdentityPolicy, state: IdentityTransactionState,
  postWrite = false) {
  const check = (invalid: boolean, stage: IdentityWriteStage, code: IdentityWriteCode) => {
    if (invalid) throw new AtomicAbort("VALIDATION_FAILURE", diagnostic(postWrite ? "POST_WRITE_VALIDATION" : stage, code, state))
  }
  const target = pin.targets.find(t => t.playerId === m.identity.id)
  check(!target || target.providerId !== m.providerId, "AUTHORIZATION", "AUTHORIZATION_MISMATCH")
  check(m.identity.clubId !== pin.clubId || m.identity.club?.apiFootballId !== pin.apiTeamId, "IDENTITY_VALIDATION", "CLUB_IDENTITY_MISMATCH")
  check(m.decision !== "AUTO_MATCH", "MATCHER_REVALIDATION", "MATCHER_NOT_AUTO_MATCH")
  check(m.cacheRowHash !== pin.cacheRowHash, "CACHE_VALIDATION", "CACHE_HASH_MISMATCH")
  check(m.snapshotHash !== pin.snapshotHash, "SNAPSHOT_VALIDATION", "SNAPSHOT_MISMATCH")
  check(!Number.isFinite(now.getTime()) || !Number.isFinite(m.cacheExpiresAt.getTime()) || m.cacheExpiresAt <= now, "CACHE_VALIDATION", "CACHE_INVALID")
  check(!Number.isFinite(m.identity.updatedAt.getTime()) || !Number.isFinite(m.identity.dateOfBirth?.getTime()), "IDENTITY_VALIDATION", "INVALID_IDENTITY")
  check(!Number.isInteger(m.nameScore) || m.nameScore > 100 || m.birthMatches !== true || m.clubMatches !== true || typeof m.nationalityMatches !== "boolean" ||
    (m.margin === null ? !pin.allowSingleCandidate || !pin.revalidate : !Number.isFinite(m.margin) || m.margin > 100 || m.margin < API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN), "MATCHER_REVALIDATION", "MATCHER_NOT_AUTO_MATCH")
  check(pin.validUntil !== undefined && (!Number.isFinite(pin.validUntil.getTime()) || pin.validUntil <= now), "AUTHORIZATION", "AUTHORIZATION_EXPIRED")
  check(m.confidence !== calculateMatchConfidence(m) || !canAutomaticallySave({ ...m, classification: classifyMatchConfidence(m.confidence) }), "MATCHER_REVALIDATION", "MATCHER_NOT_AUTO_MATCH")
}

// No singleton, env, network, resolver, retry helper or side effects on import.
// The caller supplies a client; every model operation is scoped to ONE transaction.
export async function persistPlayerApiFootballMatchAtomically(
  db: Pick<PrismaClient, "$transaction">, prepared: PreparedIdentityMatch, clock: () => Date = () => new Date(),
  batchId: BarcelonaIdentityBatchId = "first-five",
): Promise<AtomicMatchResult> {
  // Existing callers keep their closed policy and stricter numeric-margin contract.
  try {
    const batch = getBarcelonaIdentityBatch(batchId)
    return await persistPlayerIdentityWithPolicy(db, prepared, { ...batch.evidence, apiTeamId: 529, targets: batch.targets }, clock)
  } catch (error) { return { status: "VALIDATION_FAILURE", playerId: prepared.identity.id, providerId: prepared.providerId,
    clubId: prepared.identity.clubId, diagnostic: failureDiagnostic(error, "AUTHORIZATION", "NOT_STARTED") } }
}

// ONE transaction implementation shared by the legacy pilots and guarded club adapter.
export async function persistPlayerIdentityWithPolicy(
  db: Pick<PrismaClient, "$transaction">, prepared: AtomicIdentityMatch, policy: AtomicIdentityPolicy,
  clock: () => Date = () => new Date(),
): Promise<AtomicMatchResult> {
  const m = structuredClone(prepared)
  const pin = { ...policy, targets: structuredClone(policy.targets), validUntil: policy.validUntil && new Date(policy.validUntil) }
  const progress: { stage: "read" | "update" | "attempt" | "commit" } = { stage: "read" }
  let stage: IdentityWriteStage = "AUTHORIZATION", transactionState: IdentityTransactionState = "NOT_STARTED"
  let entered = false, callbackReturned = false
  const events: IdentityWriteEvent[] = []
  const emit = (event: IdentityWriteEvent["event"], detail = diagnostic(stage, "OK", transactionState)) =>
    emitIdentityEvent(events, pin.onEvent, event, detail)
  const result = (status: AtomicMatchStatus, code: IdentityWriteCode = "OK"): AtomicMatchResult =>
    ({ status, playerId: m.identity.id, providerId: m.providerId, clubId: m.identity.clubId, diagnostic: diagnostic(stage, code, transactionState) })
  const abort = (status: AtomicMatchStatus, code: IdentityWriteCode): never => { throw new AtomicAbort(status, diagnostic(stage, code, transactionState)) }
  emit("START")
  try {
    validate(m, clock(), pin, transactionState)
    emit("VALIDATION_PASS")
    stage = "TRANSACTION_BEGIN"
    const completed = await db.$transaction(async tx => {
      entered = true; transactionState = "STARTED"; emit("TRANSACTION_STARTED")
      // Even an early validation return completes a read-only transaction, not a rollback.
      const outcome = await (async () => {
      stage = "PLAYER_RELOAD"
      const p = await tx.player.findUnique({ where: { id: m.identity.id }, select: {
        id: true, slug: true, externalId: true, name: true, dateOfBirth: true, nationality: true, position: true, secondaryPositions: true,
        clubId: true, updatedAt: true, apiFootballId: true, club: { select: { name: true, apiFootballId: true } },
      } })
      if (!p) return result("VALIDATION_FAILURE", "PLAYER_NOT_FOUND")
      stage = "IDENTITY_VALIDATION"
      if (p.apiFootballId !== null && p.apiFootballId !== m.providerId) return result("CONFLICT_PLAYER_ALREADY_HAS_OTHER_ID", "PLAYER_ALREADY_ASSOCIATED")
      stage = "PROVIDER_OWNERSHIP"
      const owner = await tx.player.findUnique({ where: { apiFootballId: m.providerId }, select: { id: true } })
      if (owner && owner.id !== p.id) return result("CONFLICT_PROVIDER_ID_TAKEN", "PROVIDER_ALREADY_OWNED")
      stage = "ATTEMPT_VALIDATION"
      const attempt = await tx.apiFootballPlayerMatchAttempt.findUnique({ where: { playerId: p.id } })
      const { apiFootballId, updatedAt, ...identity } = p
      const { updatedAt: expectedUpdatedAt, ...expectedIdentity } = m.identity
      stage = "IDENTITY_VALIDATION"
      if (!isDeepStrictEqual(identity, expectedIdentity)) return result("VALIDATION_FAILURE", "PLAYER_STATE_CHANGED")
      stage = "ATTEMPT_VALIDATION"
      if (apiFootballId === m.providerId) {
        // Do not silently repair partial legacy associations or overwrite their attempts.
        return attempt?.status === "matched" && attempt.lastApiFootballId === m.providerId
          ? result("ALREADY_MATCHED_SAME_ID") : result("VALIDATION_FAILURE", "ATTEMPT_STATE_CHANGED")
      }
      if (attempt) return result("VALIDATION_FAILURE", "ATTEMPT_STATE_CHANGED") // Pristine baseline, even if retry is due.
      stage = "EXPECTED_UPDATED_AT"
      if (updatedAt.getTime() !== expectedUpdatedAt.getTime()) return result("CONCURRENT_MODIFICATION", "EXPECTED_UPDATED_AT_MISMATCH")

      // Recheck the small immutable evidence pins inside the transaction as defense against TOCTOU.
      stage = "CACHE_VALIDATION"
      const cache = await tx.$queryRawUnsafe<{ hash: string; expiresAt: Date }[]>(
        'SELECT md5(to_jsonb(t)::text) AS hash, "expiresAt" FROM "ApiFootballTeamRosterCache" t WHERE id = $1', pin.cacheId)
      stage = "SNAPSHOT_VALIDATION"
      const snapshot = pin.snapshotId ? await tx.clubOfficialLineupSnapshot.findUnique({ where: { id: pin.snapshotId },
        select: { contentHash: true, clubId: true, teamExternalId: true } }) : null
      stage = "CACHE_VALIDATION"
      if (cache[0]?.hash !== m.cacheRowHash) abort("VALIDATION_FAILURE", "CACHE_HASH_MISMATCH")
      if (cache[0]?.expiresAt.getTime() !== m.cacheExpiresAt.getTime()) abort("VALIDATION_FAILURE", "CACHE_INVALID")
      stage = "SNAPSHOT_VALIDATION"
      if (pin.snapshotId ? !snapshot || snapshot.contentHash !== m.snapshotHash || snapshot.clubId !== m.identity.clubId ||
            snapshot.teamExternalId !== pin.apiTeamId : m.snapshotHash !== null) abort("VALIDATION_FAILURE", "SNAPSHOT_MISMATCH")
      stage = "MATCHER_REVALIDATION"
      await pin.revalidate?.(tx, m, clock())
      validate(m, clock(), pin, transactionState) // Waiting must not extend cache validity.
      emit("VALIDATION_PASS")
      progress.stage = "update"
      stage = "CONDITIONAL_UPDATE"
      const changed = await tx.player.updateMany({ where: { id: p.id, apiFootballId: null, clubId: p.clubId, updatedAt },
        data: { apiFootballId: m.providerId } })
      if (changed.count !== 1) abort("CONCURRENT_MODIFICATION", "CONDITIONAL_UPDATE_ZERO_ROWS")
      emit("UPDATE_PASS")
      progress.stage = "attempt"
      stage = "ATTEMPT_CREATE"
      await tx.apiFootballPlayerMatchAttempt.create({ data: {
        playerId: p.id, status: "matched", attempts: 1, lastApiFootballId: m.providerId,
        lastConfidence: m.confidence, lastNameScore: m.nameScore, lastBirthMatches: m.birthMatches,
        lastNationalityMatches: m.nationalityMatches, lastClubMatches: m.clubMatches,
        lastReason: "API-Football identity pilot: AUTO_MATCH; atomic association.", lastTriedAt: clock(), nextRetryAt: null,
      } })
      emit("ATTEMPT_PASS")
      stage = "POST_WRITE_VALIDATION"
      validate(m, clock(), pin, transactionState, true) // Expiry also rolls back both records.
      progress.stage = "commit"
      stage = "COMMIT"
      return result("MATCHED")
      })()
      callbackReturned = true
      return outcome
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 })
    transactionState = "COMMIT_CONFIRMED"
    const detail = { ...completed.diagnostic!, transactionState }
    emit(completed.status === "MATCHED" || completed.status === "ALREADY_MATCHED_SAME_ID" ? "COMMIT_CONFIRMED" : "FAILED", detail)
    return { ...completed, diagnostic: detail, events }
  } catch (error) {
    // Catch OUTSIDE $transaction, so a failed attempt cannot commit the Player update.
    const code = codeOf(error)
    // Preserve the previous status/STOP precedence exactly; diagnostics are additive.
    const status: AtomicMatchStatus = error instanceof AtomicAbort ? error.status :
      code === "P2034" || code === "40001" || code === "40P01" ? "CONCURRENT_MODIFICATION" :
      code === "P2002" && progress.stage === "update" ? "CONFLICT_PROVIDER_ID_TAKEN" :
      progress.stage === "attempt" ? "ATTEMPT_FAILURE" : progress.stage === "commit" ? "INDETERMINATE_COMMIT" : "VALIDATION_FAILURE"
    const classified = failureDiagnostic(error, stage, transactionState)
    const connection = classified.code === "CONNECTION_FAILURE"
    transactionState = callbackReturned && classified.code !== "SERIALIZATION_FAILURE" ? "COMMIT_INDETERMINATE" :
      entered ? connection ? "ROLLBACK_UNCONFIRMED" : "ROLLED_BACK" :
        stage === "TRANSACTION_BEGIN" && code !== "P2024" ? "START_UNCONFIRMED" : "NOT_STARTED"
    const detail = transactionState === "COMMIT_INDETERMINATE"
      ? { ...diagnostic("COMMIT", "INDETERMINATE_COMMIT", transactionState, safeOriginalCode(error)),
        ...(classified.codeChain ? { codeChain: classified.codeChain } : {}) }
      : { ...classified, transactionState }
    emit("FAILED", detail)
    return { ...result(status), diagnostic: detail, events }
  }
}
