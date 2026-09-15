// Closed vocabulary only. Never serialize an Error, its message, meta, stack or SQL.
export type IdentityWriteStage = "AUTHORIZATION" | "PREFLIGHT" | "TRANSACTION_BEGIN" |
  "PLAYER_RELOAD" | "IDENTITY_VALIDATION" | "PROVIDER_OWNERSHIP" | "ATTEMPT_VALIDATION" |
  "EXPECTED_UPDATED_AT" | "CACHE_VALIDATION" | "SNAPSHOT_VALIDATION" | "MATCHER_REVALIDATION" |
  "CONDITIONAL_UPDATE" | "ATTEMPT_CREATE" | "POST_WRITE_VALIDATION" | "COMMIT" |
  "GLOBAL_AUDIT" | "CLUB_BOUNDARY_AUDIT" | "CLIENT_CLEANUP"
export type IdentityTransactionState = "NOT_STARTED" | "STARTED" | "ROLLED_BACK" |
  "ROLLBACK_UNCONFIRMED" | "START_UNCONFIRMED" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"

export const identityWriteReasons = {
  OK: "operation completed", NOT_EXECUTED: "candidate was not executed",
  AUTHORIZATION_MISMATCH: "authorization did not match", AUTHORIZATION_EXPIRED: "authorization expired",
  GIT_GATE_FAILED: "Git gate failed", PLAYER_NOT_FOUND: "player not found",
  PLAYER_STATE_CHANGED: "player identity changed", PLAYER_ALREADY_ASSOCIATED: "player already has another provider",
  PROVIDER_ALREADY_OWNED: "provider already owned", ATTEMPT_STATE_CHANGED: "attempt state changed",
  EXPECTED_UPDATED_AT_MISMATCH: "expectedUpdatedAt changed", INVALID_IDENTITY: "invalid identity fields",
  CLUB_IDENTITY_MISMATCH: "club identity did not match", CACHE_HASH_MISMATCH: "cache hash changed",
  CACHE_INVALID: "cache missing, invalid or expired", SNAPSHOT_MISMATCH: "snapshot evidence did not match",
  MATCHER_NOT_AUTO_MATCH: "matcher did not satisfy automatic matching gates", CANDIDATE_CHANGED: "selected candidate changed",
  MATCHER_CONFLICT: "matcher reported a conflict",
  DRY_RUN_HASH_MISMATCH: "dry-run preparation changed", STATE_CHANGED: "state changed during revalidation",
  CONDITIONAL_UPDATE_ZERO_ROWS: "conditional update did not affect exactly one row",
  SERIALIZATION_FAILURE: "transaction serialization conflict", TRANSACTION_TIMEOUT: "transaction timeout reported by database client",
  TRANSACTION_ERROR: "transaction API error without a confirmed timeout", UNIQUE_VIOLATION: "unique constraint violation",
  CONNECTION_FAILURE: "database connection failure", DATABASE_ERROR: "database reported an error",
  AUDIT_MISMATCH: "integrity audit did not match", INVALID_PERSISTENCE_RESULT: "persistence returned unexpected identifiers",
  INDETERMINATE_COMMIT: "commit acknowledgement is indeterminate", UNKNOWN_FAILURE: "unclassified failure; raw details withheld",
} as const
export type IdentityWriteCode = keyof typeof identityWriteReasons
export type IdentityWriteDiagnostic = {
  stage: IdentityWriteStage; gate: string; code: IdentityWriteCode; reason: string
  transactionState: IdentityTransactionState; originalCode?: string; codeChain?: string[]
}
export type IdentityWriteEvent = IdentityWriteDiagnostic & {
  timestamp: string; event: "START" | "VALIDATION_PASS" | "TRANSACTION_STARTED" | "UPDATE_PASS" |
    "ATTEMPT_PASS" | "COMMIT_CONFIRMED" | "FAILED" | "AUDIT_START" | "AUDIT_PASS"
}
export type IdentityWriteObserver = (event: IdentityWriteEvent) => void
export function diagnostic(stage: IdentityWriteStage, code: IdentityWriteCode, transactionState: IdentityTransactionState,
  originalCode?: string): IdentityWriteDiagnostic {
  return { stage, gate: code, code, reason: identityWriteReasons[code], transactionState, ...(originalCode ? { originalCode } : {}) }
}
// message remains a closed legacy label, preserving existing catch/STOP decisions.
export class IdentityWriteDiagnosticError extends Error {
  constructor(readonly diagnostic: IdentityWriteDiagnostic, legacyMessage: string = diagnostic.code) { super(legacyMessage) }
}
const knownMessages: Record<string, [IdentityWriteStage, IdentityWriteCode]> = {
  GIT_GATE_FAILED: ["AUTHORIZATION", "GIT_GATE_FAILED"], GIT_CHANGED: ["AUTHORIZATION", "GIT_GATE_FAILED"],
  AUTHORIZATION_MISMATCH: ["AUTHORIZATION", "AUTHORIZATION_MISMATCH"],
  EXPLICIT_MULTI_CLUB_AUTHORIZATION_REQUIRED: ["AUTHORIZATION", "AUTHORIZATION_MISMATCH"],
  MULTI_CLUB_ALLOWLIST_MISMATCH: ["AUTHORIZATION", "AUTHORIZATION_MISMATCH"],
  AUTHORIZATION_EXPIRED: ["AUTHORIZATION", "AUTHORIZATION_EXPIRED"],
  MATCHER_NOT_AUTO_MATCH: ["MATCHER_REVALIDATION", "MATCHER_NOT_AUTO_MATCH"],
  CANDIDATE_CHANGED: ["MATCHER_REVALIDATION", "CANDIDATE_CHANGED"],
  CONFLICT: ["MATCHER_REVALIDATION", "MATCHER_CONFLICT"],
  COMPLETED_IDENTITY_CHANGED: ["IDENTITY_VALIDATION", "PLAYER_STATE_CHANGED"],
  PLAYER_BASELINE_CHANGED: ["IDENTITY_VALIDATION", "PLAYER_STATE_CHANGED"],
  STATE_OR_AUDIT_CHANGED: ["GLOBAL_AUDIT", "STATE_CHANGED"], STATE_CHANGED_IN_TRANSACTION: ["MATCHER_REVALIDATION", "STATE_CHANGED"],
  BASELINE_CHANGED: ["PREFLIGHT", "STATE_CHANGED"], CLUB_ORDER_MISMATCH: ["PREFLIGHT", "CLUB_IDENTITY_MISMATCH"],
  CLUB_IDENTITY_MISMATCH: ["IDENTITY_VALIDATION", "CLUB_IDENTITY_MISMATCH"],
  CACHE_HASH_CHANGED: ["CACHE_VALIDATION", "CACHE_HASH_MISMATCH"], VALID_ROSTER_REQUIRED: ["CACHE_VALIDATION", "CACHE_INVALID"],
  INVALID_ROSTER_OR_BUDGET: ["CACHE_VALIDATION", "CACHE_INVALID"], INVALID_ROSTER: ["CACHE_VALIDATION", "CACHE_INVALID"],
  INVALID_ROSTER_BIRTH: ["CACHE_VALIDATION", "CACHE_INVALID"], DUPLICATE_ROSTER_PROVIDER: ["CACHE_VALIDATION", "CACHE_INVALID"],
  INVALID_ROSTER_STATISTICS: ["CACHE_VALIDATION", "CACHE_INVALID"],
  SNAPSHOT_REQUIRED: ["SNAPSHOT_VALIDATION", "SNAPSHOT_MISMATCH"], INVALID_SNAPSHOT: ["SNAPSHOT_VALIDATION", "SNAPSHOT_MISMATCH"],
  INVALID_LOCAL_IDENTITY: ["IDENTITY_VALIDATION", "INVALID_IDENTITY"],
  IDENTITY_WRITE_AUDIT_FAILED: ["GLOBAL_AUDIT", "AUDIT_MISMATCH"],
  PROVIDER_OR_ATTEMPT_UNIQUENESS_FAILED: ["GLOBAL_AUDIT", "AUDIT_MISMATCH"], AUDIT_MISMATCH: ["GLOBAL_AUDIT", "AUDIT_MISMATCH"],
  INVALID_PERSISTENCE_RESULT: ["COMMIT", "INVALID_PERSISTENCE_RESULT"],
}
// Preserve each existing gate label, even where several share a diagnostic category.
for (const gate of ["INVALID_PREPARATION_POLICY", "CLUB_LIMIT", "DUPLICATE_CLUB", "INVALID_BATCH_HASH", "INVALID_CLUB_EVIDENCE",
  "INVALID_CANDIDATE", "LOCAL_ORDER_MISMATCH", "PER_CLUB_LIMIT", "LOCAL_TOP_SET_MISMATCH", "GLOBAL_OWNERSHIP_CONFLICT",
  "GLOBAL_POOL_ORDER_MISMATCH", "GLOBAL_LIMIT", "GLOBAL_SELECTION_MISMATCH", "INVALID_REVALIDATION_DEFERRED",
  "SELECTION_ORDER_MISMATCH", "CLUB_SELECTED_MISMATCH", "CLUB_DEFERRED_MISMATCH", "EXECUTION_ORDER_MISMATCH", "EXECUTION_SET_MISMATCH",
  "INVALID_ENVELOPE_CONTEXT", "INVALID_CANONICAL_VALUE", "INVALID_PREFLIGHT_PINS"])
  knownMessages[gate] = ["AUTHORIZATION", "AUTHORIZATION_MISMATCH"]
for (const gate of ["BATCH_NOT_PREPARABLE", "BATCH_EVIDENCE_MISMATCH", "CLUB_NOT_READY", "CLUB_EVIDENCE_MISMATCH", "PREPARATION_HASH_MISMATCH"])
  knownMessages[gate] = ["PREFLIGHT", "DRY_RUN_HASH_MISMATCH"]
for (const gate of ["AUTO_CANDIDATE_NOT_ELIGIBLE", "CANDIDATE_SETS_CHANGED_NEW_REVIEW_REQUIRED", "LLORENTE_REGRESSION"])
  knownMessages[gate] = ["MATCHER_REVALIDATION", "CANDIDATE_CHANGED"]
for (const gate of ["READ_ONLY_AUDIT_MISMATCH", "FINAL_AUDIT_MISMATCH", "READ_ONLY_REQUIRED", "READ_ONLY_TRANSACTION_DID_NOT_ROLL_BACK"])
  knownMessages[gate] = ["GLOBAL_AUDIT", "AUDIT_MISMATCH"]
knownMessages.CACHE_OR_CLUB_PIN_MISMATCH = ["PREFLIGHT", "STATE_CHANGED"]
knownMessages.RELEVANT_PLAYERS_BUDGET_EXCEEDED = ["PREFLIGHT", "INVALID_IDENTITY"]
knownMessages.INVALID_CLUB_IDENTITY_CONFIG = ["PREFLIGHT", "AUTHORIZATION_MISMATCH"]
const originalCodes = new Set(["P1000", "P1001", "P1002", "P1008", "P1017", "P2002", "P2010", "P2024", "P2028", "P2034", "P2039",
  "40001", "40P01", "23505", "57014", "08000", "08003", "08006", "57P01", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"])
export function safeOriginalCode(error: unknown): string | undefined {
  const c = error && typeof error === "object" && "code" in error ? error.code : undefined
  return typeof c === "string" && originalCodes.has(c) ? c : undefined
}
function safeCodeChain(error: unknown): string[] {
  const field = (value: unknown, key: string): unknown => value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key] : undefined
  const meta = field(error, "meta"), adapter = field(meta, "driverAdapterError")
  // Closed Prisma/raw-query/driver cause paths, no arbitrary recursive serialization.
  return [...new Set([safeOriginalCode(error), field(meta, "code"), field(meta, "originalCode"),
    field(field(adapter, "cause"), "originalCode"), field(field(error, "cause"), "originalCode")]
    .filter((c): c is string => typeof c === "string" && originalCodes.has(c)))]
}
export function failureDiagnostic(error: unknown, stage: IdentityWriteStage, state: IdentityTransactionState): IdentityWriteDiagnostic {
  if (error instanceof IdentityWriteDiagnosticError) return { ...error.diagnostic, transactionState: state }
  const message = error instanceof Error ? error.message : undefined
  const known = message && Object.hasOwn(knownMessages, message) ? knownMessages[message] : undefined
  if (known) return { ...diagnostic(stage === "CLUB_BOUNDARY_AUDIT" ? stage : known[0], known[1], state), gate: message! }
  const original = safeOriginalCode(error)
  const codeChain = safeCodeChain(error)
  const effective = codeChain.at(-1) ?? original
  let code: IdentityWriteCode = "UNKNOWN_FAILURE"
  if (effective) {
    code = "DATABASE_ERROR"
    if (["P2034", "40001", "40P01"].includes(effective)) code = "SERIALIZATION_FAILURE"
    else if (["P2002", "23505"].includes(effective)) code = "UNIQUE_VIOLATION"
    else if (["P1000", "P1001", "P1002", "P1017", "08000", "08003", "08006", "57P01", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(effective)) code = "CONNECTION_FAILURE"
    else if (effective === "P2028") {
      // P2028 also means non-timeout transaction errors. Inspect only; never return this text.
      const meta = error && typeof error === "object" && "meta" in error ? error.meta : undefined
      const detail = meta && typeof meta === "object" && "error" in meta ? meta.error : message
      code = typeof detail === "string" && /expired transaction|transaction (?:has )?timed out|transaction timeout exceeded/i.test(detail)
        ? "TRANSACTION_TIMEOUT" : "TRANSACTION_ERROR"
    }
  }
  return { ...diagnostic(stage, code, state, original), ...(codeChain.length ? { codeChain } : {}) }
}
export function emitIdentityEvent(events: IdentityWriteEvent[], observer: IdentityWriteObserver | undefined,
  event: IdentityWriteEvent["event"], detail: IdentityWriteDiagnostic) {
  const entry = { ...detail, ...(detail.codeChain ? { codeChain: [...detail.codeChain] } : {}), timestamp: new Date().toISOString(), event }
  events.push(entry)
  // Observability must not become a new failure/retry policy or mutate the stored report.
  try { observer?.({ ...entry, ...(entry.codeChain ? { codeChain: [...entry.codeChain] } : {}) }) } catch { /* logging is non-throwing */ }
}
